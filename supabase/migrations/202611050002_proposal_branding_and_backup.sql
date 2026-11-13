-- Identidade visual e condições comerciais imutáveis por versão da proposta.
-- O backup em nuvem é gravado como item opcional dentro de proposal_items.
begin;

do $$ begin
  if to_regclass('public.proposal_versions') is null
     or to_regclass('public.proposal_items') is null
     or to_regprocedure('public.is_crm_admin()') is null
     or to_regprocedure('public.get_public_proposal(text)') is null then
    raise exception 'Aplique as migrations comerciais e as migrations de acesso público/preços de propostas antes desta migration.';
  end if;
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='proposal_versions' and column_name='monthly_total')
     or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='proposal_items' and column_name='monthly_line_total') then
    raise exception 'Aplique 202611020002_proposal_recurring_prices.sql antes desta migration.';
  end if;
end $$;

alter table public.proposal_versions
  add column if not exists brand_name varchar(120),
  add column if not exists brand_tagline varchar(180),
  add column if not exists logo_url text,
  add column if not exists intro_text varchar(1200),
  add column if not exists first_billing_date date,
  add column if not exists consultant_name varchar(120),
  add column if not exists consultant_phone varchar(60),
  add column if not exists consultant_email varchar(254),
  add column if not exists consultant_city varchar(120);
alter table public.proposal_items
  add column if not exists optional boolean not null default false;

-- Logo é material institucional, sem dados de clientes. Leitura pública permite
-- exibição no PDF e na proposta compartilhada; escrita permanece só para admin.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('nexo-proposal-assets', 'nexo-proposal-assets', true, 1572864, array['image/png','image/jpeg','image/webp']::text[])
on conflict (id) do update set public = true, file_size_limit = 1572864,
  allowed_mime_types = array['image/png','image/jpeg','image/webp']::text[];

drop policy if exists nexo_proposal_logo_public_read on storage.objects;
create policy nexo_proposal_logo_public_read on storage.objects for select to public
  using (bucket_id = 'nexo-proposal-assets' and (storage.foldername(name))[1] = 'logos');
drop policy if exists nexo_proposal_logo_admin_insert on storage.objects;
create policy nexo_proposal_logo_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'nexo-proposal-assets' and (storage.foldername(name))[1] = 'logos' and public.is_crm_admin());
drop policy if exists nexo_proposal_logo_admin_update on storage.objects;
create policy nexo_proposal_logo_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'nexo-proposal-assets' and (storage.foldername(name))[1] = 'logos' and public.is_crm_admin())
  with check (bucket_id = 'nexo-proposal-assets' and (storage.foldername(name))[1] = 'logos' and public.is_crm_admin());
drop policy if exists nexo_proposal_logo_admin_delete on storage.objects;
create policy nexo_proposal_logo_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'nexo-proposal-assets' and (storage.foldername(name))[1] = 'logos' and public.is_crm_admin());

create or replace function public.get_public_proposal(p_token text)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog
as $$
declare result jsonb;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then return null; end if;
  select jsonb_build_object(
    'proposal_number', p.proposal_number, 'status', p.status, 'valid_until', p.valid_until,
    'customer_name', coalesce(nullif(btrim(pe.trade_name), ''), pe.name),
    'customer_tax_id', pe.tax_id,
    'version', v.version, 'title', v.title, 'terms', v.terms, 'currency', v.currency,
    'subtotal', v.subtotal, 'discount', v.discount, 'total', v.total, 'monthly_total', v.monthly_total,
    'brand_name', v.brand_name, 'brand_tagline', v.brand_tagline, 'logo_url', v.logo_url,
    'intro_text', v.intro_text, 'first_billing_date', v.first_billing_date,
    'consultant_name', v.consultant_name, 'consultant_phone', v.consultant_phone,
    'consultant_email', v.consultant_email, 'consultant_city', v.consultant_city,
    'items', coalesce((select jsonb_agg(jsonb_build_object(
      'description', i.description, 'quantity', i.quantity, 'unit_price', i.unit_price,
      'line_total', i.line_total, 'installation_unit_price', i.installation_unit_price,
      'extra_description', i.extra_description, 'extra_unit_price', i.extra_unit_price,
      'monthly_unit_price', i.monthly_unit_price, 'monthly_line_total', i.monthly_line_total,
      'optional', i.optional
    ) order by i.position) from public.proposal_items i where i.version_id = v.id), '[]'::jsonb)
  ) into result
  from public.proposal_links l
  join public.proposals p on p.id = l.proposal_id
  join public.proposal_versions v on v.proposal_id = p.id and v.version = p.current_version
  join public.customers c on c.id = p.customer_id
  join public.people pe on pe.id = c.person_id
  where l.token_hash = public.crm_proposal_token_hash(p_token)
    and l.revoked_at is null and l.expires_at > now()
    and p.status in ('sent','accepted','rejected','expired');
  return result;
end;
$$;
revoke all on function public.get_public_proposal(text) from public, anon, authenticated;
grant execute on function public.get_public_proposal(text) to anon, authenticated;

commit;
