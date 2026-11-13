'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createTenantClient } from '@/lib/tenant/authorized-client'
import { hasSellerCommercialSchema, hasSellerInstallationGoalSchema } from '@/lib/seller-schema'
import { isUuid } from '@/lib/sales-funnel'

export type SellerActionResult = { ok: boolean; message: string }
export type AuthUserOption = { id: string; name: string; email: string | null }
export type SellerInput = {
  id?: string; name: string; sellerType: 'internal'|'external'; userId: string
  email: string; phone: string; installationCommissionPercent: string; monthlyCommissionPercent: string
  monthlyCommissionMode: 'none'|'single'|'recurring'; monthlyCommissionCompetencies: string; monthlyInstallationGoalCount: string; active: boolean
}
const fail = (message: string): SellerActionResult => ({ ok: false, message })
export async function searchInternalAuthUsers(query: string, currentSellerId = '', includeUserId = ''): Promise<{ok:boolean; users:AuthUserOption[]; message?:string}> {
  const context = await getContext()
  if ('error' in context) return { ok:false, users:[], message:context.error.message }
  if (typeof query !== 'string' || query.length > 120 || (currentSellerId && !isUuid(currentSellerId)) || (includeUserId && !isUuid(includeUserId)))
    return { ok:false, users:[], message:'Parâmetros de pesquisa inválidos.' }
  const { data, error } = await context.supabase.rpc('search_crm_auth_users', {
    p_search: query.trim(), p_current_seller_id: currentSellerId || null, p_include_user_id: includeUserId || null,
  })
  if (error) return { ok:false, users:[], message:`Não foi possível pesquisar usuários: ${error.message}` }
  const users = (data ?? []).map((row: {user_id:string; display_name:string; email:string|null}) => ({id:row.user_id,name:row.display_name,email:row.email}))
  return {ok:true, users}
}
type SellerContext = { supabase: SupabaseClient; companyId: string } | { error: SellerActionResult }

async function getContext(): Promise<SellerContext> {
  let supabase: SupabaseClient
  let companyId: string
  try {
    const context = await createTenantClient()
    supabase = context.supabase
    companyId = context.tenant.companyId
  } catch {
    return { error: fail('Sessão ou vínculo da empresa inválido. Entre novamente para continuar.') }
  }
  if (!(await hasSellerCommercialSchema(supabase))) return { error: fail('Aguarda a migration 202610310007 do cadastro de vendedores. Nenhuma gravação foi feita.') }
  return { supabase, companyId }
}

function parsePercent(value: string) {
  const normalized = value.trim().replace(',', '.')
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(normalized)) return undefined
  const percent = Number(normalized)
  return Number.isFinite(percent) && percent >= 0 && percent <= 100 ? percent : undefined
}

