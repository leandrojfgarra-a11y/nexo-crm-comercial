-- Filtros salvos da integração de prospecção Casa dos Dados.
-- Dados de empresas não são armazenados por esta tabela; a migration é aditiva.
begin;

do $$ begin
  if to_regprocedure('public.is_crm_admin()') is null then
    raise exception 'A função public.is_crm_admin() precisa existir antes dos filtros de prospecção.';
  end if;
end $$;

create table if not exists public.lead_prospecting_filters (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(btrim(name)) between 2 and 80),
  filters jsonb not null check (jsonb_typeof(filters) = 'object'),
  daily_enabled boolean not null default false,
  last_run_at timestamptz,
  last_opened_through date,
  last_request_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.lead_prospecting_filters
  add column if not exists daily_enabled boolean not null default false,
  add column if not exists last_run_at timestamptz,
  add column if not exists last_opened_through date,
  add column if not exists last_request_id uuid;

create index if not exists lead_prospecting_filters_updated_idx
  on public.lead_prospecting_filters(updated_at desc);

alter table public.lead_prospecting_filters enable row level security;
drop policy if exists crm_admin_lead_prospecting_filters on public.lead_prospecting_filters;
create policy crm_admin_lead_prospecting_filters
  on public.lead_prospecting_filters for all to authenticated
  using (public.is_crm_admin()) with check (public.is_crm_admin());
grant select, insert, update, delete on public.lead_prospecting_filters to authenticated;
revoke all on public.lead_prospecting_filters from anon;

commit;
