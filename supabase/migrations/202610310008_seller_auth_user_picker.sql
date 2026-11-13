-- Seletor seguro de usuários Auth para vendedores internos.
-- Requer a migration 007; não altera policies RLS de tabelas existentes.
begin;

do $$ begin
  if to_regclass('public.sellers') is null or to_regprocedure('public.is_crm_admin()') is null
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='sellers' and column_name='user_id') then
    raise exception 'A migration 007 e public.is_crm_admin() são necessárias antes do seletor de usuários.';
  end if;
  if exists (select 1 from public.sellers where user_id is not null group by user_id having count(*) > 1) then
    raise exception 'Há usuários vinculados a mais de um vendedor. Resolva esses vínculos manualmente e reaplique esta migration; nenhum vínculo foi alterado.';
  end if;
end $$;

create unique index if not exists sellers_user_id_unique_idx
  on public.sellers(user_id) where user_id is not null;

create or replace function public.search_crm_auth_users(
  p_search text,
  p_current_seller_id uuid default null,
  p_include_user_id uuid default null
)
returns table(user_id uuid, display_name text, email text)
language plpgsql
security definer
set search_path=pg_catalog,public,auth
as $$
declare query_text text := btrim(coalesce(p_search,''));
begin
  if not coalesce(public.is_crm_admin(),false) then
    raise exception 'Acesso negado.' using errcode='42501';
  end if;
  if p_current_seller_id is not null and not exists (select 1 from public.sellers s where s.id=p_current_seller_id) then
    raise exception 'Vendedor não encontrado.' using errcode='22023';
  end if;
  if p_include_user_id is not null and (p_current_seller_id is null or not exists (
    select 1 from public.sellers s where s.id=p_current_seller_id and s.user_id=p_include_user_id
  )) then
    raise exception 'Usuário não pertence ao vendedor selecionado.' using errcode='42501';
  end if;

  return query
    select u.id,
      coalesce(nullif(btrim(u.raw_user_meta_data->>'full_name'),''),
               nullif(btrim(u.raw_user_meta_data->>'name'),''),
               nullif(btrim(u.raw_user_meta_data->>'display_name'),''),
               nullif(split_part(coalesce(u.email,''),'@',1),''),
               'Usuário sem nome') as display_name,
      u.email::text
    from auth.users u
    where (
      (p_include_user_id is not null and u.id=p_include_user_id)
      or (length(query_text) >= 2 and (
        coalesce(u.email,'') ilike '%' || query_text || '%'
        or coalesce(u.raw_user_meta_data->>'full_name','') ilike '%' || query_text || '%'
        or coalesce(u.raw_user_meta_data->>'name','') ilike '%' || query_text || '%'
        or coalesce(u.raw_user_meta_data->>'display_name','') ilike '%' || query_text || '%'
      ))
    )
    and not exists (
      select 1 from public.sellers s
      where s.user_id=u.id and (p_current_seller_id is null or s.id<>p_current_seller_id)
    )
    order by 2, 3
    limit 30;
end;
$$;

revoke all on function public.search_crm_auth_users(text,uuid,uuid) from public,anon;
grant execute on function public.search_crm_auth_users(text,uuid,uuid) to authenticated;

commit;
