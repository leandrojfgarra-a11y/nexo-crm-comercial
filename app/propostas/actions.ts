'use server'

import { randomBytes, createHash } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasProposalBrandingSchema, hasProposalPricingSchema } from '@/lib/proposal-schema'
import { resolveTenantContext } from '@/lib/tenant/context'

export type ProposalActionResult = { ok: boolean; message: string; proposalId?: string; urlPath?: string }
type ProposalItemInput = { productId?: string; description: string; quantity: string; installationPrice: string; extraDescription: string; extraPrice: string; monthlyPrice: string; optional?: boolean }
type ProposalInput = { customerId: string; opportunityId: string; title: string; validUntil: string; terms: string; discount: string; items: ProposalItemInput[]; brandName: string; brandTagline: string; logoUrl: string; introText: string; firstBillingDate: string; consultantName: string; consultantPhone: string; consultantEmail: string; consultantCity: string }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const fail = (message: string): ProposalActionResult => ({ ok: false, message })

async function admin() { return createAdminClient() }
function parseMoney(value: string) {
  const normalized = value.trim().replace(/\s/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.')
  if (!normalized) return 0
  const number = Number(normalized)
  return Number.isFinite(number) && number >= 0 && number <= 999_999_999_999.99 ? Number(number.toFixed(2)) : null
}
function parseItems(items: ProposalItemInput[]) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 100) return { error: 'Inclua de 1 a 100 itens na proposta.' as string }
  const parsed = []
  for (const item of items) {
    if (!item || typeof item.description !== 'string' || typeof item.quantity !== 'string' || typeof item.installationPrice !== 'string' || typeof item.extraDescription !== 'string' || typeof item.extraPrice !== 'string' || typeof item.monthlyPrice !== 'string' || (item.productId !== undefined && typeof item.productId !== 'string') || (item.optional !== undefined && typeof item.optional !== 'boolean')) return { error: 'Revise os itens da proposta.' as string }
    const description = item.description.trim()
    const quantity = Number(item.quantity.replace(',', '.'))
    const installationPrice = parseMoney(item.installationPrice)
    const extraPrice = parseMoney(item.extraPrice)
    const monthlyPrice = parseMoney(item.monthlyPrice)
    const extraDescription = item.extraDescription.trim()
    if (description.length < 2 || description.length > 500 || !Number.isFinite(quantity) || quantity <= 0 || quantity > 999_999_999.999 || installationPrice === null || extraPrice === null || monthlyPrice === null || extraDescription.length > 180 || (extraPrice > 0 && extraDescription.length < 2)) return { error: 'Revise descrição, quantidade, instalação, taxa extra e mensalidade.' as string }
    const normalizedQuantity = Number(quantity.toFixed(3))
    const installationTotal = Number((normalizedQuantity * installationPrice).toFixed(2))
    const extraTotal = Number((normalizedQuantity * extraPrice).toFixed(2))
    const monthlyTotal = Number((normalizedQuantity * monthlyPrice).toFixed(2))
    parsed.push({ productId: item.productId?.trim() || null, description, quantity: normalizedQuantity, installationPrice, extraDescription: extraDescription || null, extraPrice, monthlyPrice, optional: item.optional === true, installationTotal, extraTotal, monthlyTotal, legacyUnitPrice: Number((installationPrice + extraPrice).toFixed(2)), lineTotal: Number((installationTotal + extraTotal).toFixed(2)) })
  }
  return { value: parsed }
}
function values(input: ProposalInput) {
  if (!input || typeof input.customerId !== 'string' || !uuid.test(input.customerId)) return { error: 'Selecione um cliente válido.' as string }
  if (typeof input.opportunityId !== 'string' || typeof input.title !== 'string' || typeof input.validUntil !== 'string' || typeof input.terms !== 'string' || typeof input.discount !== 'string' || typeof input.brandName !== 'string' || typeof input.brandTagline !== 'string' || typeof input.logoUrl !== 'string' || typeof input.introText !== 'string' || typeof input.firstBillingDate !== 'string' || typeof input.consultantName !== 'string' || typeof input.consultantPhone !== 'string' || typeof input.consultantEmail !== 'string' || typeof input.consultantCity !== 'string') return { error: 'Revise os dados da proposta.' as string }
  if (input.title.trim().length < 2 || input.title.trim().length > 180) return { error: 'Informe um título de até 180 caracteres.' as string }
  if (input.terms.length > 10000) return { error: 'As condições da proposta devem ter até 10.000 caracteres.' as string }
  if (input.brandName.length > 120 || input.brandTagline.length > 180 || input.introText.length > 1200 || input.consultantName.length > 120 || input.consultantPhone.length > 60 || input.consultantEmail.length > 254 || input.consultantCity.length > 120) return { error: 'Revise os dados de apresentação e contato da proposta.' as string }
  if (input.consultantEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.consultantEmail)) return { error: 'Informe um e-mail válido para o contato comercial.' as string }
  if (input.firstBillingDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.firstBillingDate)) return { error: 'Informe uma data válida para a primeira cobrança.' as string }
  if (input.logoUrl) {
    try {
      const logo = new URL(input.logoUrl)
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      if (!supabaseUrl || logo.origin !== new URL(supabaseUrl).origin || !/^\/storage\/v1\/object\/public\/nexo-proposal-assets\/logos\/(?:[0-9a-f-]{36}\/)?[A-Za-z0-9._-]+$/i.test(logo.pathname)) return { error: 'Use um logotipo carregado no armazenamento do Nexo.' as string }
    } catch { return { error: 'O endereço do logotipo é inválido.' as string } }
  }
  if (input.validUntil && !/^\d{4}-\d{2}-\d{2}$/.test(input.validUntil)) return { error: 'Informe uma data de validade válida.' as string }
  const discount = parseMoney(input.discount)
  if (discount === null) return { error: 'Informe um desconto válido.' as string }
  const parsedItems = parseItems(input.items)
  if (parsedItems.error || !parsedItems.value) return { error: parsedItems.error ?? 'Revise os itens da proposta.' as string }
  const subtotal = Number(parsedItems.value.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2))
  const monthlyTotal = Number(parsedItems.value.reduce((sum, item) => sum + item.monthlyTotal, 0).toFixed(2))
  if (discount > subtotal) return { error: 'O desconto não pode ser maior que o subtotal.' as string }
  return { value: { customerId: input.customerId, opportunityId: input.opportunityId?.trim() || null, title: input.title.trim(), validUntil: input.validUntil || null, terms: input.terms.trim() || null, discount, subtotal, total: Number((subtotal - discount).toFixed(2)), monthlyTotal, items: parsedItems.value, brandName: input.brandName.trim(), brandTagline: input.brandTagline.trim(), logoUrl: input.logoUrl, introText: input.introText.trim(), firstBillingDate: input.firstBillingDate || null, consultantName: input.consultantName.trim(), consultantPhone: input.consultantPhone.trim(), consultantEmail: input.consultantEmail.trim().toLowerCase(), consultantCity: input.consultantCity.trim() } }
}

