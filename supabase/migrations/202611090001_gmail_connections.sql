-- Conexão Gmail por empresa. Tokens são cifrados pela aplicação antes da gravação.
-- Esta migration apenas prepara a estrutura; não conecta nem consulta contas Google.
begin;

do $$ begin
  if to_regclass('public.crm_companies') is null
     or to_regclass('public.crm_company_members') is null
     or to_regprocedure('public.current_crm_company_id()') is null
     or to_regprocedure('public.is_crm_admin()') is null then
    raise exception 'Aplique primeiro as migrations de isolamento de empresas e acesso administrativo do NEXO.';
  end if;
end $$;

create table if not exists public.gmail_connections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.crm_companies(id) on delete cascade,
  connected_by uuid not null references auth.users(id) on delete cascade,
  email text not null check (length(btrim(email)) between 3 and 254),
  access_token_encrypted text not null,
  refresh_token_encrypted text not null,
  access_token_expires_at timestamptz not null,
  granted_scopes text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gmail_connections_one_per_company unique (company_id)
);

create index if not exists gmail_connections_connected_by_idx
  on public.gmail_connections(connected_by);

alter table public.gmail_connections enable row level security;
drop policy if exists crm_admin_gmail_connections on public.gmail_connections;
create policy crm_admin_gmail_connections on public.gmail_connections for all to authenticated
  using (public.is_crm_admin() and company_id = public.current_crm_company_id())
  with check (public.is_crm_admin() and company_id = public.current_crm_company_id());
grant select, insert, update, delete on public.gmail_connections to authenticated;
revoke all on public.gmail_connections from anon;

commit;
