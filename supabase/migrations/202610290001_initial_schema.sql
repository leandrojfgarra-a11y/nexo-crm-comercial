-- NEXO CRM Comercial: esquema inicial. Revisar e executar manualmente no projeto novo.
-- Sem dados de origem, sem integração com Gestão Fácil+.
begin;

create extension if not exists pgcrypto;

create or replace function public.is_crm_admin()
returns boolean language sql stable
as $$ select coalesce(auth.jwt() -> 'app_metadata' ->> 'crm_admin', 'false') = 'true' $$;

create table public.people (
  id uuid primary key default gen_random_uuid(), kind text not null check (kind in ('individual','company')),
  name text not null, trade_name text, tax_id text, email text, phone text,
  postal_code text, address_line text, address_number text, address_extra text, district text, city text, state text,
  notes text,
  constraint people_tax_id_format check (
    tax_id is null or (kind = 'individual' and tax_id ~ '^([0-9]{11})$') or
    (kind = 'company' and tax_id ~ '^([0-9]{14})$')
  ),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.leads (
  id uuid primary key default gen_random_uuid(), person_id uuid references public.people(id) on delete restrict,
  source text, status text not null default 'new' check(status in ('new','contacted','qualified','converted','lost')),
  seller_id uuid, converted_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.customers (
  id uuid primary key default gen_random_uuid(), person_id uuid not null references public.people(id) on delete restrict,
  status text not null default 'active' check(status in ('active','inactive')),
  since date not null default current_date, notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.sellers (
  id uuid primary key default gen_random_uuid(), name text not null, email text, phone text,
  active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.leads add constraint leads_seller_id_fkey foreign key(seller_id) references public.sellers(id) on delete set null;
create table public.products (
  id uuid primary key default gen_random_uuid(), kind text not null check(kind in ('product','service')),
  name text not null, description text, reference_price numeric(14,2) check(reference_price is null or reference_price >= 0),
  active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.pipelines (
  id uuid primary key default gen_random_uuid(), name text not null, active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.pipeline_stages (
  id uuid primary key default gen_random_uuid(), pipeline_id uuid not null references public.pipelines(id) on delete cascade,
  name text not null, position integer not null check(position >= 0), is_won boolean not null default false,
  is_lost boolean not null default false, unique(pipeline_id, position), unique(pipeline_id, name), unique(id, pipeline_id)
);
create table public.opportunities (
  id uuid primary key default gen_random_uuid(), person_id uuid not null references public.people(id) on delete restrict,
  seller_id uuid references public.sellers(id) on delete set null,
  pipeline_id uuid not null references public.pipelines(id) on delete restrict,
  stage_id uuid not null,
  title text not null, estimated_value numeric(14,2) check(estimated_value is null or estimated_value >= 0),
  expected_close_date date, status text not null default 'open' check(status in ('open','won','lost','cancelled')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint opportunities_stage_belongs_to_pipeline foreign key(stage_id, pipeline_id)
    references public.pipeline_stages(id, pipeline_id) on delete restrict
);
create table public.activities (
  id uuid primary key default gen_random_uuid(), person_id uuid references public.people(id) on delete restrict,
  opportunity_id uuid references public.opportunities(id) on delete restrict,
  kind text not null check(kind in ('call','message','meeting','task','note')),
  title text not null, details text, due_at timestamptz, completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(),
  constraint activities_have_subject check(person_id is not null or opportunity_id is not null)
);
create table public.opportunity_events (
  id uuid primary key default gen_random_uuid(), opportunity_id uuid not null references public.opportunities(id) on delete restrict,
  event_type text not null, old_value jsonb, new_value jsonb, note text,
  actor_id uuid references auth.users(id) on delete set null, created_at timestamptz not null default now()
);
create table public.proposals (
  id uuid primary key default gen_random_uuid(), customer_id uuid not null references public.customers(id) on delete restrict,
  opportunity_id uuid references public.opportunities(id) on delete restrict,
  proposal_number text not null unique, status text not null default 'draft'
    check(status in ('draft','sent','accepted','rejected','expired','cancelled')),
  valid_until date, current_version integer check(current_version is null or current_version > 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.proposal_versions (
  id uuid primary key default gen_random_uuid(), proposal_id uuid not null references public.proposals(id) on delete restrict,
  version integer not null check(version > 0), title text not null, terms text,
  currency char(3) not null default 'BRL', subtotal numeric(14,2) not null default 0 check(subtotal >= 0),
  discount numeric(14,2) not null default 0 check(discount >= 0), total numeric(14,2) not null check(total >= 0),
  sent_at timestamptz, created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), unique(proposal_id, version), unique(id, proposal_id)
);
alter table public.proposals add constraint proposals_current_version_fk
  foreign key(id, current_version) references public.proposal_versions(proposal_id, version)
  deferrable initially deferred;
create table public.proposal_items (
  id uuid primary key default gen_random_uuid(), version_id uuid not null references public.proposal_versions(id) on delete restrict,
  product_id uuid references public.products(id) on delete set null, description text not null,
  quantity numeric(12,3) not null check(quantity > 0), unit_price numeric(14,2) not null check(unit_price >= 0),
  line_total numeric(14,2) not null check(line_total >= 0), position integer not null default 0
);

-- O token bruto de compartilhamento nunca é armazenado. Somente o hash é persistido;
-- tabelas sem policy pública impedem leitura direta por anon. Validação/aceite futuros
-- devem ocorrer em endpoint de servidor após hash, expiração e revogação serem verificados.
create table public.proposal_links (
  id uuid primary key default gen_random_uuid(), proposal_id uuid not null references public.proposals(id) on delete restrict,
  token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null, revoked_at timestamptz,
  created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now()
);
create index proposal_links_active_idx on public.proposal_links(proposal_id, expires_at)
  where revoked_at is null;
create table public.proposal_acceptances (
  id uuid primary key default gen_random_uuid(), proposal_id uuid not null references public.proposals(id) on delete restrict,
  version_id uuid not null,
  status text not null default 'pending_internal_confirmation'
    check(status in ('pending_internal_confirmation','confirmed','rejected')),
  declared_name text, declared_email text, declared_at timestamptz not null default now(),
  evidence jsonb, reviewed_by uuid references auth.users(id) on delete set null, reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint acceptance_version_belongs_to_proposal foreign key(version_id, proposal_id)
    references public.proposal_versions(id, proposal_id) on delete restrict
);
create index proposal_acceptances_review_idx on public.proposal_acceptances(status, declared_at desc);

create index leads_person_idx on public.leads(person_id);
create index leads_seller_idx on public.leads(seller_id);
create index customers_person_idx on public.customers(person_id);
create index opportunities_stage_idx on public.opportunities(stage_id);
create index opportunities_person_idx on public.opportunities(person_id);
create index opportunities_seller_idx on public.opportunities(seller_id);
create index activities_due_idx on public.activities(due_at) where completed_at is null;
create index activities_person_idx on public.activities(person_id);
create index activities_opportunity_idx on public.activities(opportunity_id);
create index opportunity_events_history_idx on public.opportunity_events(opportunity_id, created_at desc);
create index proposals_customer_idx on public.proposals(customer_id);
create index proposals_opportunity_idx on public.proposals(opportunity_id);
create index proposal_versions_history_idx on public.proposal_versions(proposal_id, version desc);
create index proposal_items_version_idx on public.proposal_items(version_id, position);

-- Dados iniciais do funil, inclusive a etapa solicitada.
insert into public.pipelines(id,name) values ('00000000-0000-0000-0000-000000000001','Funil Comercial')
on conflict (id) do nothing;
insert into public.pipeline_stages(pipeline_id,name,position) values
 ('00000000-0000-0000-0000-000000000001','Novo',0),
 ('00000000-0000-0000-0000-000000000001','Qualificação',1),
 ('00000000-0000-0000-0000-000000000001','Proposta Enviada',2),
 ('00000000-0000-0000-0000-000000000001','Negociação',3),
 ('00000000-0000-0000-0000-000000000001','Ganho',4),
 ('00000000-0000-0000-0000-000000000001','Perdido',5)
on conflict do nothing;

-- Todos os dados do CRM só podem ser lidos/escritos pelo usuário Auth cujo
-- app_metadata.crm_admin seja boolean true (definido apenas por administrador Auth).
do $$ declare t text; begin
  foreach t in array array['people','leads','customers','sellers','products','pipelines','pipeline_stages',
    'opportunities','activities','opportunity_events','proposals','proposal_versions','proposal_items',
    'proposal_links','proposal_acceptances'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy crm_admin_only on public.%I for all to authenticated using (public.is_crm_admin()) with check (public.is_crm_admin())', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
revoke all on function public.is_crm_admin() from public, anon;
grant execute on function public.is_crm_admin() to authenticated;
commit;