export async function saveSeller(input: SellerInput): Promise<SellerActionResult> {
  const context = await getContext()
  if ('error' in context) return context.error
  const stringFields = ['name','userId','email','phone','installationCommissionPercent','monthlyCommissionPercent','monthlyCommissionCompetencies','monthlyInstallationGoalCount']
  if (!input || typeof input !== 'object' || !stringFields.every(key => typeof (input as Record<string, unknown>)[key] === 'string') || typeof input.active !== 'boolean') return fail('Revise os dados do vendedor.')
  if (input.id && !isUuid(input.id)) return fail('Identificador do vendedor inválido.')
  const name = input.name.trim(), userId = input.userId.trim(), email = input.email.trim(), phone = input.phone.trim()
  if (name.length < 2 || name.length > 180) return fail('O nome deve ter entre 2 e 180 caracteres.')
  if (!['internal','external'].includes(input.sellerType)) return fail('Selecione vendedor interno ou externo.')
  if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return fail('Informe um e-mail válido.')
  if (phone.length > 40) return fail('O telefone deve ter até 40 caracteres.')
  const installationPercent = parsePercent(input.installationCommissionPercent)
  const monthlyPercent = input.monthlyCommissionMode === 'none' ? 0 : parsePercent(input.monthlyCommissionPercent)
  if (installationPercent === undefined || monthlyPercent === undefined) return fail('Os percentuais de comissão devem estar entre 0% e 100%, com até duas casas decimais.')
  if (!['none','single','recurring'].includes(input.monthlyCommissionMode)) return fail('Selecione sem comissão, comissão única ou recorrente.')
  let competencies: number | null = null
  if (input.monthlyCommissionMode === 'recurring') {
    if (!/^\d+$/.test(input.monthlyCommissionCompetencies)) return fail('Informe a quantidade de competências da comissão recorrente.')
    competencies = Number(input.monthlyCommissionCompetencies)
    if (!Number.isInteger(competencies) || competencies < 1 || competencies > 120) return fail('A quantidade deve estar entre 1 e 120 competências.')
  }
  const goalSchemaReady = await hasSellerInstallationGoalSchema(context.supabase)
  let installationGoalCount = 0
  if (goalSchemaReady) {
    if (!/^\d{1,7}$/.test(input.monthlyInstallationGoalCount) || !Number.isSafeInteger(Number(input.monthlyInstallationGoalCount)) || Number(input.monthlyInstallationGoalCount) > 1_000_000)
      return fail('A meta mensal deve ser uma quantidade inteira entre 0 e 1.000.000.')
    installationGoalCount = Number(input.monthlyInstallationGoalCount)
  }
  if (userId && input.sellerType !== 'internal') return fail('Somente vendedores internos podem ter usuário vinculado.')
  if (userId && !isUuid(userId)) return fail('O ID do usuário vinculado deve ser um UUID válido.')
  if (userId) {
    const { data: linked, error: linkError } = await context.supabase.from('sellers').select('id').eq('company_id', context.companyId).eq('user_id', userId).maybeSingle()
    if (linkError) return fail(`Não foi possível verificar o vínculo do usuário: ${linkError.message}`)
    if (linked && linked.id !== input.id) return fail('Este usuário já está vinculado a outro vendedor.')
  }

  const payload: Record<string, unknown> = {
    name, seller_type: input.sellerType, user_id: userId || null, email: email || null, phone: phone || null,
    installation_commission_percent: installationPercent, monthly_commission_percent: monthlyPercent,
    monthly_commission_mode: input.monthlyCommissionMode, monthly_commission_competencies: competencies,
    active: input.active,
  }
  if (goalSchemaReady) payload.monthly_installation_goal_count = installationGoalCount
  const result = input.id
    ? await context.supabase.from('sellers').update(payload).eq('company_id', context.companyId).eq('id', input.id).select('id').maybeSingle()
    : await context.supabase.from('sellers').insert({ ...payload, company_id: context.companyId }).select('id').maybeSingle()
  if (result.error) return fail(result.error.code === '23505' ? 'Este usuário já está vinculado a outro vendedor.' : `Não foi possível salvar o vendedor: ${result.error.message}`)
  if (!result.data) return fail('Vendedor não encontrado ou sem permissão para alteração.')
  revalidatePath('/vendedores'); revalidatePath('/funil'); revalidatePath('/leads'); revalidatePath('/clientes')
  revalidatePath('/comissoes')
  return { ok: true, message: input.id ? 'Vendedor atualizado.' : 'Vendedor cadastrado.' }
}

export async function setSellerActive(id: string, currentActive: boolean): Promise<SellerActionResult> {
  const context = await getContext()
  if ('error' in context) return context.error
  if (!isUuid(id) || typeof currentActive !== 'boolean') return fail('Vendedor inválido.')
  const { data, error } = await context.supabase.from('sellers').update({ active: !currentActive }).eq('company_id', context.companyId).eq('id', id).eq('active', currentActive).select('id').maybeSingle()
  if (error) return fail(`Não foi possível alterar o status: ${error.message}`)
  if (!data) return fail('O status foi alterado em outra solicitação. Atualize a lista.')
  revalidatePath('/vendedores'); revalidatePath('/funil'); revalidatePath('/leads'); revalidatePath('/clientes')
  return { ok: true, message: currentActive ? 'Vendedor inativado; os vínculos existentes foram preservados.' : 'Vendedor ativado.' }
}
