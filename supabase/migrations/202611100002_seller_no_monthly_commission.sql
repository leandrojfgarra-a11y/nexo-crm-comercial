-- Permite configurar vendedor sem comissão sobre mensalidade.
-- Preserva os vendedores existentes; o modo sem comissão grava percentual zero e competências nulas.
begin;

do $$ begin
  if to_regclass('public.sellers') is null then
    raise exception 'A tabela public.sellers não existe; aplique primeiro a migration comercial de vendedores.';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='sellers' and column_name='monthly_commission_mode')
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='sellers' and column_name='monthly_commission_competencies') then
    raise exception 'Aplique primeiro a migration 202610310007_seller_commercial_profile.sql.';
  end if;
end $$;

alter table public.sellers
  drop constraint if exists sellers_monthly_commission_mode_check;
alter table public.sellers
  add constraint sellers_monthly_commission_mode_check
  check (monthly_commission_mode in ('none','single','recurring'));

alter table public.sellers
  drop constraint if exists sellers_monthly_commission_competencies_check;
alter table public.sellers
  add constraint sellers_monthly_commission_competencies_check check (
    (monthly_commission_mode in ('none','single') and monthly_commission_competencies is null) or
    (monthly_commission_mode='recurring' and monthly_commission_competencies between 1 and 120)
  );

comment on column public.sellers.monthly_commission_mode is
  'Define se há comissão sobre mensalidade: none, single ou recurring.';

commit;
