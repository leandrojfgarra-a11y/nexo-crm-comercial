-- Complementa public.sellers para cadastro comercial e regras futuras de comissão.
-- Não altera vínculos existentes nem gera valores de comissão.
begin;

do $$ begin
  if to_regclass('public.sellers') is null or to_regclass('auth.users') is null then
    raise exception 'Tabelas public.sellers e auth.users são necessárias antes desta migration.';
  end if;
end $$;

alter table public.sellers add column if not exists seller_type text;
alter table public.sellers add column if not exists user_id uuid;
alter table public.sellers add column if not exists installation_commission_percent numeric(5,2) not null default 0;
alter table public.sellers add column if not exists monthly_commission_percent numeric(5,2) not null default 0;
alter table public.sellers add column if not exists monthly_commission_mode text not null default 'single';
alter table public.sellers add column if not exists monthly_commission_competencies smallint;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.sellers'::regclass and conname='sellers_seller_type_check') then
    alter table public.sellers add constraint sellers_seller_type_check check (seller_type is null or seller_type in ('internal','external'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.sellers'::regclass and conname='sellers_user_internal_only_check') then
    alter table public.sellers add constraint sellers_user_internal_only_check check (user_id is null or coalesce(seller_type='internal',false));
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.sellers'::regclass and conname='sellers_installation_commission_check') then
    alter table public.sellers add constraint sellers_installation_commission_check check (installation_commission_percent between 0 and 100);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.sellers'::regclass and conname='sellers_monthly_commission_check') then
    alter table public.sellers add constraint sellers_monthly_commission_check check (monthly_commission_percent between 0 and 100);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.sellers'::regclass and conname='sellers_monthly_commission_mode_check') then
    alter table public.sellers add constraint sellers_monthly_commission_mode_check check (monthly_commission_mode in ('single','recurring'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.sellers'::regclass and conname='sellers_monthly_commission_competencies_check') then
    alter table public.sellers add constraint sellers_monthly_commission_competencies_check check (
      (monthly_commission_mode='single' and monthly_commission_competencies is null) or
      (monthly_commission_mode='recurring' and monthly_commission_competencies between 1 and 120)
    );
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.sellers'::regclass and conname='sellers_user_id_fkey') then
    alter table public.sellers add constraint sellers_user_id_fkey foreign key(user_id) references auth.users(id) on delete set null;
  end if;
end $$;

create index if not exists sellers_user_id_idx on public.sellers(user_id) where user_id is not null;

commit;
