-- Funil comercial funcional. Migration incremental e transacional.
-- Reusa IDs existentes; preserva etapas antigas inativadas e oportunidades vinculadas.
begin;

do $$ begin
  if to_regclass('public.people') is null or to_regclass('public.leads') is null
     or to_regclass('public.customers') is null or to_regclass('public.sellers') is null
     or to_regclass('public.products') is null or to_regclass('public.pipelines') is null
     or to_regclass('public.pipeline_stages') is null or to_regclass('public.opportunities') is null
     or to_regclass('public.opportunity_events') is null then
    raise exception 'Schema comercial incompleto; confirme as tabelas existentes antes da migration.';
  end if;
  if not exists (
    select 1 from pg_constraint c
    where c.conrelid='public.opportunities'::regclass
      and c.conname='opportunities_stage_belongs_to_pipeline'
      and c.contype='f' and c.convalidated
      and c.confrelid='public.pipeline_stages'::regclass
      and (select array_agg(a.attname::text order by k.ordinality)
           from unnest(c.conkey) with ordinality k(attnum,ordinality)
           join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum)=array['stage_id','pipeline_id']::text[]
      and (select array_agg(a.attname::text order by k.ordinality)
           from unnest(c.confkey) with ordinality k(attnum,ordinality)
           join pg_attribute a on a.attrelid=c.confrelid and a.attnum=k.attnum)=array['id','pipeline_id']::text[]
  ) then
    raise exception 'Restrição de etapa/pipeline não encontrada; nenhuma etapa foi alterada.';
  end if;
  if not exists (select 1 from public.pipelines where id='00000000-0000-0000-0000-000000000001'::uuid and name='Funil Comercial') then
    raise exception 'Pipeline Funil Comercial (ID e nome esperados) não encontrado; nenhuma etapa foi alterada.';
  end if;
  if exists (
    select 1 from public.opportunities o join public.pipeline_stages s on s.id=o.stage_id
    where s.pipeline_id='00000000-0000-0000-0000-000000000001'::uuid
      and o.status in ('open','won')
      and s.name not in ('Novo','Qualificação','Proposta Enviada','Negociação','Ganho','Perdido',
        'Leads','1º contato','Em análise','Aprovado','Contrato assinado','Taxa paga','Concluído')
  ) then
    raise exception 'Oportunidades abertas em etapas customizadas: revise os vínculos antes da migration.';
  end if;
  if exists (
    select 1
    from (values ('Novo','Leads'),('Qualificação','Em análise'),('Proposta Enviada','Aprovado'),
      ('Negociação','Contrato assinado'),('Ganho','Concluído')) m(old_name,new_name)
    join public.pipeline_stages old_stage on old_stage.pipeline_id='00000000-0000-0000-0000-000000000001'::uuid and old_stage.name=m.old_name
    join public.pipeline_stages new_stage on new_stage.pipeline_id='00000000-0000-0000-0000-000000000001'::uuid and new_stage.name=m.new_name
    join public.opportunities o on o.stage_id=old_stage.id and o.status in ('open','won')
  ) then
    raise exception 'Etapa antiga e etapa canônica coexistem com oportunidades abertas. Revise os vínculos antes da migration.';
  end if;
end $$;

-- As alterações históricas desta migration são gravadas explicitamente abaixo.
-- Retirar o trigger de mesmo nome evita eventos duplicados durante a consolidação;
-- a transação restaura-o automaticamente se ocorrer qualquer erro.
drop trigger if exists opportunity_events_audit on public.opportunities;

alter table public.pipeline_stages add column if not exists active boolean not null default true;
alter table public.opportunities add column if not exists lead_id uuid references public.leads(id) on delete set null;
alter table public.opportunities add column if not exists customer_id uuid references public.customers(id) on delete set null;
alter table public.opportunities add column if not exists product_id uuid references public.products(id) on delete set null;
alter table public.opportunities add column if not exists installation_value numeric(14,2) check (installation_value is null or installation_value >= 0);
alter table public.opportunities add column if not exists monthly_value numeric(14,2) check (monthly_value is null or monthly_value >= 0);
alter table public.opportunities add column if not exists opened_at date;
update public.opportunities set opened_at=created_at::date where opened_at is null;
alter table public.opportunities alter column opened_at set default current_date;
alter table public.opportunities alter column opened_at set not null;
alter table public.opportunities add column if not exists notes text;
alter table public.opportunities add column if not exists closure_type text;
alter table public.opportunities add column if not exists closure_reason text;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.opportunities'::regclass and conname='opportunities_lead_customer_exclusive') then
    alter table public.opportunities add constraint opportunities_lead_customer_exclusive check (lead_id is null or customer_id is null);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.opportunities'::regclass and conname='opportunities_closure_type_check') then
    alter table public.opportunities add constraint opportunities_closure_type_check check (closure_type is null or closure_type in ('lost','rejected'));
  end if;
end $$;

