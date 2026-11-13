-- NEXO CRM: estrutura inicial para empresas isoladas no mesmo Supabase.
-- Migração aditiva: os registros atuais são atribuídos à "Base de testes".
-- Não execute até publicar o código compatível com crm_companies/company_id.
begin;

do $$ begin
  if to_regprocedure('public.is_crm_admin()') is null then
    raise exception 'A função public.is_crm_admin() precisa existir.';
  end if;
end $$;

create table if not exists public.crm_companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 120),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (name)
);

create table if not exists public.crm_company_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid not null references public.crm_companies(id) on delete restrict,
  role text not null default 'admin' check (role in ('owner','admin')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists crm_company_members_company_idx on public.crm_company_members(company_id, active);

insert into public.crm_companies(id, name, active)
values ('00000000-0000-0000-0000-000000000100', 'Base de testes', true)
on conflict (id) do update set name = excluded.name;

-- Cada login pertence a uma única empresa. A conta atual preserva a base existente.
insert into public.crm_company_members(user_id, company_id, role, active)
select u.id, '00000000-0000-0000-0000-000000000100'::uuid, 'owner', true
from auth.users u
where coalesce(u.raw_app_meta_data ->> 'crm_admin', 'false') = 'true'
on conflict (user_id) do nothing;

create or replace function public.current_crm_company_id()
returns uuid
language sql stable security definer
set search_path = pg_catalog, public, auth
as $$
  select m.company_id
  from public.crm_company_members m
  where m.user_id = auth.uid() and m.active
  limit 1
$$;
revoke all on function public.current_crm_company_id() from public, anon;
grant execute on function public.current_crm_company_id() to authenticated;

alter table public.crm_companies enable row level security;
alter table public.crm_company_members enable row level security;
drop policy if exists crm_company_read_member on public.crm_companies;
create policy crm_company_read_member on public.crm_companies for select to authenticated
  using (id = public.current_crm_company_id() and public.is_crm_admin());
drop policy if exists crm_company_member_read_self on public.crm_company_members;
create policy crm_company_member_read_self on public.crm_company_members for select to authenticated
  using (user_id = auth.uid());
grant select on public.crm_companies, public.crm_company_members to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.crm_companies, public.crm_company_members from anon, authenticated;
revoke all on public.crm_companies, public.crm_company_members from anon;
grant select, insert on public.crm_companies to service_role;
grant select, insert, update on public.crm_company_members to service_role;

do $$
declare
  t text;
  policy_name text;
  tenant_tables text[] := array[
  'people','leads','customers','sellers','products','accountants','opportunities','activities',
  'opportunity_events','proposals','proposal_versions','proposal_items','proposal_links','proposal_acceptances',
  'customer_documents','customer_contracts','customer_contract_status_history','opportunity_products',
  'closed_sales','closed_sale_items','closed_sale_events','commercial_goals','lead_prospecting_filters'
];
begin
  foreach t in array tenant_tables loop
    if to_regclass(format('public.%I', t)) is null then
      raise exception 'Tabela public.% ausente. Aplique as migrations comerciais antes desta migration.', t;
    end if;
    execute format('alter table public.%I add column if not exists company_id uuid references public.crm_companies(id)', t);
    execute format('update public.%I set company_id = %L::uuid where company_id is null', t, '00000000-0000-0000-0000-000000000100');
    execute format('alter table public.%I alter column company_id set not null', t);
    execute format('create index if not exists %I on public.%I(company_id)', t || '_company_id_idx', t);

    -- Retira policies permissivas antigas: policies PostgreSQL são combinadas com OR.
    for policy_name in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy %I on public.%I', policy_name, t);
    end loop;
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy crm_company_isolation on public.%I for all to authenticated using (public.is_crm_admin() and company_id = public.current_crm_company_id()) with check (public.is_crm_admin() and company_id = public.current_crm_company_id())',
      t
    );
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- Atribui automaticamente a empresa do login em novas gravações e impede troca
-- do company_id por formulários/clientes autenticados.
create or replace function public.set_crm_company_id()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
declare selected_company uuid;
begin
  if auth.uid() is null then
    -- A aceitação pública da proposta é gravada por uma função SECURITY DEFINER
    -- usando um token válido; herda o escopo da proposta associada.
    if tg_table_name = 'proposal_acceptances' and new.company_id is null then
      select p.company_id into selected_company from public.proposals p where p.id = new.proposal_id;
      if selected_company is not null then
        new.company_id := selected_company;
        return new;
      end if;
    end if;
    if new.company_id is null then raise exception 'company_id é obrigatório para gravações de serviço.'; end if;
    return new;
  end if;

  selected_company := public.current_crm_company_id();
  if selected_company is null then raise exception 'Este usuário não está vinculado a uma empresa ativa do Nexo CRM.'; end if;

  if tg_op = 'INSERT' then
    if new.company_id is not null and new.company_id <> selected_company then
      raise exception 'Não é permitido gravar dados em outra empresa.';
    end if;
    new.company_id := selected_company;
  else
    if old.company_id <> selected_company or new.company_id is distinct from old.company_id then
      raise exception 'Não é permitido mover dados entre empresas.';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.set_crm_company_id() from public, anon, authenticated;

