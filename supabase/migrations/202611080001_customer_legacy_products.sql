-- Campos de referência histórica e produtos contratados por cliente.
-- Não cria leads, oportunidades ou contratos e não importa dados.
-- Execute manualmente somente depois de revisar e confirmar o schema no Supabase NEXO.
begin;

do $$ begin
  if to_regclass('public.customers') is null
     or to_regclass('public.people') is null
     or to_regclass('public.products') is null
     or to_regclass('public.crm_companies') is null
     or to_regprocedure('public.current_crm_company_id()') is null
     or to_regprocedure('public.set_crm_company_id()') is null
     or to_regprocedure('public.is_crm_admin()') is null then
    raise exception 'A migration exige clientes, pessoas, produtos e isolamento de empresas do NEXO já aplicados.';
  end if;
end $$;

do $$ begin
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='customers' and column_name='company_id')
     or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='people' and column_name='company_id')
     or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='products' and column_name='company_id') then
    raise exception 'A migration de isolamento de empresas precisa estar aplicada em clientes, pessoas e produtos.';
  end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='people' and column_name='whatsapp')
     or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='people' and column_name='state_registration')
     or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='people' and column_name='opened_at')
     or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='customers' and column_name='source') then
    raise exception 'Aplique primeiro as migrations de cadastro completo do NEXO.';
  end if;
end $$;

alter table public.customers add column if not exists monthly_fee numeric(14,2);
alter table public.customers add column if not exists billing_day smallint;
alter table public.customers add column if not exists legacy_code text;
alter table public.customers add column if not exists legacy_contract_status text;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.customers'::regclass and conname='customers_monthly_fee_nonnegative_check') then
    alter table public.customers add constraint customers_monthly_fee_nonnegative_check check (monthly_fee is null or monthly_fee >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.customers'::regclass and conname='customers_billing_day_check') then
    alter table public.customers add constraint customers_billing_day_check check (billing_day is null or billing_day between 1 and 31);
  end if;
end $$;

create table if not exists public.customer_products (
  company_id uuid not null references public.crm_companies(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  primary key (company_id, customer_id, product_id)
);
create index if not exists customer_products_product_idx on public.customer_products(company_id, product_id);

alter table public.customer_products enable row level security;
drop policy if exists crm_admin_customer_products on public.customer_products;
create policy crm_admin_customer_products on public.customer_products for all to authenticated
  using (public.is_crm_admin() and company_id = public.current_crm_company_id())
  with check (public.is_crm_admin() and company_id = public.current_crm_company_id());
grant select, insert, update, delete on public.customer_products to authenticated;
revoke all on public.customer_products from anon;

drop trigger if exists customer_products_set_company on public.customer_products;
create trigger customer_products_set_company before insert or update on public.customer_products
  for each row execute function public.set_crm_company_id();

create or replace function public.validate_customer_products_company()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public
as $$
begin
  if not exists(select 1 from public.customers c where c.id=new.customer_id and c.company_id=new.company_id)
     or not exists(select 1 from public.products p where p.id=new.product_id and p.company_id=new.company_id) then
    raise exception 'Cliente e produto precisam pertencer à empresa atual.';
  end if;
  return new;
end;
$$;
revoke all on function public.validate_customer_products_company() from public, anon, authenticated;
drop trigger if exists customer_products_validate_company on public.customer_products;
create trigger customer_products_validate_company before insert or update on public.customer_products
  for each row execute function public.validate_customer_products_company();

-- Grava lote inteiro em uma única chamada/transação. O endpoint da aplicação
-- limita o lote e valida CPF/CNPJ antes de chamar esta função.
create or replace function public.import_historical_customers(p_rows jsonb)
returns integer language plpgsql
set search_path = pg_catalog, public, auth
as $$
declare
  row_count integer;
  inserted_count integer := 0;
  item jsonb;
  person_id uuid;
  customer_id uuid;
  tax text;
  product_id uuid;
begin
  if not public.is_crm_admin() then raise exception 'Acesso administrativo obrigatório.'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'Lote inválido.'; end if;
  row_count := jsonb_array_length(p_rows);
  if row_count < 1 or row_count > 25 then raise exception 'Importe entre 1 e 25 clientes por lote.'; end if;

  for item in select value from jsonb_array_elements(p_rows) loop
    tax := nullif(btrim(item->>'tax_id'), '');
    if length(btrim(coalesce(item->>'name',''))) < 2 then raise exception 'Razão social/nome ausente.'; end if;
    if coalesce(item->>'kind','') not in ('individual','company') or coalesce(item->>'status','') not in ('active','inactive') then raise exception 'Tipo ou situação inválida.'; end if;
    if tax is not null and exists(select 1 from public.people p where p.tax_id=tax) then raise exception 'Documento já cadastrado: %.', tax; end if;
    if nullif(item->>'monthly_fee','') is not null and (item->>'monthly_fee')::numeric < 0 then raise exception 'Mensalidade inválida.'; end if;

    insert into public.people(kind,name,trade_name,tax_id,email,phone,whatsapp,postal_code,address_line,address_number,address_extra,district,city,state,state_registration,primary_cnae,registration_status,opened_at)
    values (
      item->>'kind', btrim(item->>'name'), nullif(btrim(item->>'trade_name'),''), tax,
      nullif(lower(btrim(item->>'email')),''), nullif(btrim(item->>'phone'),''), nullif(btrim(item->>'whatsapp'),''),
      nullif(regexp_replace(coalesce(item->>'postal_code',''),'\D','','g'),''), nullif(btrim(item->>'address_line'),''),
      nullif(btrim(item->>'address_number'),''), nullif(btrim(item->>'address_extra'),''), nullif(btrim(item->>'district'),''),
      nullif(btrim(item->>'city'),''), nullif(upper(btrim(item->>'state')),''), nullif(btrim(item->>'state_registration'),''),
      nullif(btrim(item->>'primary_cnae'),''), nullif(btrim(item->>'registration_status'),''), nullif(item->>'opened_at','')::date
    ) returning id into person_id;

    insert into public.customers(person_id,status,source,monthly_fee,billing_day,legacy_code,legacy_contract_status)
    values (person_id,item->>'status','Importação histórica · Clientes Garra',nullif(item->>'monthly_fee','')::numeric,nullif(item->>'billing_day','')::smallint,nullif(btrim(item->>'legacy_code'),''),nullif(btrim(item->>'legacy_contract_status'),''))
    returning id into customer_id;

    for product_id in select product_value::uuid from jsonb_array_elements_text(coalesce(item->'product_ids','[]'::jsonb)) as products(product_value) loop
      insert into public.customer_products(company_id,customer_id,product_id,created_by)
      values (public.current_crm_company_id(),customer_id,product_id,auth.uid());
    end loop;
    inserted_count := inserted_count + 1;
  end loop;
  return inserted_count;
end;
$$;
revoke all on function public.import_historical_customers(jsonb) from public, anon;
grant execute on function public.import_historical_customers(jsonb) to authenticated;

comment on column public.customers.monthly_fee is 'Mensalidade total de referência do cliente; não representa lançamento financeiro.';
comment on column public.customers.legacy_contract_status is 'Status textual legado importado; não substitui contrato cadastrado nem status Clicksign.';
comment on table public.customer_products is 'Produtos contratados pelo cliente; a mensalidade permanece consolidada em customers.monthly_fee.';

commit;