create unique index if not exists opportunities_one_per_lead_idx on public.opportunities(lead_id) where lead_id is not null;
create index if not exists opportunities_customer_idx on public.opportunities(customer_id) where customer_id is not null;

-- Mapas de etapa renomeiam o registro existente. Em colisões, mantêm o ID antigo
-- e seus vínculos em uma etapa inativa; não movem oportunidades históricas.
do $$
declare m record; old_id uuid; new_id uuid; max_pos bigint;
begin
  -- Quando as sete etapas já estão corretas, preserva suas linhas e posições;
  -- somente arquiva etapas extras ativas, se existirem.
  if not exists (
      select 1 from (values
        ('Leads',0,false),('1º contato',1,false),('Em análise',2,false),('Aprovado',3,false),
        ('Contrato assinado',4,false),('Taxa paga',5,false),('Concluído',6,true)
      ) d(name,position,is_won)
      left join public.pipeline_stages s on s.pipeline_id='00000000-0000-0000-0000-000000000001'::uuid and s.name=d.name
      where s.id is null or not s.active or s.position<>d.position or s.is_won<>d.is_won or s.is_lost
  ) then
    insert into public.opportunity_events(opportunity_id,event_type,old_value,new_value,note)
      select o.id,'closed',jsonb_build_object('status',o.status),jsonb_build_object('status','lost','closure_type','lost'),
        'Encerramento herdado da antiga etapa Perdido; motivo histórico não disponível.'
      from public.opportunities o join public.pipeline_stages s on s.id=o.stage_id
      where s.pipeline_id='00000000-0000-0000-0000-000000000001'::uuid and s.name='Perdido' and o.status <> 'lost';
    update public.opportunities o set status='lost',closure_type=coalesce(o.closure_type,'lost')
      where o.stage_id in (select id from public.pipeline_stages where pipeline_id='00000000-0000-0000-0000-000000000001'::uuid and name='Perdido')
        and o.status <> 'lost';
    update public.pipeline_stages set active=false,is_lost=true,is_won=false
      where pipeline_id='00000000-0000-0000-0000-000000000001'::uuid and name='Perdido';
    update public.pipeline_stages set active=false
      where pipeline_id='00000000-0000-0000-0000-000000000001'::uuid and active
        and name not in ('Leads','1º contato','Em análise','Aprovado','Contrato assinado','Taxa paga','Concluído');
  else
  for m in select * from (values
    ('Novo','Leads'),('Qualificação','Em análise'),('Proposta Enviada','Aprovado'),
    ('Negociação','Contrato assinado'),('Ganho','Concluído')
  ) as x(old_name,new_name)
  loop
    select id into old_id from public.pipeline_stages where pipeline_id='00000000-0000-0000-0000-000000000001'::uuid and name=m.old_name;
    select id into new_id from public.pipeline_stages where pipeline_id='00000000-0000-0000-0000-000000000001'::uuid and name=m.new_name;
    if old_id is not null and new_id is null then
      update public.pipeline_stages set name=m.new_name where id=old_id;
    elsif old_id is not null and new_id is not null and old_id <> new_id then
      update public.pipeline_stages set active=false where id=old_id;
    end if;
  end loop;

  insert into public.opportunity_events(opportunity_id,event_type,old_value,new_value,note)
    select o.id,'closed',jsonb_build_object('status',o.status),jsonb_build_object('status','lost','closure_type','lost'),'Encerramento herdado da antiga etapa Perdido; motivo histórico não disponível.'
    from public.opportunities o join public.pipeline_stages s on s.id=o.stage_id
    where s.pipeline_id='00000000-0000-0000-0000-000000000001'::uuid and s.name='Perdido' and o.status <> 'lost';
  update public.opportunities o set status='lost', closure_type=coalesce(o.closure_type,'lost')
    where o.stage_id in (select id from public.pipeline_stages where pipeline_id='00000000-0000-0000-0000-000000000001'::uuid and name='Perdido')
      and o.status <> 'lost';
  update public.pipeline_stages set active=false,is_lost=true,is_won=false
    where pipeline_id='00000000-0000-0000-0000-000000000001'::uuid and name='Perdido';

  insert into public.opportunity_events(opportunity_id,event_type,old_value,new_value,note)
    select o.id,'closed',jsonb_build_object('status',o.status),jsonb_build_object('status','won'),
      'Situação WON herdada da antiga etapa Ganho.'
    from public.opportunities o join public.pipeline_stages s on s.id=o.stage_id
    where s.pipeline_id='00000000-0000-0000-0000-000000000001'::uuid and s.name='Concluído' and o.status='open';
  update public.opportunities o set status='won'
    where o.stage_id in (select id from public.pipeline_stages where pipeline_id='00000000-0000-0000-0000-000000000001'::uuid and name='Concluído')
      and o.status='open';

  -- Desloca posições para além do maior valor atual antes de definir a ordem final.
  select coalesce(max(position),0) into max_pos from public.pipeline_stages
    where pipeline_id='00000000-0000-0000-0000-000000000001'::uuid;
  if max_pos > 1073741822 then raise exception 'Posições de etapa fora do limite seguro; revise o funil.'; end if;
  update public.pipeline_stages set position=position+max_pos+1,active=false
    where pipeline_id='00000000-0000-0000-0000-000000000001'::uuid;
  insert into public.pipeline_stages(pipeline_id,name,position,active,is_won,is_lost) values
    ('00000000-0000-0000-0000-000000000001','Leads',0,true,false,false),
    ('00000000-0000-0000-0000-000000000001','1º contato',1,true,false,false),
    ('00000000-0000-0000-0000-000000000001','Em análise',2,true,false,false),
    ('00000000-0000-0000-0000-000000000001','Aprovado',3,true,false,false),
    ('00000000-0000-0000-0000-000000000001','Contrato assinado',4,true,false,false),
    ('00000000-0000-0000-0000-000000000001','Taxa paga',5,true,false,false),
    ('00000000-0000-0000-0000-000000000001','Concluído',6,true,true,false)
  on conflict (pipeline_id,name) do update set active=true;
  update public.pipeline_stages s set position=d.position,active=true,is_won=(d.position=6),is_lost=false
    from (values ('Leads',0),('1º contato',1),('Em análise',2),('Aprovado',3),('Contrato assinado',4),('Taxa paga',5),('Concluído',6)) d(name,position)
    where s.pipeline_id='00000000-0000-0000-0000-000000000001'::uuid and s.name=d.name;
  end if;