async function validateRelations(supabase: SupabaseClient, companyId: string, customerId: string, opportunityId: string | null, items: NonNullable<ReturnType<typeof values>['value']>['items'], options: { allowClosedOpportunity?: boolean; allowInactiveProductIds?: Set<string> } = {}) {
  const { data: customer, error: customerError } = await supabase.from('customers').select('id,person_id').eq('id', customerId).eq('company_id', companyId).maybeSingle()
  if (customerError || !customer) return 'Cliente não encontrado ou sem acesso.'
  if (opportunityId) {
    if (!uuid.test(opportunityId)) return 'Oportunidade inválida.'
    const { data: opportunity, error } = await supabase.from('opportunities').select('id,person_id,status').eq('id', opportunityId).eq('company_id', companyId).maybeSingle()
    if (error || !opportunity || opportunity.person_id !== customer.person_id || (!options.allowClosedOpportunity && opportunity.status !== 'open')) return 'Selecione uma oportunidade válida vinculada ao cliente escolhido.'
  }
  const productIds = [...new Set(items.flatMap(item => item.productId ? [item.productId] : []))]
  if (productIds.length) {
    if (productIds.some(id => !uuid.test(id))) return 'Produto inválido.'
    const { data, error } = await supabase.from('products').select('id,active').eq('company_id', companyId).in('id', productIds)
    if (error || data?.length !== productIds.length || data.some(row => !row.active && !options.allowInactiveProductIds?.has(row.id))) return 'Um dos produtos ou serviços não está disponível.'
  }
  return null
}

