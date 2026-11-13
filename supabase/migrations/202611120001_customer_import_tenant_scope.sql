-- Escopa o importador histórico de clientes à empresa do usuário autenticado.
-- Corrige a verificação global de CPF/CNPJ da função original sem modificar dados.
begin;

do $$ begin
  if to_regprocedure('public.current_crm_company_id()') is null
     or to_regprocedure('public.is_crm_admin()') is null
     or to_regclass('public.people') is null
     or to_regclass('public.customers') is null
     or to_regclass('public.customer_products') is null
     or to_regclass('public.products') is null then
    raise exception 'Aplique as migrations de isolamento de empresas e importação histórica antes desta migration.';
  end if;
end $$;

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
  company_id uuid := public.current_crm_company_id();
begin
  if not public.is_crm_admin() then raise exception 'Acesso administrativo obrigatório.'; end if;
  if company_id is null then raise exception 'O usuário não está vinculado a uma empresa ativa.'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'Lote inválido.'; end if;
  row_count := jsonb_array_length(p_rows);
  if row_count < 1 or row_count > 25 then raise exception 'Importe entre 1 e 25 clientes por lote.'; end if;

  for item in select value from jsonb_array_elements(p_rows) loop
    tax := nullif(upper(btrim(item->>'tax_id')), '');
    if length(btrim(coalesce(item->>'name',''))) < 2 then raise exception 'Razão social/nome ausente.'; end if;
    if coalesce(item->>'kind','') not in ('individual', 'company') or coalesce(item->>'status','') not in ('active', 'inactive') then raise exception 'Tipo ou situação inválida.'; end if;
    if tax is not null and exists(select 1 from public.people p where p.company_id=company_id and upper(p.tax_id)=tax) then
      raise exception 'Documento já cadastrado nesta empresa: %.', tax;
    end if;
    if nullif(item->>'monthly_fee','') is not null and (item->>'monthly_fee')::numeric < 0 then raise exception 'Mensalidade inválida.'; end if;

    insert into public.people(company_id,kind,name,trade_name,tax_id,email,phone,whatsapp,postal_code,address_line,address_number,address_extra,district,city,state,state_registration,primary_cnae,registration_status,opened_at)
    values (
      company_id,item->>'kind',btrim(item->>'name'),nullif(btrim(item->>'trade_name'),''),tax,
      nullif(lower(btrim(item->>'email')),''),nullif(btrim(item->>'phone'),''),nullif(btrim(item->>'whatsapp'),''),
      nullif(regexp_replace(coalesce(item->>'postal_code',''),'\D','','g'),''),nullif(btrim(item->>'address_line'),''),
      nullif(btrim(item->>'address_number'),''),nullif(btrim(item->>'address_extra'),''),nullif(btrim(item->>'district'),''),
      nullif(btrim(item->>'city'),''),nullif(upper(btrim(item->>'state')),''),nullif(btrim(item->>'state_registration'),''),
      nullif(btrim(item->>'primary_cnae'),''),nullif(btrim(item->>'registration_status'),''),nullif(item->>'opened_at','')::date
    ) returning id into person_id;

    insert into public.customers(company_id,person_id,status,source,monthly_fee,billing_day,legacy_code,legacy_contract_status)
    values (company_id,person_id,item->>'status','Importação histórica · Clientes Garra',nullif(item->>'monthly_fee','')::numeric,nullif(item->>'billing_day','')::smallint,nullif(btrim(item->>'legacy_code'),''),nullif(btrim(item->>'legacy_contract_status'),''))
    returning id into customer_id;

    for product_id in select product_value::uuid from jsonb_array_elements_text(coalesce(item->'product_ids','[]'::jsonb)) as products(product_value) loop
      if not exists(select 1 from public.products p where p.id=product_id and p.company_id=company_id) then
        raise exception 'Um produto selecionado não pertence à empresa atual.';
      end if;
      insert into public.customer_products(company_id,customer_id,product_id,created_by)
      values (company_id,customer_id,product_id,auth.uid());
    end loop;
    inserted_count := inserted_count + 1;
  end loop;
  return inserted_count;
end;
$$;

revoke all on function public.import_historical_customers(jsonb) from public, anon;
grant execute on function public.import_historical_customers(jsonb) to authenticated;

commit;
