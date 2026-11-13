import type { SupabaseClient } from '@supabase/supabase-js'

export async function hasCompleteCustomerSchema(supabase: SupabaseClient) {
  const [people, customers, accountants] = await Promise.all([
    supabase.from('people').select('mobile_phone,state_registration,municipal_registration,icms_contributor,primary_cnae,tax_regime,registration_status,opened_at').limit(0),
    supabase.from('customers').select('accountant_id,seller_id,source').limit(0),
    supabase.from('accountants').select('id').limit(0),
  ])
  return !people.error && !customers.error && !accountants.error
}

export async function hasBusinessActivitySchema(supabase: SupabaseClient) {
  const { error } = await supabase.from('people').select('business_activity').limit(0)
  return !error
}

export async function hasCompleteAccountantSchema(supabase: SupabaseClient) {
  const { error } = await supabase.from('accountants')
    .select('trade_name,contact_name,mobile_phone,whatsapp,postal_code,address_line,address_number,address_extra,district,city,state')
    .limit(0)
  return !error
}

export async function hasAccountantRelationshipSchema(supabase: SupabaseClient) {
  const { error } = await supabase.from('accountants').select('relationship_type').limit(0)
  return !error
}

export async function hasHistoricalCustomerImportSchema(supabase: SupabaseClient) {
  const [customers, people, products] = await Promise.all([
    supabase.from('customers').select('monthly_fee,billing_day,legacy_code,legacy_contract_status').limit(0),
    supabase.from('people').select('whatsapp,state_registration,primary_cnae,registration_status,opened_at').limit(0),
    supabase.from('customer_products').select('customer_id,product_id').limit(0),
  ])
  return !customers.error && !people.error && !products.error
}

export async function hasClicksignContractSchema(supabase: SupabaseClient) {
  const { error } = await supabase.from('customer_contracts')
    .select('clicksign_envelope_id,clicksign_document_id,clicksign_signer_id,clicksign_status,clicksign_synced_at')
    .limit(0)
  return !error
}