-- Confere a empresa dos vínculos antes de salvar, evitando relacionamentos
-- cruzados mesmo quando alguém altera manualmente a requisição do navegador.
create or replace function public.assert_crm_related_company(p_table text, p_id uuid, p_company_id uuid)
returns void language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare found boolean;
begin
  if p_id is null then return; end if;
  if p_table not in ('people','leads','customers','sellers','products','accountants','opportunities',
    'proposal_versions','proposals','customer_contracts','closed_sales','crm_company_members') then
    raise exception 'Verificação de vínculo CRM inválida.';
  end if;
  execute format('select exists(select 1 from public.%I where id = $1 and company_id = $2)', p_table)
    into found using p_id, p_company_id;
  if not found then raise exception 'O registro relacionado não pertence à empresa atual.'; end if;
end;
$$;

create or replace function public.validate_crm_related_company()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, auth
as $$
begin
  case tg_table_name
    when 'leads' then perform public.assert_crm_related_company('people', new.person_id, new.company_id);
      perform public.assert_crm_related_company('sellers', new.seller_id, new.company_id);
    when 'customers' then perform public.assert_crm_related_company('people', new.person_id, new.company_id);
      perform public.assert_crm_related_company('sellers', new.seller_id, new.company_id);
      perform public.assert_crm_related_company('accountants', new.accountant_id, new.company_id);
    when 'opportunities' then perform public.assert_crm_related_company('people', new.person_id, new.company_id);
      perform public.assert_crm_related_company('leads', new.lead_id, new.company_id);
      perform public.assert_crm_related_company('customers', new.customer_id, new.company_id);
      perform public.assert_crm_related_company('sellers', new.seller_id, new.company_id);
      perform public.assert_crm_related_company('products', new.product_id, new.company_id);
    when 'activities' then perform public.assert_crm_related_company('people', new.person_id, new.company_id);
      perform public.assert_crm_related_company('opportunities', new.opportunity_id, new.company_id);
    when 'opportunity_events' then perform public.assert_crm_related_company('opportunities', new.opportunity_id, new.company_id);
    when 'proposals' then perform public.assert_crm_related_company('customers', new.customer_id, new.company_id);
      perform public.assert_crm_related_company('opportunities', new.opportunity_id, new.company_id);
    when 'proposal_versions' then perform public.assert_crm_related_company('proposals', new.proposal_id, new.company_id);
    when 'proposal_items' then perform public.assert_crm_related_company('proposal_versions', new.version_id, new.company_id);
      perform public.assert_crm_related_company('products', new.product_id, new.company_id);
    when 'proposal_links' then perform public.assert_crm_related_company('proposals', new.proposal_id, new.company_id);
    when 'proposal_acceptances' then perform public.assert_crm_related_company('proposals', new.proposal_id, new.company_id);
      perform public.assert_crm_related_company('proposal_versions', new.version_id, new.company_id);
    when 'customer_documents' then perform public.assert_crm_related_company('customers', new.customer_id, new.company_id);
    when 'customer_contracts' then perform public.assert_crm_related_company('customers', new.customer_id, new.company_id);
      perform public.assert_crm_related_company('proposals', new.proposal_id, new.company_id);
      perform public.assert_crm_related_company('sellers', new.seller_id, new.company_id);
    when 'customer_contract_status_history' then perform public.assert_crm_related_company('customer_contracts', new.contract_id, new.company_id);
    when 'opportunity_products' then perform public.assert_crm_related_company('opportunities', new.opportunity_id, new.company_id);
      perform public.assert_crm_related_company('products', new.product_id, new.company_id);
    when 'closed_sales' then perform public.assert_crm_related_company('opportunities', new.opportunity_id, new.company_id);
      perform public.assert_crm_related_company('customers', new.customer_id, new.company_id);
      perform public.assert_crm_related_company('people', new.person_id, new.company_id);
      perform public.assert_crm_related_company('sellers', new.seller_id, new.company_id);
    when 'closed_sale_items' then perform public.assert_crm_related_company('closed_sales', new.closed_sale_id, new.company_id);
    when 'closed_sale_events' then perform public.assert_crm_related_company('closed_sales', new.closed_sale_id, new.company_id);
      perform public.assert_crm_related_company('customers', new.customer_id, new.company_id);
      perform public.assert_crm_related_company('people', new.person_id, new.company_id);
      perform public.assert_crm_related_company('sellers', new.seller_id, new.company_id);
    when 'commercial_goals' then perform public.assert_crm_related_company('sellers', new.seller_id, new.company_id);
      perform public.assert_crm_related_company('products', new.product_id, new.company_id);
    else null;
  end case;
  return new;