end $$;

create or replace function public.record_opportunity_event()
returns trigger language plpgsql set search_path=pg_catalog,public,auth
as $$
declare old_name text; new_name text; old_stage_id uuid;
begin
  if TG_OP='INSERT' then
    select name into new_name from public.pipeline_stages where id=new.stage_id;
    if new.lead_id is not null then
      select id into old_stage_id from public.pipeline_stages
        where pipeline_id=new.pipeline_id and name='Leads' and active=true;
      insert into public.opportunity_events(opportunity_id,event_type,old_value,new_value,note,actor_id)
      values (new.id,'stage_changed',jsonb_build_object('stage_id',old_stage_id,'stage_name','Leads'),
        jsonb_build_object('stage_id',new.stage_id,'stage_name',new_name,'status',new.status),'Lead avançado para oportunidade.',auth.uid());
    else
      insert into public.opportunity_events(opportunity_id,event_type,old_value,new_value,note,actor_id)
      values (new.id,'created',null,jsonb_build_object('stage_id',new.stage_id,'stage_name',new_name,'status',new.status),'Oportunidade criada.',auth.uid());
    end if;
    return new;
  end if;
  if new.stage_id is distinct from old.stage_id then
    select name into old_name from public.pipeline_stages where id=old.stage_id;
    select name into new_name from public.pipeline_stages where id=new.stage_id;
    insert into public.opportunity_events(opportunity_id,event_type,old_value,new_value,note,actor_id)
    values (new.id,'stage_changed',jsonb_build_object('stage_id',old.stage_id,'stage_name',old_name,'status',old.status),
      jsonb_build_object('stage_id',new.stage_id,'stage_name',new_name,'status',new.status),
      case when new.status='won' then 'Oportunidade concluída (WON).' else null end,auth.uid());
  elsif new.status is distinct from old.status or new.closure_type is distinct from old.closure_type then
    insert into public.opportunity_events(opportunity_id,event_type,old_value,new_value,note,actor_id)
    values (new.id,'closed',jsonb_build_object('status',old.status,'closure_type',old.closure_type),
      jsonb_build_object('status',new.status,'closure_type',new.closure_type),new.closure_reason,auth.uid());
  elsif row(new.title,new.seller_id,new.product_id,new.installation_value,new.monthly_value,new.opened_at,new.expected_close_date,new.notes)
        is distinct from row(old.title,old.seller_id,old.product_id,old.installation_value,old.monthly_value,old.opened_at,old.expected_close_date,old.notes) then
    insert into public.opportunity_events(opportunity_id,event_type,old_value,new_value,actor_id)
    values (new.id,'opportunity_updated',to_jsonb(old),to_jsonb(new),auth.uid());
  end if;
  if new.lead_id is distinct from old.lead_id or new.customer_id is distinct from old.customer_id then
    insert into public.opportunity_events(opportunity_id,event_type,old_value,new_value,actor_id)
    values (new.id,'relationship_updated',jsonb_build_object('lead_id',old.lead_id,'customer_id',old.customer_id),
      jsonb_build_object('lead_id',new.lead_id,'customer_id',new.customer_id),auth.uid());
  end if;
  return new;
end;
$$;

create trigger opportunity_events_audit
  after insert or update of stage_id,status,closure_type,closure_reason,lead_id,customer_id,title,seller_id,product_id,installation_value,monthly_value,opened_at,expected_close_date,notes
  on public.opportunities for each row execute function public.record_opportunity_event();

commit;

