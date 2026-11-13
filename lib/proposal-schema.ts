import type { SupabaseClient } from '@supabase/supabase-js'

export async function hasProposalPricingSchema(supabase: SupabaseClient) {
  const [versions, items] = await Promise.all([
    supabase.from('proposal_versions').select('monthly_total').limit(0),
    supabase.from('proposal_items').select('installation_unit_price,extra_description,extra_unit_price,monthly_unit_price,monthly_line_total').limit(0),
  ])
  return !versions.error && !items.error
}

export async function hasProposalBrandingSchema(supabase: SupabaseClient) {
  const [versions, items] = await Promise.all([
    (supabase as any).from('proposal_versions').select('brand_name,brand_tagline,logo_url,intro_text,first_billing_date,consultant_name,consultant_phone,consultant_email,consultant_city').limit(0),
    (supabase as any).from('proposal_items').select('optional').limit(0),
  ])
  return !versions.error && !items.error
}
