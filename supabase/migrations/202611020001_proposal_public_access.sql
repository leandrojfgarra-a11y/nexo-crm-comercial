-- Funções de acesso público limitado para links de propostas.
-- As tabelas permanecem sem políticas públicas; o token bruto nunca é persistido.
begin;

do $$ begin
  if to_regclass('public.proposals') is null
     or to_regclass('public.proposal_versions') is null
     or to_regclass('public.proposal_items') is null
     or to_regclass('public.proposal_links') is null
     or to_regclass('public.proposal_acceptances') is null
     or to_regclass('public.customers') is null
     or to_regclass('public.people') is null
     or not exists (select 1 from pg_catalog.pg_extension where extname = 'pgcrypto') then
    raise exception 'A migration inicial do NEXO com tabelas de propostas e pgcrypto é necessária.';
  end if;
end $$;

-- Resolve the installed pgcrypto schema from extension metadata. This keeps
-- SECURITY DEFINER functions independent from a writable search_path.
create or replace function public.crm_proposal_token_hash(p_token text)
returns text
language plpgsql
immutable
security definer
set search_path = pg_catalog
as $$
declare
  crypto_schema text;
  result text;
begin
  select n.nspname into crypto_schema
  from pg_catalog.pg_extension e
  join pg_catalog.pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pgcrypto';
  if crypto_schema is null then
    raise exception 'pgcrypto extension is required for proposal links';
  end if;
  execute pg_catalog.format(
    'select pg_catalog.encode(%I.digest(pg_catalog.convert_to($1, ''UTF8''), ''sha256''), ''hex'')',
    crypto_schema
  ) into result using p_token;
  return result;
end;
$$;

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
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'description', i.description,
        'quantity', i.quantity,
        'unit_price', i.unit_price,
        'line_total', i.line_total
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

create or replace function public.submit_public_proposal_acceptance(
  p_token text,
  p_declared_name text,
  p_declared_email text
)
returns text
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_proposal_id uuid;
  v_version_id uuid;
  v_status text;
  v_valid_until date;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$'
     or p_declared_name is null or length(btrim(p_declared_name)) not between 2 and 180
     or p_declared_email is null or length(btrim(p_declared_email)) > 254
     or btrim(p_declared_email) !~* '^[A-Z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then
    return 'invalid';
  end if;

  select p.id, v.id, p.status, p.valid_until
    into v_proposal_id, v_version_id, v_status, v_valid_until
  from public.proposal_links l
  join public.proposals p on p.id = l.proposal_id
  join public.proposal_versions v on v.proposal_id = p.id and v.version = p.current_version
  where l.token_hash = public.crm_proposal_token_hash(p_token)
    and l.revoked_at is null
    and l.expires_at > now()
  order by l.created_at desc
  limit 1;

  if v_proposal_id is null or v_status <> 'sent' or (v_valid_until is not null and v_valid_until < current_date) then
    return 'unavailable';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_proposal_id::text), pg_catalog.hashtext(v_version_id::text));
  if exists (
    select 1 from public.proposal_acceptances a
    where a.proposal_id = v_proposal_id and a.version_id = v_version_id
      and a.status = 'pending_internal_confirmation'
  ) then
    return 'already_submitted';
  end if;

  insert into public.proposal_acceptances(proposal_id, version_id, status, declared_name, declared_email)
  values (v_proposal_id, v_version_id, 'pending_internal_confirmation', btrim(p_declared_name), lower(btrim(p_declared_email)));
  return 'submitted';
end;
$$;

create or replace function public.revoke_proposal_links_on_new_version()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if new.current_version is distinct from old.current_version then
    update public.proposal_links
       set revoked_at = now()
     where proposal_id = new.id and revoked_at is null;
  end if;
  return new;
end;
$$;
drop trigger if exists proposals_revoke_links_on_version_change on public.proposals;
create trigger proposals_revoke_links_on_version_change
  after update of current_version on public.proposals
  for each row execute function public.revoke_proposal_links_on_new_version();

revoke all on function public.get_public_proposal(text) from public, anon, authenticated;
revoke all on function public.submit_public_proposal_acceptance(text, text, text) from public, anon, authenticated;
revoke all on function public.crm_proposal_token_hash(text) from public, anon, authenticated;
revoke all on function public.revoke_proposal_links_on_new_version() from public, anon, authenticated;
grant execute on function public.get_public_proposal(text) to anon, authenticated;
grant execute on function public.submit_public_proposal_acceptance(text, text, text) to anon, authenticated;

commit;
