-- Campos comerciais incrementais do catálogo. Reutiliza public.products e
-- reference_price como preço de venda avulsa; não toca nos vínculos existentes.
begin;

do $$ begin
  if to_regclass('public.products') is null then
    raise exception 'Tabela public.products ausente; aplique primeiro a migration inicial do CRM.';
  end if;
end $$;

alter table public.products add column if not exists internal_code text;
alter table public.products add column if not exists commercial_category text;
alter table public.products add column if not exists default_installation_value numeric(14,2);
alter table public.products add column if not exists default_monthly_value numeric(14,2);
alter table public.products add column if not exists standard_cost numeric(14,2);
alter table public.products add column if not exists billing_mode text not null default 'custom';

alter table public.products drop constraint if exists products_kind_check;
alter table public.products add constraint products_kind_check check (kind in ('product','service','certificate'));

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.products'::regclass and conname='products_default_installation_value_check') then
    alter table public.products add constraint products_default_installation_value_check check (default_installation_value is null or default_installation_value >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.products'::regclass and conname='products_default_monthly_value_check') then
    alter table public.products add constraint products_default_monthly_value_check check (default_monthly_value is null or default_monthly_value >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.products'::regclass and conname='products_standard_cost_check') then
    alter table public.products add constraint products_standard_cost_check check (standard_cost is null or standard_cost >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.products'::regclass and conname='products_billing_mode_check') then
    alter table public.products add constraint products_billing_mode_check check (billing_mode in ('single','monthly','custom'));
  end if;
end $$;

create unique index if not exists products_internal_code_unique_idx
  on public.products (upper(internal_code))
  where internal_code is not null and btrim(internal_code) <> '';

commit;
