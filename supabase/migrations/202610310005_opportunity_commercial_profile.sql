-- Ficha comercial detalhada do Kanban. Requer migrations do CRM até 004.
-- A tabela de produtos guarda serviços/produtos adicionais; product_id existente
-- continua sendo o produto principal da oportunidade.
begin;

do $$ begin
  if to_regclass('public.opportunities') is null or to_regclass('public.products') is null
     or to_regclass('public.activities') is null or to_regclass('public.opportunity_events') is null then
    raise exception 'Aplique primeiro as migrations-base do funil e atividades.';
  end if;
end $$;

alter table public.opportunities add column if not exists converted_at date;
alter table public.opportunities add column if not exists monthly_due_day smallint;
alter table public.opportunities add column if not exists implementation_owner text;
alter table public.opportunities add column if not exists installation_date date;
alter table public.opportunities add column if not exists training_date date;
alter table public.opportunities add column if not exists trainings_needed text;
alter table public.opportunities add column if not exists invoice_limit integer;
alter table public.opportunities add column if not exists system_version text;
alter table public.opportunities add column if not exists nfce_version text;
alter table public.opportunities add column if not exists mdfe_version text;
alter table public.opportunities add column if not exists technical_notes text;
alter table public.opportunities add column if not exists contract_status text not null default 'pending';
alter table public.opportunities add column if not exists boleto_delivery_method text;
alter table public.opportunities add column if not exists installation_fee_status text not null default 'pending';
alter table public.opportunities add column if not exists installation_fee_payment_method text;
alter table public.opportunities add column if not exists installation_fee_paid_at date;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.opportunities'::regclass and conname='opportunities_monthly_due_day_check') then
    alter table public.opportunities add constraint opportunities_monthly_due_day_check check (monthly_due_day is null or monthly_due_day between 1 and 31);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.opportunities'::regclass and conname='opportunities_invoice_limit_check') then
    alter table public.opportunities add constraint opportunities_invoice_limit_check check (invoice_limit is null or invoice_limit >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.opportunities'::regclass and conname='opportunities_contract_status_check') then
    alter table public.opportunities add constraint opportunities_contract_status_check check (contract_status in ('pending','sent','signed','cancelled'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.opportunities'::regclass and conname='opportunities_installation_fee_status_check') then
    alter table public.opportunities add constraint opportunities_installation_fee_status_check check (installation_fee_status in ('pending','reported_paid','waived','cancelled'));
  end if;
end $$;

create table if not exists public.opportunity_products (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint opportunity_products_unique unique (opportunity_id, product_id)
);
create index if not exists opportunity_products_product_idx on public.opportunity_products(product_id);

-- Substitui a lista adicional numa única transação, validando catálogo e
-- impedindo que o produto principal também seja gravado como adicional.
create or replace function public.set_opportunity_products(p_opportunity_id uuid, p_product_ids uuid[])
returns void language plpgsql security invoker set search_path=pg_catalog,public,auth
as $$
declare primary_id uuid; selected_ids uuid[] := coalesce(p_product_ids, array[]::uuid[]);
begin
  if cardinality(selected_ids) > 100 then raise exception 'Selecione no máximo 100 itens adicionais.'; end if;
  if cardinality(selected_ids) <> (select count(distinct item_id) from unnest(selected_ids) as ids(item_id)) then
    raise exception 'A lista contém produtos repetidos.';
  end if;
  select product_id into primary_id from public.opportunities where id=p_opportunity_id;
  if not found then raise exception 'Oportunidade não encontrada.'; end if;
  if primary_id = any(selected_ids) then raise exception 'Produto principal repetido como adicional.'; end if;
  if exists (select 1 from unnest(selected_ids) as ids(item_id) left join public.products p on p.id=ids.item_id where p.id is null or not p.active) then
    raise exception 'Há produto ou serviço inexistente ou inativo.';
  end if;
  delete from public.opportunity_products where opportunity_id=p_opportunity_id and not (product_id = any(selected_ids));
  insert into public.opportunity_products(opportunity_id,product_id)
    select p_opportunity_id,item_id from unnest(selected_ids) as ids(item_id)
    on conflict (opportunity_id,product_id) do nothing;
end;
$$;

alter table public.opportunity_products enable row level security;
drop policy if exists crm_admin_only on public.opportunity_products;
create policy crm_admin_only on public.opportunity_products for all to authenticated
  using (public.is_crm_admin()) with check (public.is_crm_admin());
grant select, insert, update, delete on public.opportunity_products to authenticated;
revoke all on public.opportunity_products from anon;
revoke all on function public.set_opportunity_products(uuid,uuid[]) from public,anon;
grant execute on function public.set_opportunity_products(uuid,uuid[]) to authenticated;

-- Estende o histórico da oportunidade sem criar um segundo evento para os
-- campos que a migration 004 já auditava.
create or replace function public.record_opportunity_event()
returns trigger language plpgsql set search_path=pg_catalog,public,auth
as $$
declare old_name text; new_name text;
begin
  if TG_OP='INSERT' then
    select name into new_name from public.pipeline_stages where id=new.stage_id;
    if new.lead_id is not null then
      insert into public.opportunity_events(opportunity_id,event_type,old_value,new_value,note,actor_id)
      values(new.id,'stage_changed',jsonb_build_object('stage_name','Leads'),jsonb_build_object('stage_id',new.stage_id,'stage_name',new_name,'status',new.status),'Lead avançado para oportunidade.',auth.uid());
    else
      insert into public.opportunity_events(opportunity_id,event_type,old_value,new_value,note,actor_id)
      values(new.id,'created',null,jsonb_build_object('stage_id',new.stage_id,'stage_name',new_name,'status',new.status),'Oportunidade criada.',auth.uid());
    end if;
    return new;
  end if;
  if new.stage_id is distinct from old.stage_id then
    select name into old_name from public.pipeline_stages where id=old.stage_id;
    select name into new_name from public.pipeline_stages where id=new.stage_id;
    insert into public.opportunity_events(opportunity_id,event_type,old_value,new_value,note,actor_id)
    values(new.id,'stage_changed',jsonb_build_object('stage_id',old.stage_id,'stage_name',old_name,'status',old.status),
      jsonb_build_object('stage_id',new.stage_id,'stage_name',new_name,'status',new.status),case when new.status='won' then 'Oportunidade concluída (WON).' else null end,auth.uid());
  elsif new.status is distinct from old.status or new.closure_type is distinct from old.closure_type then
    insert into public.opportunity_events(opportunity_id,event_type,old_value,new_value,note,actor_id)
    values(new.id,'closed',jsonb_build_object('status',old.status,'closure_type',old.closure_type),jsonb_build_object('status',new.status,'closure_type',new.closure_type),new.closure_reason,auth.uid());
  elsif row(new.title,new.seller_id,new.product_id,new.installation_value,new.monthly_value,new.opened_at,new.expected_close_date,new.notes,
    new.converted_at,new.monthly_due_day,new.implementation_owner,new.installation_date,new.training_date,new.trainings_needed,new.invoice_limit,
    new.system_version,new.nfce_version,new.mdfe_version,new.technical_notes,new.contract_status,new.boleto_delivery_method,
    new.installation_fee_status,new.installation_fee_payment_method,new.installation_fee_paid_at)
    is distinct from row(old.title,old.seller_id,old.product_id,old.installation_value,old.monthly_value,old.opened_at,old.expected_close_date,old.notes,
    old.converted_at,old.monthly_due_day,old.implementation_owner,old.installation_date,old.training_date,old.trainings_needed,old.invoice_limit,
    old.system_version,old.nfce_version,old.mdfe_version,old.technical_notes,old.contract_status,old.boleto_delivery_method,
    old.installation_fee_status,old.installation_fee_payment_method,old.installation_fee_paid_at) then
    insert into public.opportunity_events(opportunity_id,event_type,old_value,new_value,actor_id)
    values(new.id,'opportunity_updated',to_jsonb(old),to_jsonb(new),auth.uid());
  end if;
  if new.lead_id is distinct from old.lead_id or new.customer_id is distinct from old.customer_id then
    insert into public.opportunity_events(opportunity_id,event_type,old_value,new_value,actor_id)
    values(new.id,'relationship_updated',jsonb_build_object('lead_id',old.lead_id,'customer_id',old.customer_id),jsonb_build_object('lead_id',new.lead_id,'customer_id',new.customer_id),auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists opportunity_events_audit on public.opportunities;
create trigger opportunity_events_audit
  after insert or update of stage_id,status,closure_type,closure_reason,lead_id,customer_id,title,seller_id,product_id,installation_value,monthly_value,opened_at,expected_close_date,notes,
    converted_at,monthly_due_day,implementation_owner,installation_date,training_date,trainings_needed,invoice_limit,system_version,nfce_version,mdfe_version,technical_notes,
    contract_status,boleto_delivery_method,installation_fee_status,installation_fee_payment_method,installation_fee_paid_at
  on public.opportunities for each row execute function public.record_opportunity_event();

create or replace function public.record_opportunity_product_event()
returns trigger language plpgsql set search_path=pg_catalog,public,auth
as $$
declare target_id uuid; product_label text;
begin
  target_id := case when TG_OP='DELETE' then old.opportunity_id else new.opportunity_id end;
  select name into product_label from public.products where id=case when TG_OP='DELETE' then old.product_id else new.product_id end;
  insert into public.opportunity_events(opportunity_id,event_type,old_value,new_value,note,actor_id)
  values(target_id,'products_updated',case when TG_OP='DELETE' then jsonb_build_object('product_id',old.product_id,'product',product_label) else null end,
    case when TG_OP='INSERT' then jsonb_build_object('product_id',new.product_id,'product',product_label) else null end,
    case when TG_OP='DELETE' then 'Produto/serviço adicional removido.' else 'Produto/serviço adicional incluído.' end,auth.uid());
  if TG_OP='DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists opportunity_products_audit on public.opportunity_products;
create trigger opportunity_products_audit after insert or delete on public.opportunity_products
for each row execute function public.record_opportunity_product_event();

commit;