end;
$$;
revoke all on function public.validate_crm_related_company() from public, anon, authenticated;
revoke all on function public.assert_crm_related_company(text, uuid, uuid) from public, anon, authenticated;

do $$
declare
  t text;
  tenant_tables text[] := array[
  'people','leads','customers','sellers','products','accountants','opportunities','activities',
  'opportunity_events','proposals','proposal_versions','proposal_items','proposal_links','proposal_acceptances',
  'customer_documents','customer_contracts','customer_contract_status_history','opportunity_products',
  'closed_sales','closed_sale_items','closed_sale_events','commercial_goals','lead_prospecting_filters'
];
begin
  foreach t in array tenant_tables loop
    execute format('drop trigger if exists set_crm_company_id on public.%I', t);
    execute format('create trigger set_crm_company_id before insert or update on public.%I for each row execute function public.set_crm_company_id()', t);
    execute format('drop trigger if exists validate_crm_related_company on public.%I', t);
    execute format('create trigger validate_crm_related_company before insert or update on public.%I for each row execute function public.validate_crm_related_company()', t);
  end loop;
end $$;

-- Unicidade comercial deve valer dentro de cada empresa, permitindo catálogos
-- e cadastros independentes sem duplicar dados entre elas.
drop index if exists public.people_tax_id_unique_idx;
  create unique index if not exists people_tax_id_company_unique_idx on public.people(company_id, tax_id) where tax_id is not null and tax_id <> '';
alter table public.proposals drop constraint if exists proposals_proposal_number_key;
create unique index if not exists proposals_number_company_unique_idx on public.proposals(company_id, proposal_number);
drop index if exists public.accountants_tax_id_unique_idx;
create unique index if not exists accountants_tax_id_company_unique_idx on public.accountants(company_id, tax_id) where tax_id is not null and tax_id <> '';
drop index if exists public.products_internal_code_unique_idx;
create unique index if not exists products_internal_code_company_unique_idx on public.products(company_id, upper(internal_code)) where internal_code is not null and btrim(internal_code) <> '';
drop index if exists public.commercial_goals_general_unique_idx;
drop index if exists public.commercial_goals_seller_unique_idx;
drop index if exists public.commercial_goals_product_unique_idx;
drop index if exists public.commercial_goals_category_unique_idx;
create unique index if not exists commercial_goals_general_company_unique_idx on public.commercial_goals(company_id, period_month) where goal_type='general';
create unique index if not exists commercial_goals_seller_company_unique_idx on public.commercial_goals(company_id, period_month, seller_id) where goal_type='seller';
create unique index if not exists commercial_goals_product_company_unique_idx on public.commercial_goals(company_id, period_month, product_id) where goal_type='product';
create unique index if not exists commercial_goals_category_company_unique_idx on public.commercial_goals(company_id, period_month, lower(btrim(category_name))) where goal_type='category';
alter table public.lead_prospecting_filters drop constraint if exists lead_prospecting_filters_name_key;
drop index if exists public.lead_prospecting_filters_name_company_unique_idx;
create unique index if not exists lead_prospecting_filters_name_company_unique_idx on public.lead_prospecting_filters(company_id, lower(btrim(name)));

