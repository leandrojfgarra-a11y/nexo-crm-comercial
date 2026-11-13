-- Campos de rastreamento da integração Clicksign API v3.
-- Não envia contratos nem altera o status dos registros existentes.
begin;

do $$ begin
  if to_regclass('public.customer_contracts') is null
     or to_regprocedure('public.is_crm_admin()') is null then
    raise exception 'Aplique primeiro as migrations de contratos e autorização administrativa do NEXO.';
  end if;
end $$;

alter table public.customer_contracts
  add column if not exists clicksign_envelope_id text,
  add column if not exists clicksign_document_id text,
  add column if not exists clicksign_signer_id text,
  add column if not exists clicksign_status text,
  add column if not exists clicksign_synced_at timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.customer_contracts'::regclass and conname='customer_contracts_clicksign_status_check') then
    alter table public.customer_contracts add constraint customer_contracts_clicksign_status_check
      check (clicksign_status is null or clicksign_status in ('draft','running','closed','canceled'));
  end if;
end $$;

create unique index if not exists customer_contracts_clicksign_envelope_unique_idx
  on public.customer_contracts(clicksign_envelope_id) where clicksign_envelope_id is not null;

comment on column public.customer_contracts.clicksign_envelope_id is 'ID do envelope Clicksign v3. Não contém credenciais.';
comment on column public.customer_contracts.clicksign_status is 'Último status consultado na Clicksign: draft, running, closed ou canceled.';

commit;
