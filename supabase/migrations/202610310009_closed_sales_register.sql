-- Registra a primeira venda WON por oportunidade e seu ciclo de fechamento.
-- Não faz backfill de oportunidades já WON. Requer as migrations 001, 004 e 005-006.
begin;

do $$ begin
  if to_regclass('public.opportunities') is null
     or to_regclass('public.customers') is null
     or to_regclass('public.people') is null
     or to_regclass('public.sellers') is null
     or to_regclass('public.products') is null
     or to_regclass('public.opportunity_products') is null
     or to_regclass('public.opportunity_events') is null
     or to_regclass('public.pipeline_stages') is null
     or to_regprocedure('public.is_crm_admin()') is null
     or to_regprocedure('public.record_opportunity_event()') is null then
    raise exception 'Schema do funil incompleto. Aplique as migrations-base 001, 004, 005 e 006 antes desta migration.';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid='public.opportunities'::regclass
      and tgname='opportunity_events_audit' and not tgisinternal) then
    raise exception 'Trigger opportunity_events_audit ausente; o histórico existente deve permanecer habilitado.';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='products' and column_name='commercial_category') then
    raise exception 'Coluna products.commercial_category ausente. Aplique a migration 006.';
  end if;
end $$;

create table if not exists public.closed_sales (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null unique references public.opportunities(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete restrict,
  person_id uuid not null references public.people(id) on delete restrict,
  seller_id uuid references public.sellers(id) on delete restrict,
  seller_name_snapshot text,
  closed_at timestamptz not null,
  installation_value numeric(14,2),
  monthly_value numeric(14,2),
  commercial_snapshot jsonb not null,
  source text not null default 'opportunity_won',
  created_at timestamptz not null default now(),
  constraint closed_sales_installation_value_check check (installation_value is null or installation_value >= 0),
  constraint closed_sales_monthly_value_check check (monthly_value is null or monthly_value >= 0),
  constraint closed_sales_snapshot_object_check check (jsonb_typeof(commercial_snapshot) = 'object'),
  constraint closed_sales_source_check check (length(btrim(source)) between 1 and 80)
);
create index if not exists closed_sales_closed_at_idx on public.closed_sales(closed_at desc);
create index if not exists closed_sales_seller_closed_at_idx on public.closed_sales(seller_id, closed_at desc);
create index if not exists closed_sales_customer_idx on public.closed_sales(customer_id) where customer_id is not null;

create table if not exists public.closed_sale_items (
  id uuid primary key default gen_random_uuid(),
  closed_sale_id uuid not null references public.closed_sales(id) on delete restrict,
  cycle_number integer not null default 1 check(cycle_number > 0),
  product_id_snapshot uuid not null,
  product_name_snapshot text not null,
  product_kind_snapshot text not null check (product_kind_snapshot in ('product','service','certificate')),
  category_snapshot text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  constraint closed_sale_items_unique_product unique(closed_sale_id, cycle_number, product_id_snapshot)
);
create index if not exists closed_sale_items_product_idx on public.closed_sale_items(product_id_snapshot);
create index if not exists closed_sale_items_category_idx on public.closed_sale_items(category_snapshot) where category_snapshot is not null;

create table if not exists public.closed_sale_events (
  id uuid primary key default gen_random_uuid(),
  closed_sale_id uuid not null references public.closed_sales(id) on delete restrict,
  event_number integer not null check(event_number > 0),
  cycle_number integer not null check(cycle_number > 0),
  event_type text not null check(event_type in ('closed','reversed','reclosed')),
  customer_id uuid,
  person_id uuid,
  seller_id uuid,
  seller_name_snapshot text,
  installation_value numeric(14,2),
  monthly_value numeric(14,2),
  commercial_snapshot jsonb,
  -- ID histórico sem FK: ON DELETE SET NULL violaria o caráter append-only.
  actor_id uuid,
  created_at timestamptz not null default now(),
  constraint closed_sale_events_sequence_unique unique(closed_sale_id,event_number),
  constraint closed_sale_events_snapshot_check check (
    (event_type='reversed' and commercial_snapshot is null) or
    (event_type in ('closed','reclosed') and jsonb_typeof(commercial_snapshot)='object')
  ),
  constraint closed_sale_events_installation_check check (installation_value is null or installation_value >= 0),
  constraint closed_sale_events_monthly_check check (monthly_value is null or monthly_value >= 0)
);
create index if not exists closed_sale_events_history_idx on public.closed_sale_events(closed_sale_id,event_number desc);

-- Os registros comerciais fechados e seu histórico são append-only.
create or replace function public.prevent_closed_sale_history_mutation()
returns trigger language plpgsql set search_path=pg_catalog
as $$
begin
  raise exception 'O histórico de vendas fechadas é imutável.' using errcode='55000';
end;
$$;

drop trigger if exists closed_sales_immutable on public.closed_sales;
create trigger closed_sales_immutable before update or delete on public.closed_sales
  for each row execute function public.prevent_closed_sale_history_mutation();
drop trigger if exists closed_sale_items_immutable on public.closed_sale_items;
create trigger closed_sale_items_immutable before update or delete on public.closed_sale_items
  for each row execute function public.prevent_closed_sale_history_mutation();
drop trigger if exists closed_sale_events_immutable on public.closed_sale_events;
create trigger closed_sale_events_immutable before update or delete on public.closed_sale_events
  for each row execute function public.prevent_closed_sale_history_mutation();

create or replace function public.capture_opportunity_won_sale()
returns trigger language plpgsql security definer set search_path=pg_catalog
as $$
declare
  was_won boolean := false;
  won_stage boolean;
  sale_id uuid;
  inserted_sale_id uuid;
  last_event_type text;
  last_event_number integer;
  last_cycle_number integer;
  closure_at timestamptz;
  seller_name text;
  customer_name text;
  customer_trade_name text;
  customer_tax_id text;
  snapshot jsonb;
begin
  if tg_op='UPDATE' then was_won := old.status='won'; end if;

  if new.status='won' and not was_won then
    select s.is_won into won_stage from public.pipeline_stages s
      where s.id=new.stage_id and s.pipeline_id=new.pipeline_id;
    if not coalesce(won_stage,false) then
      raise exception 'Uma venda só pode ser registrada na etapa WON do pipeline.' using errcode='23514';
    end if;

    if new.customer_id is not null and not exists (
      select 1 from public.customers c where c.id=new.customer_id and c.person_id=new.person_id
    ) then
      raise exception 'O cliente vinculado à oportunidade não corresponde à pessoa registrada.' using errcode='23514';
    end if;

    select sv.name,p.name,p.trade_name,p.tax_id into seller_name,customer_name,customer_trade_name,customer_tax_id
      from public.people p left join public.sellers sv on sv.id=new.seller_id where p.id=new.person_id;
    if customer_name is null then
      raise exception 'A pessoa vinculada à oportunidade não foi encontrada.' using errcode='23503';
    end if;
    closure_at := clock_timestamp();
    snapshot := jsonb_build_object(
      'title',new.title,'lead_id',new.lead_id,'customer_id',new.customer_id,'person_id',new.person_id,
      'seller_id',new.seller_id,'seller_name',seller_name,'primary_product_id',new.product_id,
      'opened_at',new.opened_at,'expected_close_date',new.expected_close_date,'converted_at',new.converted_at,
      'installation_value',new.installation_value,'monthly_value',new.monthly_value,
      'monthly_due_day',new.monthly_due_day,'notes',new.notes,
      'implementation_owner',new.implementation_owner,'installation_date',new.installation_date,
      'training_date',new.training_date,'trainings_needed',new.trainings_needed,'invoice_limit',new.invoice_limit,
      'system_version',new.system_version,'nfce_version',new.nfce_version,'mdfe_version',new.mdfe_version,
      'technical_notes',new.technical_notes,'contract_status',new.contract_status,
      'installation_fee_status',new.installation_fee_status,
      'installation_fee_payment_method',new.installation_fee_payment_method,
      'installation_fee_paid_at',new.installation_fee_paid_at,
      'customer_name',customer_name,'customer_trade_name',customer_trade_name,'customer_tax_id',customer_tax_id
    );

    insert into public.closed_sales(
      opportunity_id,customer_id,person_id,seller_id,seller_name_snapshot,closed_at,
      installation_value,monthly_value,commercial_snapshot,source
    )
    values(new.id,new.customer_id,new.person_id,new.seller_id,seller_name,closure_at,
      new.installation_value,new.monthly_value,snapshot,'opportunity_won')
    on conflict (opportunity_id) do nothing
    returning id into inserted_sale_id;

    if inserted_sale_id is not null then
      sale_id := inserted_sale_id;
      insert into public.closed_sale_items(closed_sale_id,cycle_number,product_id_snapshot,product_name_snapshot,product_kind_snapshot,category_snapshot,is_primary)
        select sale_id,1,pr.id,pr.name,pr.kind,pr.commercial_category,true
        from public.products pr where pr.id=new.product_id
        union all
        select sale_id,1,pr.id,pr.name,pr.kind,pr.commercial_category,false
        from public.opportunity_products op join public.products pr on pr.id=op.product_id
        where op.opportunity_id=new.id and op.product_id is distinct from new.product_id;
      insert into public.closed_sale_events(closed_sale_id,event_number,cycle_number,event_type,customer_id,person_id,seller_id,seller_name_snapshot,installation_value,monthly_value,commercial_snapshot,actor_id,created_at)
        values(sale_id,1,1,'closed',new.customer_id,new.person_id,new.seller_id,seller_name,new.installation_value,new.monthly_value,snapshot,auth.uid(),closure_at);
    else
      select cs.id into sale_id from public.closed_sales cs where cs.opportunity_id=new.id;
      select e.event_type,e.event_number,e.cycle_number into last_event_type,last_event_number,last_cycle_number
        from public.closed_sale_events e where e.closed_sale_id=sale_id order by e.event_number desc limit 1;
      if last_event_type='reversed' then
        insert into public.closed_sale_events(closed_sale_id,event_number,cycle_number,event_type,customer_id,person_id,seller_id,seller_name_snapshot,installation_value,monthly_value,commercial_snapshot,actor_id,created_at)
          values(sale_id,last_event_number+1,last_cycle_number+1,'reclosed',new.customer_id,new.person_id,new.seller_id,seller_name,new.installation_value,new.monthly_value,snapshot,auth.uid(),closure_at);
        insert into public.closed_sale_items(closed_sale_id,cycle_number,product_id_snapshot,product_name_snapshot,product_kind_snapshot,category_snapshot,is_primary)
          select sale_id,last_cycle_number+1,pr.id,pr.name,pr.kind,pr.commercial_category,true
          from public.products pr where pr.id=new.product_id
          union all
          select sale_id,last_cycle_number+1,pr.id,pr.name,pr.kind,pr.commercial_category,false
          from public.opportunity_products op join public.products pr on pr.id=op.product_id
          where op.opportunity_id=new.id and op.product_id is distinct from new.product_id;
      elsif last_event_type is null then
        raise exception 'Registro de venda inconsistente: histórico de fechamento ausente.' using errcode='23514';
      end if;
    end if;
  elsif was_won and new.status<>'won' then
    select cs.id into sale_id from public.closed_sales cs where cs.opportunity_id=new.id;
    if sale_id is not null then
      select e.event_type,e.event_number,e.cycle_number into last_event_type,last_event_number,last_cycle_number
        from public.closed_sale_events e where e.closed_sale_id=sale_id order by e.event_number desc limit 1;
      if last_event_type in ('closed','reclosed') then
        insert into public.closed_sale_events(closed_sale_id,event_number,cycle_number,event_type,actor_id,created_at)
          values(sale_id,last_event_number+1,last_cycle_number,'reversed',auth.uid(),clock_timestamp());
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists opportunity_closed_sale_capture on public.opportunities;
create trigger opportunity_closed_sale_capture
  after insert or update of status on public.opportunities
  for each row execute function public.capture_opportunity_won_sale();

alter table public.closed_sales enable row level security;
alter table public.closed_sale_items enable row level security;
alter table public.closed_sale_events enable row level security;
drop policy if exists crm_admin_closed_sales_read on public.closed_sales;
create policy crm_admin_closed_sales_read on public.closed_sales for select to authenticated using (public.is_crm_admin());
drop policy if exists crm_admin_closed_sale_items_read on public.closed_sale_items;
create policy crm_admin_closed_sale_items_read on public.closed_sale_items for select to authenticated using (public.is_crm_admin());
drop policy if exists crm_admin_closed_sale_events_read on public.closed_sale_events;
create policy crm_admin_closed_sale_events_read on public.closed_sale_events for select to authenticated using (public.is_crm_admin());
grant select on public.closed_sales,public.closed_sale_items,public.closed_sale_events to authenticated;
revoke all on public.closed_sales,public.closed_sale_items,public.closed_sale_events from anon;
revoke insert,update,delete on public.closed_sales,public.closed_sale_items,public.closed_sale_events from authenticated;
revoke all on function public.capture_opportunity_won_sale() from public,anon,authenticated;
revoke all on function public.prevent_closed_sale_history_mutation() from public,anon,authenticated;

-- Fonte recomendada para metas de vendas concluídas: a última reversão remove a venda
-- do conjunto vigente; novo fechamento volta a contá-la uma única vez na nova data.
create or replace view public.active_closed_sales
with (security_invoker = true)
as
select cs.id,cs.opportunity_id,latest.customer_id,latest.person_id,latest.seller_id,latest.seller_name_snapshot,
  cs.closed_at as first_closed_at,latest.created_at as effective_closed_at,latest.cycle_number,
  latest.installation_value,latest.monthly_value,latest.commercial_snapshot,cs.source,cs.created_at
from public.closed_sales cs
join public.opportunities o on o.id=cs.opportunity_id and o.status='won'
join lateral (
  select e.event_type,e.created_at,e.cycle_number,e.customer_id,e.person_id,e.seller_id,
    e.seller_name_snapshot,e.installation_value,e.monthly_value,e.commercial_snapshot,e.event_number
  from public.closed_sale_events e where e.closed_sale_id=cs.id
  order by e.event_number desc limit 1
) latest on latest.event_type in ('closed','reclosed');
grant select on public.active_closed_sales to authenticated;
revoke all on public.active_closed_sales from anon;

commit;
