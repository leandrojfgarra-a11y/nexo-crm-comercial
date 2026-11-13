import 'server-only'

import { createClient } from '@/lib/supabase/server'

export type CrmCompanyRole = 'owner' | 'admin'

export type TenantContext = {
  userId: string
  companyId: string
  companyName: string
  role: CrmCompanyRole
}

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>

export type TenantContextErrorCode =
  | 'unauthenticated'
  | 'unauthorized'
  | 'membership_lookup_failed'
  | 'membership_missing'
  | 'company_lookup_failed'
  | 'company_unavailable'

/** Erro seguro e tipado para resolução do vínculo da empresa no servidor. */
export class TenantContextError extends Error {
  constructor(readonly code: TenantContextErrorCode) {
    const messages: Record<TenantContextErrorCode, string> = {
      unauthenticated: 'Entre novamente para acessar os dados da empresa.',
      unauthorized: 'Este usuário não está autorizado a acessar o CRM.',
      membership_lookup_failed: 'Não foi possível verificar o vínculo da empresa.',
      membership_missing: 'Este usuário ainda não está vinculado a uma empresa ativa.',
      company_lookup_failed: 'Não foi possível carregar os dados da empresa.',
      company_unavailable: 'A empresa vinculada não está disponível.',
    }

    super(messages[code])
    this.name = 'TenantContextError'
  }
}

/**
 * Resolve o contexto da empresa usando exclusivamente o usuário autenticado
 * e as tabelas protegidas por RLS. Não aceita empresa enviada pelo cliente.
 */
export async function resolveTenantContext(supabase: ServerSupabaseClient): Promise<TenantContext> {
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) throw new TenantContextError('unauthenticated')
  if (user.app_metadata?.crm_admin !== true) throw new TenantContextError('unauthorized')

  const { data: membership, error: membershipError } = await supabase
    .from('crm_company_members')
    .select('company_id, role')
    .eq('user_id', user.id)
    .eq('active', true)
    .maybeSingle()

  if (membershipError) throw new TenantContextError('membership_lookup_failed')
  if (!membership?.company_id) throw new TenantContextError('membership_missing')
  if (membership.role !== 'owner' && membership.role !== 'admin') {
    throw new TenantContextError('membership_lookup_failed')
  }

  const { data: company, error: companyError } = await supabase
    .from('crm_companies')
    .select('id, name')
    .eq('id', membership.company_id)
    .eq('active', true)
    .maybeSingle()

  if (companyError) throw new TenantContextError('company_lookup_failed')
  if (!company) throw new TenantContextError('company_unavailable')

  return {
    userId: user.id,
    companyId: company.id,
    companyName: company.name,
    role: membership.role,
  }
}

export async function requireTenantContext(): Promise<TenantContext> {
  return resolveTenantContext(await createClient())
}
