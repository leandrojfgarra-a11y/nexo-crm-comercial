import type { SupabaseClient } from '@supabase/supabase-js'

export async function hasSellerCommercialSchema(supabase: SupabaseClient) {
  const { error } = await supabase.from('sellers')
    .select('seller_type,user_id,installation_commission_percent,monthly_commission_percent,monthly_commission_mode,monthly_commission_competencies')
    .limit(0)
  return !error
}

export async function hasSellerInstallationGoalSchema(supabase: SupabaseClient) {
  const { error } = await supabase.from('sellers').select('monthly_installation_goal_count').limit(0)
  return !error
}