async function insertVersion(supabase: SupabaseClient, companyId: string, proposalId: string, version: number, parsed: NonNullable<ReturnType<typeof values>['value']>, userId: string | null) {
  const { data: versionRow, error: versionError } = await supabase.from('proposal_versions').insert({ company_id: companyId, proposal_id: proposalId, version, title: parsed.title, terms: parsed.terms, currency: 'BRL', subtotal: parsed.subtotal, discount: parsed.discount, total: parsed.total, monthly_total: parsed.monthlyTotal, brand_name: parsed.brandName || null, brand_tagline: parsed.brandTagline || null, logo_url: parsed.logoUrl || null, intro_text: parsed.introText || null, first_billing_date: parsed.firstBillingDate, consultant_name: parsed.consultantName || null, consultant_phone: parsed.consultantPhone || null, consultant_email: parsed.consultantEmail || null, consultant_city: parsed.consultantCity || null, created_by: userId }).select('id').single()
  if (versionError || !versionRow) return { error: 'Não foi possível salvar a versão da proposta.' }
  const { error: itemsError } = await supabase.from('proposal_items').insert(parsed.items.map((item, position) => ({ company_id: companyId, version_id: versionRow.id, product_id: item.productId, description: item.description, quantity: item.quantity, unit_price: item.legacyUnitPrice, line_total: item.lineTotal, installation_unit_price: item.installationPrice, extra_description: item.extraDescription, extra_unit_price: item.extraPrice, monthly_unit_price: item.monthlyPrice, monthly_line_total: item.monthlyTotal, optional: item.optional, position })))
  if (itemsError) {
    await supabase.from('proposal_versions').delete().eq('id', versionRow.id).eq('company_id', companyId)
    return { error: 'Não foi possível salvar os itens da proposta.' }
  }
  return { value: versionRow }
}

export async function createProposal(input: ProposalInput): Promise<ProposalActionResult> {
  const supabase = await admin()
  let tenant: Awaited<ReturnType<typeof resolveTenantContext>>
  try { tenant = await resolveTenantContext(supabase) } catch { return fail('Não foi possível confirmar a empresa ativa.') }
  if (!(await hasProposalPricingSchema(supabase))) return fail('Aplique manualmente a migration 202611020002_proposal_recurring_prices.sql antes de gravar preços separados.')
  if (!(await hasProposalBrandingSchema(supabase))) return fail('Aplique manualmente a migration 202611050002_proposal_branding_and_backup.sql antes de gravar o modelo visual da proposta.')
  const parsed = values(input)
  if (parsed.error || !parsed.value) return fail(parsed.error ?? 'Revise os dados da proposta.')
  const relationError = await validateRelations(supabase, tenant.companyId, parsed.value.customerId, parsed.value.opportunityId, parsed.value.items)
  if (relationError) return fail(relationError)
  const { data: { user } } = await supabase.auth.getUser()
  let proposal: { id: string } | null = null
  let proposalNumber = ''
  for (let attempt = 0; attempt < 3 && !proposal; attempt++) {
    proposalNumber = `NX-${new Date().getFullYear()}-${randomBytes(4).toString('hex').toUpperCase()}`
    const result = await supabase.from('proposals').insert({ company_id: tenant.companyId, customer_id: parsed.value.customerId, opportunity_id: parsed.value.opportunityId, proposal_number: proposalNumber, status: 'draft', valid_until: parsed.value.validUntil, current_version: null }).select('id').single()
    if (result.error?.code !== '23505' && result.error) return fail('Não foi possível criar o cadastro da proposta.')
    proposal = result.data
  }
  if (!proposal) return fail('Não foi possível gerar um número único para a proposta. Tente novamente.')
  const inserted = await insertVersion(supabase, tenant.companyId, proposal.id, 1, parsed.value, user?.id ?? null)
  if (!inserted.value) { await supabase.from('proposals').delete().eq('id', proposal.id).eq('company_id', tenant.companyId); return fail(inserted.error ?? 'Falha ao criar versão inicial.') }
  const { error } = await supabase.from('proposals').update({ current_version: 1 }).eq('id', proposal.id).eq('company_id', tenant.companyId)
  if (error) { await supabase.from('proposal_items').delete().eq('company_id', tenant.companyId).eq('version_id', inserted.value.id); await supabase.from('proposal_versions').delete().eq('id', inserted.value.id).eq('company_id', tenant.companyId); await supabase.from('proposals').delete().eq('id', proposal.id).eq('company_id', tenant.companyId); return fail('Não foi possível concluir a proposta.') }
  revalidatePath('/propostas'); revalidatePath('/clientes')
  return { ok: true, message: `Proposta ${proposalNumber} criada como rascunho.`, proposalId: proposal.id }
}