-- Isola também os arquivos privados pelo cliente no primeiro segmento do path.
drop policy if exists nexo_crm_private_files_admin_read on storage.objects;
drop policy if exists nexo_crm_private_files_admin_insert on storage.objects;
drop policy if exists nexo_crm_private_files_admin_update on storage.objects;
drop policy if exists nexo_crm_private_files_admin_delete on storage.objects;
drop policy if exists nexo_crm_private_files_company_read on storage.objects;
drop policy if exists nexo_crm_private_files_company_insert on storage.objects;
drop policy if exists nexo_crm_private_files_company_update on storage.objects;
drop policy if exists nexo_crm_private_files_company_delete on storage.objects;
create policy nexo_crm_private_files_company_read on storage.objects for select to authenticated
  using (bucket_id='nexo-crm-private' and exists (
    select 1 from public.customers c where c.id::text=split_part(name,'/',1) and c.company_id=public.current_crm_company_id()
  ));
create policy nexo_crm_private_files_company_insert on storage.objects for insert to authenticated
  with check (bucket_id='nexo-crm-private' and exists (
    select 1 from public.customers c where c.id::text=split_part(name,'/',1) and c.company_id=public.current_crm_company_id()
  ));
create policy nexo_crm_private_files_company_update on storage.objects for update to authenticated
  using (bucket_id='nexo-crm-private' and exists (
    select 1 from public.customers c where c.id::text=split_part(name,'/',1) and c.company_id=public.current_crm_company_id()
  )) with check (bucket_id='nexo-crm-private' and exists (
    select 1 from public.customers c where c.id::text=split_part(name,'/',1) and c.company_id=public.current_crm_company_id()
  ));
create policy nexo_crm_private_files_company_delete on storage.objects for delete to authenticated
  using (bucket_id='nexo-crm-private' and exists (
    select 1 from public.customers c where c.id::text=split_part(name,'/',1) and c.company_id=public.current_crm_company_id()
  ));

-- Logos continuam públicas para exibir propostas, mas cada empresa só pode
-- gravar, substituir ou remover arquivos dentro da própria pasta.
drop policy if exists nexo_proposal_logo_admin_insert on storage.objects;
create policy nexo_proposal_logo_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id='nexo-proposal-assets' and (storage.foldername(name))[1]='logos'
    and (storage.foldername(name))[2]=public.current_crm_company_id()::text and public.is_crm_admin());
drop policy if exists nexo_proposal_logo_admin_update on storage.objects;
create policy nexo_proposal_logo_admin_update on storage.objects for update to authenticated
  using (bucket_id='nexo-proposal-assets' and (storage.foldername(name))[1]='logos'
    and (storage.foldername(name))[2]=public.current_crm_company_id()::text and public.is_crm_admin())
  with check (bucket_id='nexo-proposal-assets' and (storage.foldername(name))[1]='logos'
    and (storage.foldername(name))[2]=public.current_crm_company_id()::text and public.is_crm_admin());
drop policy if exists nexo_proposal_logo_admin_delete on storage.objects;
create policy nexo_proposal_logo_admin_delete on storage.objects for delete to authenticated
  using (bucket_id='nexo-proposal-assets' and (storage.foldername(name))[1]='logos'
    and (storage.foldername(name))[2]=public.current_crm_company_id()::text and public.is_crm_admin());

commit;
