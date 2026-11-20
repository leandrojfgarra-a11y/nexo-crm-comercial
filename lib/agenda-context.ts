import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAuthAdminClient } from '@/lib/supabase/admin-auth'
import type { AgendaActor } from '@/lib/agenda-security'

/** Resolves the signed-in user's active company without requiring an admin claim. */
export async function resolveAgendaContext() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect('/login?reason=session')

  const { data: membership, error: membershipError } = await supabase
    .from('crm_company_members')
    .select('company_id,role,active')
    .eq('user_id', user.id)
    .eq('active', true)
    .maybeSingle()

  if (membershipError || !membership?.company_id) redirect('/login?reason=denied')

  const { data: visibleCompany, error: companyError } = await supabase
    .from('crm_companies')
    .select('id,active')
    .eq('id', membership.company_id)
    .maybeSingle()
  let company = visibleCompany
  if (!company || companyError) {
    try {
      // Company RLS intentionally hides this row from non-admin memberships.
      // Use a service client for this single, tenant-bound read only.
      const admin = createAuthAdminClient()
      const result = await admin.from('crm_companies')
        .select('id,active')
        .eq('id', membership.company_id)
        .eq('active', true)
        .maybeSingle()
      if (result.error || !result.data) redirect('/login?reason=denied')
      company = result.data
    } catch {
      redirect('/login?reason=denied')
    }
  }
  if (!company || !company.active) redirect('/login?reason=denied')

  const actor: AgendaActor = {
    userId: user.id,
    companyId: membership.company_id,
    companyRole: membership.role,
  }

  return { supabase, actor }
}
