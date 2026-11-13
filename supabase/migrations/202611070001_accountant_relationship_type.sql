-- Classificação comercial para separar escritórios parceiros de potenciais parceiros.
-- Registros existentes permanecem sem classificação para revisão manual.
begin;

do $$ begin
  if to_regclass('public.accountants') is null then
    raise exception 'Tabela public.accountants ausente; aplique primeiro as migrations de cadastro de contabilidades.';
  end if;
end $$;

alter table public.accountants
  add column if not exists relationship_type text;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.accountants'::regclass
      and conname = 'accountants_relationship_type_check'
  ) then
    alter table public.accountants
      add constraint accountants_relationship_type_check
      check (relationship_type is null or relationship_type in ('lead', 'partner'));
  end if;
end $$;

create index if not exists accountants_relationship_type_name_idx
  on public.accountants(relationship_type, name);

commit;