export async function createProposalVersion(proposalId: string, input: ProposalInput): Promise<ProposalActionResult> {
  const supabase = await admin()
  let tenant: Awaited<ReturnType<typeof resolveTenantContext>>
  try { tenant = await resolveTenantContext(supabase) } catch { return fail('Não foi possível confirmar a empresa ativa.') }
  if (!(await hasProposalPricingSchema(supabase))) return fail('Aplique manualmente a migration 202611020002_proposal_recurring_prices.sql antes de criar uma nova versão.')
  if (!(await hasProposalBrandingSchema(supabase))) return fail('Aplique manualmente a migration 202611050002_proposal_branding_and_backup.sql antes de criar uma nova versão visual.')
  if (!uuid.test(proposalId)) return fail('Proposta inválida.')
  const parsed = values(input)
  if (parsed.error || !parsed.value) return fail(parsed.error ?? 'Revise os dados da proposta.')
  const { data: proposal, error } = await supabase.from('proposals').select('id,status,current_version,customer_id').eq('id', proposalId).eq('company_id', tenant.companyId).maybeSingle()
  if (error || !proposal || proposal.customer_id !== parsed.value.customerId) return fail('Proposta não encontrada ou cliente não corresponde.')
  if (!['draft', 'sent', 'rejected', 'expired'].includes(proposal.status)) return fail('Uma proposta aceita ou cancelada não pode receber nova versão.')
  if (proposal.current_version) {
    const { data: pendingAcceptance, error: acceptanceError } = await supabase.from('proposal_acceptances').select('id').eq('company_id', tenant.companyId).eq('proposal_id', proposalId).eq('status', 'pending_internal_confirmation').limit(1).maybeSingle()
    if (acceptanceError) return fail('Não foi possível verificar aceites pendentes. Nenhuma nova versão foi criada.')
    if (pendingAcceptance) return fail('Revise o aceite pendente antes de criar uma nova versão.')
  }
    const { data: currentVersion } = await supabase.from('proposal_versions').select('id').eq('company_id', tenant.companyId).eq('proposal_id', proposalId).eq('version', proposal.current_version).maybeSingle()
  const { data: oldItems } = currentVersion ? await supabase.from('proposal_items').select('product_id').eq('company_id', tenant.companyId).eq('version_id', currentVersion.id) : { data: [] }
  const existingProductIds = new Set((oldItems ?? []).flatMap(item => item.product_id ? [item.product_id] : []))
  const relationError = await validateRelations(supabase, tenant.companyId, parsed.value.customerId, parsed.value.opportunityId, parsed.value.items, { allowClosedOpportunity: true, allowInactiveProductIds: existingProductIds })
  if (relationError) return fail(relationError)
  const nextVersion = Number(proposal.current_version ?? 0) + 1
  const { data: { user } } = await supabase.auth.getUser()
  const inserted = await insertVersion(supabase, tenant.companyId, proposalId, nextVersion, parsed.value, user?.id ?? null)
  if (!inserted.value) return fail(inserted.error ?? 'Não foi possível criar a nova versão.')
  const { error: updateError } = await supabase.from('proposals').update({ current_version: nextVersion, opportunity_id: parsed.value.opportunityId, valid_until: parsed.value.validUntil, status: 'draft' }).eq('id', proposalId).eq('company_id', tenant.companyId)
  if (updateError) { await supabase.from('proposal_items').delete().eq('company_id', tenant.companyId).eq('version_id', inserted.value.id); await supabase.from('proposal_versions').delete().eq('id', inserted.value.id).eq('company_id', tenant.companyId); return fail('A nova versão foi preparada, mas não pôde ser ativada.') }
  revalidatePath(`/propostas/${proposalId}`); revalidatePath('/propostas')
  return { ok: true, message: `Versão ${nextVersion} criada como rascunho.` }
}

export async function updateProposalStatus(proposalId: string, status: 'sent' | 'cancelled'): Promise<ProposalActionResult> {
  const supabase = await admin()
  let tenant: Awaited<ReturnType<typeof resolveTenantContext>>
  try { tenant = await resolveTenantContext(supabase) } catch { return fail('Não foi possível confirmar a empresa ativa.') }
  if (!uuid.test(proposalId)) return fail('Proposta inválida.')
  if (!['sent', 'cancelled'].includes(status)) return fail('Status de proposta inválido.')
  const { data: proposal, error } = await supabase.from('proposals').select('id,status,current_version').eq('id', proposalId).eq('company_id', tenant.companyId).maybeSingle()
  if (error || !proposal || !proposal.current_version) return fail('Proposta sem uma versão válida.')
  if (status === 'sent' && proposal.status !== 'draft') return fail('Somente rascunhos podem ser marcados como enviados.')
  if (status === 'cancelled' && !['draft', 'sent', 'rejected', 'expired'].includes(proposal.status)) return fail('Esta proposta não pode ser cancelada neste status.')
  if (status === 'sent') {
    const { error: versionError } = await supabase.from('proposal_versions').update({ sent_at: new Date().toISOString() }).eq('company_id', tenant.companyId).eq('proposal_id', proposalId).eq('version', proposal.current_version)
    if (versionError) return fail('Não foi possível registrar o envio da versão atual.')
  }
  const { error: updateError } = await supabase.from('proposals').update({ status }).eq('id', proposalId).eq('company_id', tenant.companyId)
  if (updateError) return fail('Não foi possível atualizar o status da proposta.')
  revalidatePath(`/propostas/${proposalId}`); revalidatePath('/propostas')
  return { ok: true, message: status === 'sent' ? 'Proposta marcada como enviada.' : 'Proposta cancelada.' }
}

