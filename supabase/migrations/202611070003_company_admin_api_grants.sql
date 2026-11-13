-- Privilégios mínimos para a API administrativa do Nexo consultar empresas,
-- criar uma empresa e vincular convites. RLS continua ativa para authenticated.
begin;

do $$ begin
  if to_regclass('public.crm_companies') is null
     or to_regclass('public.crm_company_members') is null then
    raise exception 'Aplique primeiro a migration 202611070002_company_isolation.sql.';
  end if;
end $$;

grant select, insert on public.crm_companies to service_role;
grant select, insert, update on public.crm_company_members to service_role;

commit;
