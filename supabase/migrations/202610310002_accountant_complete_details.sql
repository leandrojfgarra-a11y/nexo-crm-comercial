-- NEXO CRM: dados completos de contato/endereço de contadores e escritórios.
-- Requer 202610310001_customer_complete_registration.sql (tabela accountants).
-- Somente adiciona colunas opcionais; preserva registros e vínculos existentes.
begin;

do $$ begin
  if to_regclass('public.accountants') is null then
    raise exception 'Tabela public.accountants ausente; aplique primeiro a migration de cadastro completo.';
  end if;
end $$;

alter table public.accountants add column if not exists trade_name text;
alter table public.accountants add column if not exists contact_name text;
alter table public.accountants add column if not exists mobile_phone text;
alter table public.accountants add column if not exists whatsapp text;
alter table public.accountants add column if not exists postal_code text;
alter table public.accountants add column if not exists address_line text;
alter table public.accountants add column if not exists address_number text;
alter table public.accountants add column if not exists address_extra text;
alter table public.accountants add column if not exists district text;
alter table public.accountants add column if not exists city text;
alter table public.accountants add column if not exists state text;

commit;