export async function createProposalShareLink(proposalId: string): Promise<ProposalActionResult> {
  const supabase = await admin()
  let tenant: Awaited<ReturnType<typeof resolveTenantContext>>
  try { tenant = await resolveTenantContext(supabase) } catch { return fail('Não foi possível confirmar a empresa ativa.') }
  if (!uuid.test(proposalId)) return fail('Proposta inválida.')
  const readiness = await supabase.rpc('get_public_proposal', { p_token: 'invalid-token-check' })
  if (readiness.error) return fail('O compartilhamento seguro depende da migration 202611020001_proposal_public_access.sql. Aplique-a manualmente antes de criar links.')
  const { data: proposal, error } = await supabase.from('proposals').select('id,status,current_version').eq('id', proposalId).eq('company_id', tenant.companyId).maybeSingle()
  if (error || !proposal || proposal.status !== 'sent' || !proposal.current_version) return fail('Envie a proposta antes de gerar um link público.')
  const token = randomBytes(32).toString('base64url')
  const tokenHash = createHash('sha256').update(token).digest('hex')
  const { data: { user } } = await supabase.auth.getUser()
  const { error: insertError } = await supabase.from('proposal_links').insert({ company_id: tenant.companyId, proposal_id: proposalId, token_hash: tokenHash, expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), created_by: user?.id ?? null })
  if (insertError) return fail('Não foi possível gerar o link seguro.')
  return { ok: true, message: 'Link criado com validade de 30 dias.', urlPath: `/p/${token}` }
}

export async function reviewProposalAcceptance(acceptanceId: string, decision: 'confirmed' | 'rejected'): Promise<ProposalActionResult> {
  const supabase = await admin()
  let tenant: Awaited<ReturnType<typeof resolveTenantContext>>
  try { tenant = await resolveTenantContext(supabase) } catch { return fail('Não foi possível confirmar a empresa ativa.') }
  if (!uuid.test(acceptanceId)) return fail('Aceite inválido.')
  if (!['confirmed', 'rejected'].includes(decision)) return fail('Decisão de revisão inválida.')
  const { data: acceptance, error } = await supabase.from('proposal_acceptances').select('id,proposal_id,version_id,status').eq('id', acceptanceId).eq('company_id', tenant.companyId).maybeSingle()
  if (error || !acceptance || acceptance.status !== 'pending_internal_confirmation') return fail('Aceite não encontrado ou já revisado.')
  const [{ data: version }, { data: proposal }] = await Promise.all([
    supabase.from('proposal_versions').select('version').eq('id', acceptance.version_id).eq('company_id', tenant.companyId).maybeSingle(),
    supabase.from('proposals').select('status,current_version').eq('id', acceptance.proposal_id).eq('company_id', tenant.companyId).maybeSingle(),
  ])
  if (!proposal || proposal.status !== 'sent' || proposal.current_version !== version?.version) return fail('Este aceite pertence a uma versão que não está mais enviada. Revise a versão atual antes de continuar.')
  const { data: { user } } = await supabase.auth.getUser()
  const { data: updated, error: updateAcceptanceError } = await supabase.from('proposal_acceptances').update({ status: decision, reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString() }).eq('id', acceptanceId).eq('company_id', tenant.companyId).eq('status', 'pending_internal_confirmation').select('id').maybeSingle()
  if (updateAcceptanceError || !updated) return fail('Não foi possível concluir a revisão interna.')
  const { error: proposalError } = await supabase.from('proposals').update({ status: decision === 'confirmed' ? 'accepted' : 'rejected' }).eq('id', acceptance.proposal_id).eq('company_id', tenant.companyId)
  if (proposalError) return fail('A revisão foi registrada, mas o status da proposta não foi atualizado.')
  revalidatePath(`/propostas/${acceptance.proposal_id}`); revalidatePath('/propostas')
  return { ok: true, message: decision === 'confirmed' ? 'Aceite confirmado internamente.' : 'Aceite recusado na revisão interna.' }
}

