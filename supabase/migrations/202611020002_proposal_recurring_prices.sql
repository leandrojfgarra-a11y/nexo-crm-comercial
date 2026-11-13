-- Separa implantação, taxas extras e mensalidade em itens de propostas.
-- Preserva valores antigos como preço de instalação e não remove colunas existentes.
begin;

do $$ begin
  if to_regclass('public.proposal_versions') is null or to_regclass('public.proposal_items') is null then
    raise exception 'As tabelas public.proposal_versions e public.proposal_items são necessárias.';
  end if;
  if to_regprocedure('public.get_public_proposal(text)') is null
     or to_regprocedure('public.crm_proposal_token_hash(text)') is null then
    raise exception 'Aplique primeiro a migration 202611020001_proposal_public_access.sql.';
  end if;
end $$;

alter table public.proposal_versions
  add column if not exists monthly_total numeric(14,2) not null default 0;

alter table public.proposal_items
  add column if not exists installation_unit_price numeric(14,2) not null default 0,
  add column if not exists extra_description text,
  add column if not exists extra_unit_price numeric(14,2) not null default 0,
  add column if not exists monthly_unit_price numeric(14,2) not null default 0,
  add column if not exists monthly_line_total numeric(14,2) not null default 0;

-- Migra os preços unitários do formulário anterior para instalação, preservando
-- unit_price e line_total para compatibilidade com versões anteriores da tela.
update public.proposal_items
   set installation_unit_price = unit_price
 where installation_unit_price = 0
   and extra_unit_price = 0
   and monthly_unit_price = 0
   and unit_price > 0;

-- Atualiza somente o payload público seguro. As tabelas continuam sem policies
-- para anon; os links existentes mantêm token, validade e revogação originais.
create or replace function public.get_public_proposal(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  result jsonb;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    return null;
  end if;

  select jsonb_build_object(
    'proposal_number', p.proposal_number,
    'status', p.status,
    'valid_until', p.valid_until,
    'customer_name', coalesce(nullif(btrim(pe.trade_name), ''), pe.name),
    'version', v.version,
    'title', v.title,
    'terms', v.terms,
    'currency', v.currency,
    'subtotal', v.subtotal,
    'discount', v.discount,
    'total', v.total,
    'monthly_total', v.monthly_total,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'description', i.description,
        'quantity', i.quantity,
        'unit_price', i.unit_price,
        'line_total', i.line_total,
        'installation_unit_price', i.installation_unit_price,
        'extra_description', i.extra_description,
        'extra_unit_price', i.extra_unit_price,
        'monthly_unit_price', i.monthly_unit_price,
        'monthly_line_total', i.monthly_line_total
      ) order by i.position)
      from public.proposal_items i where i.version_id = v.id
    ), '[]'::jsonb)
  ) into result
  from public.proposal_links l
  join public.proposals p on p.id = l.proposal_id
  join public.proposal_versions v on v.proposal_id = p.id and v.version = p.current_version
  join public.customers c on c.id = p.customer_id
  join public.people pe on pe.id = c.person_id
  where l.token_hash = public.crm_proposal_token_hash(p_token)
    and l.revoked_at is null
    and l.expires_at > now()
    and p.status in ('sent', 'accepted', 'rejected', 'expired');

  return result;
end;
$$;
revoke all on function public.get_public_proposal(text) from public, anon, authenticated;
grant execute on function public.get_public_proposal(text) to anon, authenticated;

do $$ begin
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid='public.proposal_items'::regclass and conname='proposal_items_installation_unit_price_check') then
    alter table public.proposal_items add constraint proposal_items_installation_unit_price_check check (installation_unit_price >= 0);
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid='public.proposal_items'::regclass and conname='proposal_items_extra_unit_price_check') then
    alter table public.proposal_items add constraint proposal_items_extra_unit_price_check check (extra_unit_price >= 0);
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid='public.proposal_items'::regclass and conname='proposal_items_monthly_unit_price_check') then
    alter table public.proposal_items add constraint proposal_items_monthly_unit_price_check check (monthly_unit_price >= 0);
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid='public.proposal_items'::regclass and conname='proposal_items_monthly_line_total_check') then
    alter table public.proposal_items add constraint proposal_items_monthly_line_total_check check (monthly_line_total >= 0);
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conrelid='public.proposal_versions'::regclass and conname='proposal_versions_monthly_total_check') then
    alter table public.proposal_versions add constraint proposal_versions_monthly_total_check check (monthly_total >= 0);
  end if;
end $$;

commit;
