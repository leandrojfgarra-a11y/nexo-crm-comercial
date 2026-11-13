-- Meta mensal por quantidade de vendas WON com valor de instalação positivo.
-- A retenção de 12% é calculada no CRM sobre a comissão bruta prevista;
-- não altera os valores comerciais nem os registros históricos de vendas.
begin;

do $$ begin
  if to_regclass('public.sellers') is null or to_regprocedure('public.is_crm_admin()') is null then
    raise exception 'A tabela public.sellers e a função public.is_crm_admin() são necessárias.';
  end if;
end $$;

alter table public.sellers
  add column if not exists monthly_installation_goal_count integer not null default 0;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.sellers'::regclass
      and conname='sellers_monthly_installation_goal_count_check'
  ) then
    alter table public.sellers
      add constraint sellers_monthly_installation_goal_count_check
      check (monthly_installation_goal_count between 0 and 1000000);
  end if;
end $$;

comment on column public.sellers.monthly_installation_goal_count is
  'Meta mensal do vendedor: quantidade de vendas WON com valor de instalação maior que zero.';

-- Mantém as políticas RLS e grants atuais da tabela sellers.
commit;
