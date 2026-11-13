-- Metas comerciais mensais baseadas nas vendas WON vigentes.
-- Não cria escopo multiempresa: o schema atual é de uma única operação CRM.
begin;

do $$ begin
  if to_regclass('public.sellers') is null
     or to_regclass('public.products') is null
     or to_regclass('public.closed_sale_items') is null
     or to_regclass('public.active_closed_sales') is null
     or to_regprocedure('public.is_crm_admin()') is null then
    raise exception 'Aplique as migrations comerciais e a migration 009 antes de criar metas.';
  end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='active_closed_sales' and column_name='effective_closed_at')
     or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='active_closed_sales' and column_name='cycle_number')
     or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='closed_sale_items' and column_name='cycle_number') then
    raise exception 'A estrutura da migration 009 não contém o ciclo e a data efetiva do fechamento.';
  end if;
end $$;

create table if not exists public.commercial_goals (
  id uuid primary key default gen_random_uuid(),
  period_month date not null,
  goal_type text not null check(goal_type in ('general','seller','product','category')),
  seller_id uuid references public.sellers(id) on delete restrict,
  product_id uuid references public.products(id) on delete restrict,
  category_name text,
  quantity_target integer not null check(quantity_target >= 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commercial_goals_month_start_check check(extract(day from period_month)=1),
  constraint commercial_goals_scope_check check (
    (goal_type='general' and seller_id is null and product_id is null and category_name is null) or
    (goal_type='seller' and seller_id is not null and product_id is null and category_name is null) or
    (goal_type='product' and seller_id is null and product_id is not null and category_name is null) or
    (goal_type='category' and seller_id is null and product_id is null and category_name is not null and length(btrim(category_name)) between 1 and 120)
  )
);

create unique index if not exists commercial_goals_general_unique_idx
  on public.commercial_goals(period_month) where goal_type='general';
create unique index if not exists commercial_goals_seller_unique_idx
  on public.commercial_goals(period_month,seller_id) where goal_type='seller';
create unique index if not exists commercial_goals_product_unique_idx
  on public.commercial_goals(period_month,product_id) where goal_type='product';
create unique index if not exists commercial_goals_category_unique_idx
  on public.commercial_goals(period_month,lower(btrim(category_name))) where goal_type='category';

create or replace function public.set_commercial_goal_updated_at()
returns trigger language plpgsql set search_path=pg_catalog
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists commercial_goals_updated_at on public.commercial_goals;
create trigger commercial_goals_updated_at before update on public.commercial_goals
  for each row execute function public.set_commercial_goal_updated_at();
revoke all on function public.set_commercial_goal_updated_at() from public,anon,authenticated;

alter table public.commercial_goals enable row level security;
drop policy if exists crm_admin_commercial_goals on public.commercial_goals;
create policy crm_admin_commercial_goals on public.commercial_goals for all to authenticated
  using(public.is_crm_admin()) with check(public.is_crm_admin());
grant select,insert,update,delete on public.commercial_goals to authenticated;
revoke all on public.commercial_goals from anon;

commit;
