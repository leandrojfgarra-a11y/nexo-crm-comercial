-- Documentos privados e contratos comerciais do NEXO CRM.
-- Requer a migration inicial (customers, proposals, sellers e is_crm_admin).
-- Não cria bucket, não publica objetos e não altera/apaga dados existentes.
begin;

create table public.customer_documents (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  name text not null,
  category text not null check (category in ('personal','business','state_registration','address','certificates','other')),
  description text,
  original_file_name text not null,
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('application/pdf','image/jpeg','image/png','application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  file_size bigint not null check (file_size > 0 and file_size <= 10485760),
  uploaded_by uuid references auth.users(id) on delete set null,
  uploaded_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  updated_by_email text,
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null
);
create index customer_documents_customer_idx on public.customer_documents(customer_id, created_at desc)
  where deleted_at is null;
create index customer_documents_category_idx on public.customer_documents(customer_id, category)
  where deleted_at is null;

create table public.customer_contracts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  proposal_id uuid references public.proposals(id) on delete set null,
  contract_number text not null,
  title text not null,
  contract_type text not null,
  description text,
  signed_at date,
  effective_from date,
  effective_until date,
  contract_value numeric(14,2) check (contract_value is null or contract_value >= 0),
  status text not null default 'draft' check (status in ('draft','sent','awaiting_signature','signed','active','closed','cancelled')),
  seller_id uuid references public.sellers(id) on delete set null,
  original_file_name text not null,
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  file_size bigint not null check (file_size > 0 and file_size <= 10485760),
  created_by uuid references auth.users(id) on delete set null,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_contract_dates_check check (
    effective_from is null or effective_until is null or effective_until >= effective_from
  ),
  unique(customer_id, contract_number)
);
create index customer_contracts_customer_idx on public.customer_contracts(customer_id, created_at desc);
create index customer_contracts_status_idx on public.customer_contracts(customer_id, status);
create index customer_contracts_proposal_idx on public.customer_contracts(proposal_id) where proposal_id is not null;

create table public.customer_contract_status_history (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.customer_contracts(id) on delete restrict,
  previous_status text check (previous_status is null or previous_status in ('draft','sent','awaiting_signature','signed','active','closed','cancelled')),
  new_status text not null check (new_status in ('draft','sent','awaiting_signature','signed','active','closed','cancelled')),
  note text,
  changed_by uuid references auth.users(id) on delete set null,
  changed_by_email text,
  changed_at timestamptz not null default now()
);
create index contract_status_history_contract_idx on public.customer_contract_status_history(contract_id, changed_at desc);

create or replace function public.record_customer_contract_status()
returns trigger language plpgsql security definer
set search_path = pg_catalog, auth
as $$
begin
  if TG_OP = 'INSERT' then
    insert into public.customer_contract_status_history(contract_id, previous_status, new_status, changed_by, changed_by_email)
    values (new.id, null, new.status, auth.uid(), auth.jwt() ->> 'email');
  elsif new.status is distinct from old.status then
    insert into public.customer_contract_status_history(contract_id, previous_status, new_status, changed_by, changed_by_email)
    values (new.id, old.status, new.status, auth.uid(), auth.jwt() ->> 'email');
  end if;
  return new;
end;
$$;
create trigger customer_contract_status_history_trigger
  after insert or update of status on public.customer_contracts
  for each row execute function public.record_customer_contract_status();
revoke all on function public.record_customer_contract_status() from public, anon, authenticated;

alter table public.customer_documents enable row level security;
alter table public.customer_contracts enable row level security;
alter table public.customer_contract_status_history enable row level security;

create policy crm_admin_customer_documents on public.customer_documents
  for all to authenticated using (public.is_crm_admin()) with check (public.is_crm_admin());
create policy crm_admin_customer_contracts on public.customer_contracts
  for all to authenticated using (public.is_crm_admin()) with check (public.is_crm_admin());
create policy crm_admin_contract_history_read on public.customer_contract_status_history
  for select to authenticated using (public.is_crm_admin());
create policy crm_admin_contract_history_insert on public.customer_contract_status_history
  for insert to authenticated with check (public.is_crm_admin());

grant select, insert, update, delete on public.customer_documents to authenticated;
grant select, insert, update on public.customer_contracts to authenticated;
grant select on public.customer_contract_status_history to authenticated;
revoke all on public.customer_documents, public.customer_contracts, public.customer_contract_status_history from anon;

-- O bucket privado precisa ser criado manualmente. Estas policies não criam bucket.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='nexo_crm_private_files_admin_read') then
    execute 'create policy nexo_crm_private_files_admin_read on storage.objects for select to authenticated using (bucket_id = ''nexo-crm-private'' and public.is_crm_admin())';
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='nexo_crm_private_files_admin_insert') then
    execute 'create policy nexo_crm_private_files_admin_insert on storage.objects for insert to authenticated with check (bucket_id = ''nexo-crm-private'' and public.is_crm_admin())';
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='nexo_crm_private_files_admin_update') then
    execute 'create policy nexo_crm_private_files_admin_update on storage.objects for update to authenticated using (bucket_id = ''nexo-crm-private'' and public.is_crm_admin()) with check (bucket_id = ''nexo-crm-private'' and public.is_crm_admin())';
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='nexo_crm_private_files_admin_delete') then
    execute 'create policy nexo_crm_private_files_admin_delete on storage.objects for delete to authenticated using (bucket_id = ''nexo-crm-private'' and public.is_crm_admin())';
  end if;
end $$;

commit;
