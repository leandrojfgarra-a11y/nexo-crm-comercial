-- Complemento para Clientes/Leads. Requer 202610290001_initial_schema.sql aplicada;
-- ela cria people/customers/leads e products (referenciada pelo interesse do lead).
-- Executar manualmente somente depois de confirmar a existência dessas tabelas.
-- Esta migration não foi executada. Campos novos são opcionais para preservar os dados existentes.
begin;

do $$ begin
  if to_regclass('public.people') is null
     or to_regclass('public.customers') is null
     or to_regclass('public.leads') is null
     or to_regclass('public.products') is null then
    raise exception 'Schema base NEXO incompleto: aplique/confirme a migration inicial (people, customers, leads e products) antes deste complemento.';
  end if;
end $$;

alter table public.people add column if not exists whatsapp text;
alter table public.leads add column if not exists interest_product_id uuid;
alter table public.leads add column if not exists notes text;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.leads'::regclass
      and conname = 'leads_interest_product_id_fkey'
  ) then
    alter table public.leads add constraint leads_interest_product_id_fkey
      foreign key (interest_product_id) references public.products(id) on delete set null;
  end if;
end $$;

-- CPF/CNPJ enviados pela aplicação são normalizados em dígitos antes de gravar.
-- Se já houver duplicatas, os índices únicos abaixo falham sem excluir/alterar dados;
-- revise esses registros manualmente antes de aplicar esta migration.
do $$ begin
  if exists (
    select 1 from public.people
    where tax_id is not null and tax_id <> ''
    group by tax_id having count(*) > 1
  ) then
    raise exception 'Há CPF/CNPJ duplicados em people.tax_id; revise os registros antes de criar o índice único.';
  end if;
  if exists (
    select 1 from public.customers
    group by person_id having count(*) > 1
  ) then
    raise exception 'Há mais de um vínculo em customers para a mesma pessoa; revise antes de criar o índice único.';
  end if;
end $$;

create unique index if not exists people_tax_id_unique_idx
  on public.people (tax_id) where tax_id is not null and tax_id <> '';
create unique index if not exists customers_person_unique_idx
  on public.customers (person_id);
create index if not exists leads_interest_product_idx
  on public.leads (interest_product_id);

commit;
