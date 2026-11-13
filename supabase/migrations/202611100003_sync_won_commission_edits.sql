-- Registra alterações de vendedor e valores em vendas WON sem sobrescrever
-- o fechamento original. A view de vendas ativas passa a consumir o ajuste.
begin;

do $$
begin
  if to_regclass('public.opportunities') is null
     or to_regclass('public.closed_sales') is null
     or to_regclass('public.closed_sale_events') is null
     or to_regclass('public.active_closed_sales') is null
     or to_regprocedure('public.is_crm_admin()') is null then
    raise exception 'Aplique as migrations comerciais e a migration 009 antes de sincronizar comissões.';
  end if;
end;
$$;

alter table public.closed_sale_events
  drop constraint if exists closed_sale_events_event_type_check;
alter table public.closed_sale_events
  add constraint closed_sale_events_event_type_check
  check (event_type in ('closed','reversed','reclosed','adjusted'));

alter table public.closed_sale_events
  drop constraint if exists closed_sale_events_snapshot_check;
alter table public.closed_sale_events
  add constraint closed_sale_events_snapshot_check check (
    (event_type='reversed' and commercial_snapshot is null) or
    (event_type in ('closed','reclosed','adjusted') and jsonb_typeof(commercial_snapshot)='object')
  );

create or replace function public.sync_won_sale_commission_adjustment()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog
as $$
declare
  sale_id uuid;
  last_event public.closed_sale_events%rowtype;
  seller_name text;
  adjusted_snapshot jsonb;
begin
  if old.status <> 'won' or new.status <> 'won'
     or (old.seller_id,old.installation_value,old.monthly_value)
        is not distinct from (new.seller_id,new.installation_value,new.monthly_value) then
    return new;
  end if;

  select cs.id into sale_id
    from public.closed_sales cs
    where cs.opportunity_id=new.id
    for update;
  if sale_id is null then
    raise exception 'Venda WON sem registro de fechamento; não foi possível atualizar a comissão.' using errcode='23514';
  end if;

  select e.* into last_event
    from public.closed_sale_events e
    where e.closed_sale_id=sale_id
    order by e.event_number desc
    limit 1;
  if last_event.event_type is null or last_event.event_type not in ('closed','reclosed','adjusted') then
    raise exception 'Venda WON sem evento ativo; não foi possível atualizar a comissão.' using errcode='23514';
  end if;

  select s.name into seller_name from public.sellers s where s.id=new.seller_id;
  adjusted_snapshot := coalesce(last_event.commercial_snapshot,'{}'::jsonb) || jsonb_build_object(
    'seller_id',new.seller_id,
    'seller_name',seller_name,
    'installation_value',new.installation_value,
    'monthly_value',new.monthly_value
  );

  insert into public.closed_sale_events(
    closed_sale_id,event_number,cycle_number,event_type,customer_id,person_id,
    seller_id,seller_name_snapshot,installation_value,monthly_value,
    commercial_snapshot,actor_id,created_at
  ) values (
    sale_id,last_event.event_number+1,last_event.cycle_number,'adjusted',new.customer_id,new.person_id,
    new.seller_id,seller_name,new.installation_value,new.monthly_value,
    adjusted_snapshot,auth.uid(),clock_timestamp()
  );
  return new;
end;
$$;

drop trigger if exists opportunity_won_commission_adjustment on public.opportunities;
create trigger opportunity_won_commission_adjustment
  after update of seller_id,installation_value,monthly_value on public.opportunities
  for each row execute function public.sync_won_sale_commission_adjustment();
revoke all on function public.sync_won_sale_commission_adjustment() from public,anon,authenticated;

create or replace view public.active_closed_sales
with (security_invoker = true)
as
select cs.id,cs.opportunity_id,latest.customer_id,latest.person_id,latest.seller_id,latest.seller_name_snapshot,
  cs.closed_at as first_closed_at,
  case when latest.event_type='adjusted' then cycle_close.created_at else latest.created_at end as effective_closed_at,
  latest.cycle_number,latest.installation_value,latest.monthly_value,latest.commercial_snapshot,
  cs.source,cs.created_at
from public.closed_sales cs
join public.opportunities o on o.id=cs.opportunity_id and o.status='won'
join lateral (
  select e.event_type,e.created_at,e.cycle_number,e.customer_id,e.person_id,e.seller_id,
    e.seller_name_snapshot,e.installation_value,e.monthly_value,e.commercial_snapshot,e.event_number
  from public.closed_sale_events e where e.closed_sale_id=cs.id
  order by e.event_number desc limit 1
) latest on latest.event_type in ('closed','reclosed','adjusted')
left join lateral (
  select e.created_at
  from public.closed_sale_events e
  where e.closed_sale_id=cs.id
    and e.cycle_number=latest.cycle_number
    and e.event_type in ('closed','reclosed')
  order by e.event_number asc limit 1
) cycle_close on latest.event_type='adjusted';

grant select on public.active_closed_sales to authenticated;
revoke all on public.active_closed_sales from anon;

commit;
