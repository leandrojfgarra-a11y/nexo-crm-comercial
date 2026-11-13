-- NEXO CRM: cadastro completo de clientes e contadores independentes.
-- Requer as migrations base e customer/lead fields. Preparada para execução manual.
-- Não remove nem transforma registros existentes.
begin;

do $$ begin
  if to_regclass('public.people') is null or to_regclass('public.customers') is null
     or to_regclass('public.sellers') is null then
    raise exception 'Schema NEXO incompleto: people, customers e sellers são necessários.';
  end if;
end $$;

create table if not exists public.accountants (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'individual' check (kind in ('individual','office')),
  name text not null,
  tax_id text,
  email text,
  phone text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Regra adequada ao tipo, também em uma eventual execução repetida.
alter table public.accountants drop constraint if exists accountants_tax_id_format;
alter table public.accountants add constraint accountants_tax_id_format check (
  tax_id is null or (kind = 'individual' and tax_id ~ '^[0-9]{11}$') or
  (kind = 'office' and tax_id ~ '^[0-9A-Z]{12}[0-9]{2}$')
);

alter table public.people add column if not exists mobile_phone text;
alter table public.people add column if not exists state_registration text;
alter table public.people add column if not exists municipal_registration text;
alter table public.people add column if not exists icms_contributor boolean;
alter table public.people add column if not exists primary_cnae text;
alter table public.people add column if not exists tax_regime text;
alter table public.people add column if not exists registration_status text;
alter table public.people add column if not exists opened_at date;

-- Desde julho de 2026, novas inscrições de CNPJ podem ter letras nas primeiras 12 posições.
alter table public.people drop constraint if exists people_tax_id_format;
alter table public.people add constraint people_tax_id_format check (
  tax_id is null or (kind = 'individual' and tax_id ~ '^[0-9]{11}$') or
  (kind = 'company' and tax_id ~ '^[0-9A-Z]{12}[0-9]{2}$')
);

alter table public.customers add column if not exists accountant_id uuid;
alter table public.customers add column if not exists seller_id uuid;
alter table public.customers add column if not exists source text;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.customers'::regclass and conname='customers_accountant_id_fkey') then
    alter table public.customers add constraint customers_accountant_id_fkey
      foreign key (accountant_id) references public.accountants(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.customers'::regclass and conname='customers_seller_id_fkey') then
    alter table public.customers add constraint customers_seller_id_fkey
      foreign key (seller_id) references public.sellers(id) on delete set null;
  end if;
end $$;

create index if not exists customers_accountant_idx on public.customers(accountant_id) where accountant_id is not null;
create index if not exists customers_seller_idx on public.customers(seller_id) where seller_id is not null;
create index if not exists accountants_active_name_idx on public.accountants(active, name);
create unique index if not exists accountants_tax_id_unique_idx on public.accountants(tax_id) where tax_id is not null and tax_id <> '';

alter table public.accountants enable row level security;
drop policy if exists crm_admin_only on public.accountants;
create policy crm_admin_only on public.accountants for all to authenticated
  using (public.is_crm_admin()) with check (public.is_crm_admin());
grant select, insert, update, delete on public.accountants to authenticated;
revoke all on public.accountants from anon;

commit;
