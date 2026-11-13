'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAuthAdminClient } from '@/lib/supabase/admin-auth'

const validEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

export async function registerCompany(formData: FormData) {
  if (process.env.NODE_ENV === 'production' && process.env.CRM_SELF_REGISTRATION_ENABLED !== 'true') {
    redirect('/cadastro-empresa?status=signup_disabled')
  }

  const companyName = String(formData.get('company_name') ?? '').trim()
  const ownerName = String(formData.get('owner_name') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')
  const passwordConfirmation = String(formData.get('password_confirmation') ?? '')

  if (companyName.length < 2 || companyName.length > 120 || ownerName.length < 2 || ownerName.length > 120 || !validEmail(email) || email.length > 254 || password.length < 8 || password.length > 128 || password !== passwordConfirmation) {
    redirect('/cadastro-empresa?status=invalid')
  }

  const supabase = await createClient()
  const { data: { user: existingUser } } = await supabase.auth.getUser()
  if (existingUser) redirect('/cadastro-empresa?status=already_signed_in')

  let authAdmin: ReturnType<typeof createAuthAdminClient>
  try {
    authAdmin = createAuthAdminClient()
  } catch {
    redirect('/cadastro-empresa?status=admin_key_missing')
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: ownerName } },
  })
  if (error || !data.user) redirect(`/cadastro-empresa?status=${error?.code === 'user_already_exists' ? 'email_exists' : 'signup_error'}`)
  if (data.user.identities?.length === 0) redirect('/cadastro-empresa?status=check_email')

  const { data: company, error: companyError } = await authAdmin
    .from('crm_companies')
    .insert({ name: companyName })
    .select('id')
    .single()

  if (companyError || !company) {
    await authAdmin.auth.admin.deleteUser(data.user.id)
    if (companyError?.code === '42P01' || companyError?.code === 'PGRST205') redirect('/cadastro-empresa?status=migration_pending')
    redirect(`/cadastro-empresa?status=${companyError?.code === '23505' ? 'company_exists' : 'company_error'}`)
  }

  // Cada auto cadastro vira administrador somente da própria empresa.
  // O papel global "owner" permanece reservado ao proprietário da plataforma.
  const { error: membershipError } = await authAdmin.from('crm_company_members').insert({
    user_id: data.user.id,
    company_id: company.id,
    role: 'admin',
    active: true,
  })
  if (membershipError) {
    await authAdmin.auth.admin.deleteUser(data.user.id)
    redirect('/cadastro-empresa?status=membership_error')
  }

  const { error: claimError } = await authAdmin.auth.admin.updateUserById(data.user.id, {
    app_metadata: { ...data.user.app_metadata, crm_admin: true },
  })
  if (claimError) {
    // Excluir o usuário também remove o vínculo pela FK ON DELETE CASCADE.
    await authAdmin.auth.admin.deleteUser(data.user.id)
    redirect('/cadastro-empresa?status=claim_error')
  }

  if (!data.session) redirect('/cadastro-empresa?status=check_email')

  // Sem confirmação de e-mail no projeto: renovar a sessão depois da claim administrativa.
  await supabase.auth.signOut({ scope: 'local' })
  const { error: loginError } = await supabase.auth.signInWithPassword({ email, password })
  if (loginError) redirect('/login?reason=session')
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || user?.app_metadata?.crm_admin !== true) {
    await supabase.auth.signOut({ scope: 'local' })
    redirect('/login?reason=session')
  }

  redirect('/')
}
