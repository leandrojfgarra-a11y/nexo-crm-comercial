import type { SupabaseClient } from '@supabase/supabase-js'

export async function hasProductCatalogSchema(supabase: SupabaseClient) {
  const { error } = await supabase.from('products')
    .select('internal_code,commercial_category,default_installation_value,default_monthly_value,standard_cost,billing_mode,reference_price,kind,active')
    .limit(0)
  return !error
}

