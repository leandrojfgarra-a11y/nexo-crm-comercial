'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { createAuthAdminClient } from '@/lib/supabase/admin-auth'

const hasAdminKey = () => Boolean(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)

export async function createIsolatedCompany(formData: FormData) {
  const sessionClient = await createAdminClient()
  if (!hasAdminKey()) redirect('/usuarios?status=admin_key_missing')

  const { data: { user } } = await sessionClient.auth.getUser()
  const { data: membership, error: membershipLookupError } = await sessionClient
    .from('crm_company_members').select('role').eq('user_id', user!.id).maybeSingle()
  if (membershipLookupError || membership?.role !== 'owner') redirect('/usuarios?status=company_forbidden')

  const name = String(formData.get('name') ?? '').trim()
  if (name.length < 2 || name.length > 120) redirect('/usuarios?status=company_invalid')

  const { error } = await createAuthAdminClient().from('crm_companies').insert({ name })
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') redirect('/usuarios?status=company_migration_pending')
    redirect(`/usuarios?status=${error.code === '23505' ? 'company_exists' : 'company_error'}`)
  }

  revalidatePath('/usuarios')
  redirect('/usuarios?status=company_created')
}

export async function inviteTeamUser(formData: FormData) {
  const sessionClient = await createAdminClient()
  const { data: { user } } = await sessionClient.auth.getUser()
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const name = String(formData.get('name') ?? '').trim()
  const requestedCompanyId = String(formData.get('company_id') ?? '').trim()
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || name.length > 120) {
    redirect('/usuarios?status=invalid')
  }

  if (!hasAdminKey()) redirect('/usuarios?status=admin_key_missing')
  const authAdmin = createAuthAdminClient()
  const { data: companies, error: companiesError } = await authAdmin
    .from('crm_companies').select('id,name,active').eq('active', true).order('name')
  const companySchemaReady = !companiesError
  const schemaMissing = companiesError?.code === '42P01' || companiesError?.code === 'PGRST205'
  if (companiesError && !schemaMissing) redirect('/usuarios?status=company_error')

  let companyId: string | null = null
  if (companySchemaReady) {
    const { data: membership, error: membershipLookupError } = await sessionClient
      .from('crm_company_members').select('company_id,role,active').eq('user_id', user!.id).maybeSingle()
    if (membershipLookupError || !membership?.active) redirect('/usuarios?status=company_required')
    const isOwner = membership.role === 'owner'
    const targetId = isOwner
      ? requestedCompanyId || companies?.find(company => company.name === 'Base de testes')?.id
      : membership.company_id
    const target = companies?.find(company => company.id === targetId)
    if (!target) redirect('/usuarios?status=company_required')
    companyId = target.id
  }

  const { data, error } = await authAdmin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: name || email.split('@')[0] },
  })
  if (error || !data.user) redirect(`/usuarios?status=${error?.code === 'email_exists' ? 'exists' : 'invite_error'}`)

  if (companyId) {
    const { error: membershipError } = await authAdmin.from('crm_company_members').upsert(
      { user_id: data.user.id, company_id: companyId, role: 'admin', active: true },
      { onConflict: 'user_id' },
    )
    if (membershipError) {
      await authAdmin.auth.admin.deleteUser(data.user.id)
      redirect('/usuarios?status=membership_error')
    }
  }

  const { error: claimError } = await authAdmin.auth.admin.updateUserById(data.user.id, {
    app_metadata: { ...data.user.app_metadata, crm_admin: true },
  })
  if (claimError) redirect('/usuarios?status=claim_error')

  revalidatePath('/usuarios')
  redirect('/usuarios?status=invited')
}
