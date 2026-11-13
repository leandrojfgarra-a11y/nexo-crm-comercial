-- NEXO CRM: ramo de atividade textual independente do CNAE principal.
-- Adição opcional e não destrutiva; a política RLS existente de public.people permanece aplicada.
begin;

do $$ begin
  if to_regclass('public.people') is null then
    raise exception 'Tabela public.people ausente; aplique primeiro a migration inicial do NEXO.';
  end if;
end $$;

alter table public.people
  add column if not exists business_activity varchar(150);

commit;
