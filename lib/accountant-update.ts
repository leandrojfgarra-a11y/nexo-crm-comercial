import type { SupabaseClient } from '@supabase/supabase-js'

export type AccountantUpdateResult = { status: 'updated' } | { status: 'not-found' } | { status: 'duplicate' | 'error' }

export async function updateAccountantForCompany(
  supabase: SupabaseClient,
  id: string,
  companyId: string,
  payload: Record<string, string | boolean | null>,
): Promise<AccountantUpdateResult> {
  const { data, error } = await supabase.from('accountants').update(payload)
    .eq('id', id).eq('company_id', companyId).select('id').maybeSingle()
  if (error) return { status: error.code === '23505' ? 'duplicate' : 'error' }
  if (!data?.id || data.id !== id) return { status: 'not-found' }
  return { status: 'updated' }
}
