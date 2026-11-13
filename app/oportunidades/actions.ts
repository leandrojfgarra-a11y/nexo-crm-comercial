'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasClosedSalesSchema, hasOpportunityCommercialProfileSchema, hasSalesFunnelSchema, isIsoDate, isUuid, parseMoney, SALES_FUNNEL_PIPELINE_ID, SALES_FUNNEL_STAGES } from '@/lib/sales-funnel'
import { resolveTenantContext } from '@/lib/tenant/context'

export type FunnelActionResult = { ok: boolean; message: string }
export type OpportunityInput = {
  id?: string; fromStageId?: string; subjectType: 'lead' | 'customer' | 'person'; subjectId: string; sellerId: string; productId: string
  title: string; installationValue: string; monthlyValue: string; openedAt: string
  expectedCloseDate: string; notes: string; stageId: string; status: 'open' | 'won'
  additionalProductIds?: string[]; convertedAt?: string; monthlyDueDay?: string; implementationOwner?: string
  installationDate?: string; trainingDate?: string; trainingsNeeded?: string; invoiceLimit?: string
  systemVersion?: string; nfceVersion?: string; mdfeVersion?: string; technicalNotes?: string
  contractStatus?: string; boletoDeliveryMethod?: string; installationFeeStatus?: string
  installationFeePaymentMethod?: string; installationFeePaidAt?: string
}
const fail = (message: string): FunnelActionResult => ({ ok: false, message })
const succeed = (message: string): FunnelActionResult => ({ ok: true, message })
type FunnelStage = { id: string; name: string; position: number; is_won: boolean; is_lost: boolean; active: boolean }
type FunnelContext = { supabase: SupabaseClient; companyId: string; stages: FunnelStage[] } | { error: FunnelActionResult }
type Subject = { personId: string; leadId: string | null; customerId: string | null } | { error: string }

async function getContext(): Promise<FunnelContext> {
  const supabase = await createAdminClient()
  let companyId: string
  try { ({ companyId } = await resolveTenantContext(supabase)) }
  catch { return { error: fail('Não foi possível confirmar a empresa ativa para esta operação.') } }
  if (!(await hasSalesFunnelSchema(supabase))) return { error: fail('O funil aguarda a migration incremental. Nenhuma alteração foi gravada.') } as const
  const { data: stages, error } = await supabase.from('pipeline_stages').select('id,name,position,is_won,is_lost,active')
    .eq('pipeline_id', SALES_FUNNEL_PIPELINE_ID).eq('active', true).order('position')
  if (error || !stages || stages.length !== SALES_FUNNEL_STAGES.length) return { error: fail('Não foi possível carregar as etapas do funil.') } as const
  return { supabase, companyId, stages } as const
}

async function getSubject(supabase: SupabaseClient, companyId: string, input: OpportunityInput): Promise<Subject> {
  if (input.subjectType === 'person' && input.id) {
    const { data, error } = await supabase.from('opportunities').select('person_id,lead_id,customer_id')
      .eq('id', input.id).eq('company_id', companyId).eq('person_id', input.subjectId).maybeSingle()
    if (error || !data) return { error: 'O vínculo deste contato legado não pode ser alterado.' }
    return { personId: data.person_id, leadId: data.lead_id as string | null, customerId: data.customer_id as string | null }
  }
  if (input.subjectType === 'lead') {
    const { data, error } = await supabase.from('leads').select('id,person_id,status').eq('id', input.subjectId).eq('company_id', companyId).maybeSingle()
    if (error || !data?.person_id) return { error: 'Lead não encontrado.' }
    if (['converted', 'lost'].includes(data.status)) {
      if (!input.id || data.status !== 'converted') return { error: 'Lead indisponível. Leads convertidos ou encerrados não podem receber nova oportunidade.' }
      const { data: linked } = await supabase.from('opportunities').select('id').eq('id', input.id).eq('company_id', companyId).eq('lead_id', data.id).maybeSingle()
      if (!linked) return { error: 'Lead convertido não pode ser vinculado a outra oportunidade.' }
    }
    return { personId: data.person_id, leadId: data.id as string | null, customerId: null }
  }
  if (input.subjectType === 'customer') {
    const { data, error } = await supabase.from('customers').select('id,person_id').eq('id', input.subjectId).eq('company_id', companyId).maybeSingle()
    if (error || !data?.person_id) return { error: 'Cliente não encontrado.' }
    return { personId: data.person_id, leadId: null, customerId: data.id as string | null }
  }
  return { error: 'Selecione um lead ou cliente válido.' }
}

export async function saveOpportunity(input: OpportunityInput): Promise<FunnelActionResult> {
  const ctx = await getContext()
  if ('error' in ctx) return ctx.error
  if (!(await hasOpportunityCommercialProfileSchema(ctx.supabase))) return fail('A ficha comercial aguarda a migration 202610310005. Nenhuma alteração foi gravada.')
  if (!input || typeof input !== 'object' || !['subjectType','subjectId','sellerId','productId','title','installationValue','monthlyValue','openedAt','expectedCloseDate','notes','stageId','status'].every(key => typeof (input as Record<string, unknown>)[key] === 'string')) return fail('Revise os dados da oportunidade.')
  if ((input as OpportunityInput).id !== undefined && typeof (input as OpportunityInput).id !== 'string') return fail('Oportunidade inválida.')
  if ((input as OpportunityInput).fromStageId !== undefined && typeof (input as OpportunityInput).fromStageId !== 'string') return fail('Etapa anterior inválida.')
  if (input.id && !isUuid(input.id)) return fail('Oportunidade inválida.')
  if (!['lead', 'customer', 'person'].includes(input.subjectType) || !isUuid(input.subjectId)) return fail('Selecione um lead ou cliente válido.')
  if (input.subjectType === 'person' && !input.id) return fail('Novas oportunidades devem estar vinculadas a lead ou cliente.')
  if (input.title.trim().length < 2 || input.title.trim().length > 180) return fail('O título deve ter entre 2 e 180 caracteres.')
  if (input.notes.length > 5000) return fail('As observações devem ter até 5.000 caracteres.')
  const additionalProductIds = [...new Set(input.additionalProductIds ?? [])]
  if (additionalProductIds.some(id => !isUuid(id)) || (input.productId && additionalProductIds.includes(input.productId))) return fail('Confira os produtos adicionais; o produto principal não pode ser repetido.')
  if (additionalProductIds.length > 100) return fail('Selecione no máximo 100 produtos e serviços adicionais.')
  const dateFields = [input.convertedAt, input.installationDate, input.trainingDate, input.installationFeePaidAt]
  if (dateFields.some(value => value && !isIsoDate(value))) return fail('Confira as datas da ficha comercial.')
  const dueDay = input.monthlyDueDay ? Number(input.monthlyDueDay) : null
  const invoiceLimit = input.invoiceLimit ? Number(input.invoiceLimit) : null
  if (dueDay !== null && (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31)) return fail('O dia de vencimento deve estar entre 1 e 31.')
  if (invoiceLimit !== null && (!Number.isInteger(invoiceLimit) || invoiceLimit < 0)) return fail('O limitador de notas deve ser um inteiro igual ou maior que zero.')
  if (!['pending','sent','signed','cancelled'].includes(input.contractStatus ?? 'pending')) return fail('Situação de contrato inválida.')
  if (!['pending','reported_paid','waived','cancelled'].includes(input.installationFeeStatus ?? 'pending')) return fail('Situação da taxa de instalação inválida.')
  if ([input.implementationOwner,input.trainingsNeeded,input.systemVersion,input.nfceVersion,input.mdfeVersion,input.technicalNotes,input.boletoDeliveryMethod,input.installationFeePaymentMethod].some(value => (value ?? '').length > 1000)) return fail('Um dos campos de texto ultrapassa o limite permitido.')
  if (input.sellerId && !isUuid(input.sellerId)) return fail('Vendedor inválido.')
  if (input.productId && !isUuid(input.productId)) return fail('Produto/serviço inválido.')
  if (!isUuid(input.stageId) || !['open', 'won'].includes(input.status)) return fail('Etapa ou situação inválida.')
  const install = parseMoney(input.installationValue), monthly = parseMoney(input.monthlyValue)
  if (install === undefined || monthly === undefined) return fail('Valores inválidos. Use números iguais ou maiores que zero.')
  if (!isIsoDate(input.openedAt) || (input.expectedCloseDate && (!isIsoDate(input.expectedCloseDate) || input.expectedCloseDate < input.openedAt))) return fail('Confira as datas informadas; o fechamento previsto não pode anteceder a abertura.')
  const stage = ctx.stages.find(row => row.id === input.stageId)
  if (!stage) return fail('A etapa selecionada não está disponível no funil.')
  const persistedStatus: 'open'|'won' = stage.is_won ? 'won' : 'open'
  if (input.sellerId) {
    const { data, error } = await ctx.supabase.from('sellers').select('id,active').eq('id', input.sellerId).eq('company_id', ctx.companyId).maybeSingle()
    if (error || !data) return fail('O vendedor selecionado não existe ou está indisponível.')
    if (!data.active) {
      if (!input.id) return fail('Vendedores inativos não podem ser atribuídos a novas oportunidades.')
      const { data: existingLink, error: linkError } = await ctx.supabase.from('opportunities').select('seller_id').eq('id', input.id).eq('company_id', ctx.companyId).eq('pipeline_id', SALES_FUNNEL_PIPELINE_ID).maybeSingle()
      if (linkError || existingLink?.seller_id !== input.sellerId) return fail('Um vendedor inativo só pode ser preservado no vínculo já existente.')
    }
  }
  if (input.productId) {
    const { data } = await ctx.supabase.from('products').select('id').eq('id', input.productId).eq('company_id', ctx.companyId).eq('active', true).maybeSingle()
    if (!data) return fail('O produto/serviço selecionado não existe ou está inativo.')
  }
  if (additionalProductIds.length) {
    const { data: validProducts, error } = await ctx.supabase.from('products').select('id').eq('company_id', ctx.companyId).in('id', additionalProductIds).eq('active', true)
    if (error || validProducts?.length !== additionalProductIds.length) return fail('Um dos produtos ou serviços selecionados não existe ou está inativo.')
  }
  const subject = await getSubject(ctx.supabase, ctx.companyId, input)
  if ('error' in subject) return fail(subject.error)
  const payload = {
    person_id: subject.personId, lead_id: subject.leadId, customer_id: subject.customerId,
    seller_id: input.sellerId || null, product_id: input.productId || null, title: input.title.trim(),
    installation_value: install, monthly_value: monthly, opened_at: input.openedAt,
    expected_close_date: input.expectedCloseDate || null, notes: input.notes.trim() || null,
    converted_at: input.convertedAt || null, monthly_due_day: dueDay,
    implementation_owner: input.implementationOwner?.trim() || null,
    installation_date: input.installationDate || null, training_date: input.trainingDate || null,
    trainings_needed: input.trainingsNeeded?.trim() || null, invoice_limit: invoiceLimit,
    system_version: input.systemVersion?.trim() || null, nfce_version: input.nfceVersion?.trim() || null,
    mdfe_version: input.mdfeVersion?.trim() || null, technical_notes: input.technicalNotes?.trim() || null,
    contract_status: input.contractStatus ?? 'pending', boleto_delivery_method: input.boletoDeliveryMethod?.trim() || null,
    installation_fee_status: input.installationFeeStatus ?? 'pending',
    installation_fee_payment_method: input.installationFeePaymentMethod?.trim() || null,
    installation_fee_paid_at: input.installationFeePaidAt || null,
    company_id: ctx.companyId, pipeline_id: SALES_FUNNEL_PIPELINE_ID, stage_id: stage.id, status: persistedStatus,
    closure_type: null, closure_reason: null,
  }
  if (input.id) {
    const { data: current, error } = await ctx.supabase.from('opportunities').select('id,status,stage_id')
      .eq('id', input.id).eq('company_id', ctx.companyId).eq('pipeline_id', SALES_FUNNEL_PIPELINE_ID).maybeSingle()
    if (error || !current) return fail('Oportunidade não encontrada.')
    if (!['open', 'won'].includes(current.status)) return fail('Oportunidades encerradas não podem ser editadas.')
    if (!input.fromStageId || !isUuid(input.fromStageId)) return fail('Atualize o cartão antes de editar.')
    if (current.stage_id !== input.fromStageId) return fail('O cartão foi alterado em outra solicitação. Atualize o funil e tente novamente.')
    const closingNow = persistedStatus === 'won' && current.status !== 'won'
    if (closingNow && !(await hasClosedSalesSchema(ctx.supabase)))
      return fail('O registro de vendas fechadas aguarda a migration 202610310009. Nenhuma oportunidade foi concluída como WON.')
    const updatePayload = closingNow ? { ...payload, stage_id: current.stage_id, status: current.status } : payload
    const { data: updated, error: updateError } = await ctx.supabase.from('opportunities').update(updatePayload)
      .eq('id', input.id).eq('company_id', ctx.companyId).eq('pipeline_id', SALES_FUNNEL_PIPELINE_ID).eq('stage_id', input.fromStageId)
      .in('status', ['open','won']).select('id,stage_id,status').maybeSingle()
    if (updateError) return fail(`Falha ao salvar oportunidade: ${updateError.message}`)
    if (!updated) return fail('O cartão foi alterado em outra solicitação. Atualize o funil e tente novamente.')
    const { error: linkError } = await (ctx.supabase as any).rpc('set_opportunity_products', { p_opportunity_id: input.id, p_product_ids: additionalProductIds })
    if (linkError) return fail('Oportunidade salva, mas não foi possível atualizar a lista de produtos adicionais: ' + (linkError.message || 'erro no banco.'))
    if (closingNow) {
      const { data: closed, error: closeError } = await ctx.supabase.from('opportunities').update({ stage_id: stage.id, status: 'won' })
        .eq('id', input.id).eq('company_id', ctx.companyId).eq('pipeline_id', SALES_FUNNEL_PIPELINE_ID).eq('stage_id', current.stage_id).eq('status', current.status)
        .select('id,stage_id,status').maybeSingle()
      if (closeError || !closed) return fail('A ficha e os produtos foram salvos, mas a conclusão WON não foi confirmada. Atualize o funil; a venda não foi registrada parcialmente.')
      if (closed.stage_id !== stage.id || closed.status !== 'won') return fail('O banco não confirmou o fechamento WON. Atualize o funil para verificar a oportunidade.')
    } else if (updated.stage_id !== stage.id || updated.status !== persistedStatus) {
      return fail('O banco não confirmou a etapa solicitada. Atualize o funil antes de tentar novamente.')
    }
    revalidatePath('/funil'); revalidatePath('/oportunidades'); revalidatePath('/comissoes'); revalidatePath('/')
    return succeed('Ficha comercial atualizada. As comissões foram recalculadas com os novos valores.')
  }
  if (subject.leadId) {
    const { data: related, error: relatedError } = await ctx.supabase.from('opportunities')
      .select('id').eq('company_id', ctx.companyId).eq('person_id', subject.personId).eq('pipeline_id', SALES_FUNNEL_PIPELINE_ID).in('status', ['open','won']).limit(1)
    if (relatedError) return fail('Não foi possível verificar oportunidades existentes para este lead.')
    if (related?.length) return fail('Este lead já está representado por uma oportunidade. Edite ou avance o cartão existente.')
  }
  if (persistedStatus === 'won' && !(await hasClosedSalesSchema(ctx.supabase)))
    return fail('O registro de vendas fechadas aguarda a migration 202610310009. Nenhuma oportunidade foi concluída como WON.')
  const createStage = persistedStatus === 'won' ? ctx.stages.find(row => !row.is_won) : stage
  if (!createStage) return fail('Não há etapa aberta disponível para iniciar a oportunidade.')
  const createPayload = persistedStatus === 'won' ? { ...payload, stage_id: createStage.id, status: 'open' as const } : payload
  const { data: created, error } = await ctx.supabase.from('opportunities').insert(createPayload).select('id,stage_id,status').single()
  if (error?.code === '23505' && subject.leadId) return fail('Este lead já possui uma oportunidade vinculada.')
  if (error) return fail(`Não foi possível criar a oportunidade: ${error.message}`)
  if (created.stage_id !== createStage.id || created.status !== createPayload.status) return fail('O banco não confirmou a etapa inicial. Atualize o funil para verificar o cartão.')
  const { error: linkError } = await (ctx.supabase as any).rpc('set_opportunity_products', { p_opportunity_id: created.id, p_product_ids: additionalProductIds })
  if (linkError) return fail('Oportunidade criada, mas não foi possível vincular os produtos adicionais. Reabra a ficha para concluir.')
  if (persistedStatus === 'won') {
    const { data: closed, error: closeError } = await ctx.supabase.from('opportunities').update({ stage_id: stage.id, status: 'won' })
      .eq('id', created.id).eq('company_id', ctx.companyId).eq('stage_id', createStage.id).eq('status', 'open').select('id,stage_id,status').maybeSingle()
    if (closeError || !closed) return fail('A oportunidade foi criada em Leads, mas não foi concluída como WON. Atualize o funil; nenhuma venda parcial foi registrada.')
    if (closed.stage_id !== stage.id || closed.status !== 'won') return fail('O banco não confirmou o fechamento WON. Atualize o funil para verificar a oportunidade.')
  }
  revalidatePath('/funil'); revalidatePath('/oportunidades')
  return succeed('Oportunidade criada.')
}

export async function addOpportunityActivity(opportunityId: string, kind: 'note'|'call'|'message'|'meeting'|'task', title: string, details: string): Promise<FunnelActionResult> {
  const ctx = await getContext()
  if ('error' in ctx) return ctx.error
  if (!isUuid(opportunityId) || !['note','call','message','meeting','task'].includes(kind) || title.trim().length < 2 || title.length > 180 || details.length > 5000) return fail('Confira o tipo e o conteúdo da atividade.')
  const { data: opportunity, error } = await ctx.supabase.from('opportunities').select('id,person_id,status').eq('id', opportunityId).eq('company_id', ctx.companyId).eq('pipeline_id', SALES_FUNNEL_PIPELINE_ID).maybeSingle()
  if (error || !opportunity || !['open','won'].includes(opportunity.status)) return fail('Oportunidade indisponível para registrar atividade.')
  const { data: auth } = await ctx.supabase.auth.getUser()
  const { error: insertError } = await ctx.supabase.from('activities').insert({ company_id: ctx.companyId, opportunity_id: opportunity.id, person_id: opportunity.person_id, kind, title: title.trim(), details: details.trim() || null, created_by: auth.user?.id ?? null })
  if (insertError) return fail('Não foi possível registrar a atividade. Confira as políticas RLS.')
  revalidatePath('/funil')
  return succeed('Comentário/atividade registrado.')
}

async function advanceLeadToFirstContactInternal(leadId: string): Promise<FunnelActionResult> {
  const ctx = await getContext()
  if ('error' in ctx) return ctx.error
  if (typeof leadId !== 'string' || !isUuid(leadId)) return fail('Lead inválido.')
  const stage = ctx.stages.find(row => row.name === '1º contato')
  if (!stage) return fail('Etapa 1º contato indisponível.')
  const { data: lead, error } = await ctx.supabase.from('leads')
    .select('id,person_id,status,seller_id,interest_product_id,notes').eq('id', leadId).eq('company_id', ctx.companyId).maybeSingle()
  if (error || !lead?.person_id || ['converted', 'lost'].includes(lead.status)) return fail('Este lead não está mais disponível.')
  const { data: existing, error: lookupError } = await ctx.supabase.from('opportunities')
    .select('id,status,stage_id').eq('company_id', ctx.companyId).eq('lead_id', lead.id).maybeSingle()
  if (lookupError) return fail('Não foi possível verificar oportunidades existentes.')
  if (existing) {
    if (existing.status !== 'open') return fail('O lead já possui uma oportunidade encerrada.')
    if (existing.stage_id === stage.id) return succeed('Este lead já está em 1º contato.')
    const { data, error: moveError } = await ctx.supabase.from('opportunities').update({ stage_id: stage.id })
      .eq('id', existing.id).eq('company_id', ctx.companyId).eq('stage_id', existing.stage_id).eq('status', 'open').select('id').maybeSingle()
    if (!moveError && data) { revalidatePath('/funil'); revalidatePath('/oportunidades'); return succeed('Lead avançado para 1º contato.') }
    const { data: latest } = await ctx.supabase.from('opportunities').select('stage_id').eq('id', existing.id).eq('company_id', ctx.companyId).maybeSingle()
    return latest?.stage_id === stage.id ? succeed('Este lead já está em 1º contato.') : fail('Cartão alterado em outra solicitação. Atualize o funil.')
  }
  const { data: byPerson, error: personOpportunityError } = await ctx.supabase.from('opportunities')
    .select('id,status,stage_id,lead_id,customer_id,seller_id,product_id,notes').eq('company_id', ctx.companyId).eq('pipeline_id', SALES_FUNNEL_PIPELINE_ID)
    .eq('person_id', lead.person_id).in('status', ['open','won']).limit(2)
  if (personOpportunityError) return fail('Não foi possível verificar oportunidades existentes para este lead.')
  if (byPerson?.length) {
    if (byPerson.length > 1) return fail('Há mais de uma oportunidade aberta para esta pessoa; revise os vínculos antes de avançar o lead.')
    const related = byPerson[0]
    if (related.status !== 'open') return fail('Esta pessoa já tem uma oportunidade WON vinculada.')
    // A negociação pode já ter sido convertida em cliente numa tentativa anterior.
    // Nesse caso, mantenha o vínculo com o cliente e avance apenas a etapa.
    if (related.customer_id) {
      const { data, error: moveError } = await ctx.supabase.from('opportunities').update({ stage_id: stage.id })
        .eq('id', related.id).eq('company_id', ctx.companyId).eq('stage_id', related.stage_id).eq('status', 'open').select('id').maybeSingle()
      if (!moveError && data) {
        revalidatePath('/funil'); revalidatePath('/oportunidades')
        return succeed(related.stage_id === stage.id ? 'Este lead já está em 1º contato.' : 'Oportunidade do cliente avançada para 1º contato.')
      }
      const { data: latest } = await ctx.supabase.from('opportunities').select('stage_id,customer_id').eq('id', related.id).eq('company_id', ctx.companyId).maybeSingle()
      if (latest?.customer_id === related.customer_id && latest?.stage_id === stage.id) return succeed('Este lead já está em 1º contato.')
      return fail('A oportunidade foi alterada em outra solicitação. Atualize o funil.')
    }
    if (related.lead_id && related.lead_id !== lead.id) return fail('A pessoa já está vinculada a outro lead no funil.')
    const { data, error: linkError } = await ctx.supabase.from('opportunities').update({
      lead_id: lead.id, stage_id: stage.id,
      seller_id: related.seller_id ?? lead.seller_id,
      product_id: related.product_id ?? lead.interest_product_id,
      notes: related.notes ?? lead.notes,
    }).eq('id', related.id).eq('company_id', ctx.companyId).eq('stage_id', related.stage_id).eq('status', 'open').select('id').maybeSingle()
    if (!linkError && data) {
      revalidatePath('/funil'); revalidatePath('/oportunidades')
      return succeed('Oportunidade existente vinculada ao lead e avançada para 1º contato.')
    }
    const { data: latest } = await ctx.supabase.from('opportunities').select('lead_id,stage_id').eq('id', related.id).eq('company_id', ctx.companyId).maybeSingle()
    if (latest && latest.lead_id === lead.id && latest.stage_id === stage.id) return succeed('Este lead já está em 1º contato.')
    return fail('A oportunidade foi alterada em outra solicitação. Atualize o funil.')
  }
  const { data: person } = await ctx.supabase.from('people').select('name').eq('id', lead.person_id).eq('company_id', ctx.companyId).maybeSingle()
  if (!person) return fail('Dados do lead não encontrados.')
  const { error: insertError } = await ctx.supabase.from('opportunities').insert({
    company_id: ctx.companyId, person_id: lead.person_id, lead_id: lead.id, seller_id: lead.seller_id,
    product_id: lead.interest_product_id, title: person.name, notes: lead.notes,
    pipeline_id: SALES_FUNNEL_PIPELINE_ID, stage_id: stage.id, status: 'open',
  })
  if (insertError?.code === '23505') {
    const { data: raced } = await ctx.supabase.from('opportunities').select('id,status,stage_id').eq('company_id', ctx.companyId).eq('lead_id', lead.id).maybeSingle()
    if (raced?.status === 'open' && raced.stage_id === stage.id) return succeed('Este lead já está em 1º contato.')
    if (raced?.status === 'open' && raced?.id) {
      const { error: moveError } = await ctx.supabase.from('opportunities').update({ stage_id: stage.id }).eq('id', raced.id).eq('company_id', ctx.companyId).eq('status', 'open')
      if (!moveError) return succeed('Lead avançado para 1º contato.')
    }
    return fail('Este lead já possui uma oportunidade vinculada.')
  }
  if (insertError) return fail('Não foi possível avançar o lead.')
  revalidatePath('/funil'); revalidatePath('/oportunidades')
  return succeed('Lead avançado; o cadastro original foi preservado.')
}

export async function advanceLeadToFirstContact(leadId: string): Promise<FunnelActionResult> {
  return advanceLeadToFirstContactInternal(leadId)
}

export async function startLeadNegotiation(leadId: string): Promise<FunnelActionResult> {
  const supabase = await createAdminClient()
  let companyId: string
  try { ({ companyId } = await resolveTenantContext(supabase)) }
  catch { return fail('Não foi possível confirmar a empresa ativa para esta operação.') }
  const { data: lead, error: leadError } = await supabase.from('leads')
    .select('id,person_id,status').eq('id', leadId).eq('company_id', companyId).maybeSingle()
  if (leadError || !lead?.person_id) return fail('Lead não encontrado ou sem acesso.')
  if (['converted','lost'].includes(lead.status)) return fail('Este lead já foi encerrado e não pode iniciar uma nova negociação.')

  const { data: existingCustomer, error: customerLookupError } = await supabase.from('customers')
    .select('id,status').eq('person_id', lead.person_id).eq('company_id', companyId).maybeSingle()
  if (customerLookupError) return fail('Não foi possível verificar se a pessoa já está cadastrada como cliente.')
  if (existingCustomer?.status === 'inactive') return fail('O cadastro de cliente existente está inativo. Reative-o para iniciar a negociação.')

  const opportunityResult = await advanceLeadToFirstContactInternal(leadId)
  if (!opportunityResult.ok) return opportunityResult

  let customer = existingCustomer
  if (!customer) {
    const { data: createdCustomer, error: customerInsertError } = await supabase.from('customers')
      .insert({ company_id: companyId, person_id: lead.person_id, status: 'active' }).select('id,status').single()
    if (customerInsertError?.code === '23505') {
      const { data: racedCustomer } = await supabase.from('customers').select('id,status').eq('person_id', lead.person_id).eq('company_id', companyId).maybeSingle()
      customer = racedCustomer
    } else if (customerInsertError || !createdCustomer) {
      return fail('A oportunidade foi iniciada, mas o cliente não foi criado. Você pode tentar novamente; os dados do lead foram preservados.')
    } else customer = createdCustomer
  }
  if (!customer) return fail('A oportunidade foi iniciada, mas não foi possível confirmar o cadastro do cliente.')
  if (customer.status !== 'active') return fail('O cadastro de cliente existente está inativo. Reative-o para continuar.')

  // Transfere o cartão do lead para o cadastro central do cliente. O constraint
  // do schema exige que lead_id e customer_id não sejam preenchidos juntos.
  const { data: transferred, error: transferError } = await supabase.from('opportunities')
    .update({ lead_id: null, customer_id: customer.id })
    .eq('lead_id', lead.id).eq('person_id', lead.person_id).eq('company_id', companyId).select('id').maybeSingle()
  if (transferError || !transferred) {
    const { data: alreadyTransferred, error: verifyError } = await supabase.from('opportunities')
      .select('id').eq('company_id', companyId).eq('customer_id', customer.id).eq('person_id', lead.person_id)
      .eq('pipeline_id', SALES_FUNNEL_PIPELINE_ID).eq('status', 'open').maybeSingle()
    if (verifyError || !alreadyTransferred)
      return fail('O cliente e a oportunidade foram preparados, mas não foi possível concluir o vínculo. Tente novamente antes de iniciar outra oportunidade.')
  }

  if (lead.status !== 'converted') {
    if (!['new','contacted','qualified'].includes(lead.status)) return fail('A oportunidade foi iniciada, mas o status do lead mudou. Confira o cadastro antes de continuar.')
    const { data: updatedLead, error: updateLeadError } = await supabase.from('leads')
      .update({ status: 'converted', converted_at: new Date().toISOString() })
      .eq('id', lead.id).eq('company_id', companyId).in('status', ['new','contacted','qualified']).select('id').maybeSingle()
    if (updateLeadError || !updatedLead) return fail('A oportunidade e o cliente foram criados; atualize o status do lead antes de repetir a ação.')
  }

  revalidatePath('/leads')
  revalidatePath('/clientes')
  revalidatePath('/funil')
  revalidatePath('/oportunidades')
  revalidatePath(`/clientes/${customer.id}`)
  return succeed('Cliente criado com os dados do lead e oportunidade iniciada em 1º contato no funil.')
}

export async function moveOpportunity(id: string, fromStageId: string, toStageId: string): Promise<FunnelActionResult> {
  if (![id, fromStageId, toStageId].every(value => typeof value === 'string' && isUuid(value)) || fromStageId === toStageId) return fail('Movimentação inválida.')
  const ctx = await getContext()
  if ('error' in ctx) return ctx.error
  const { supabase, companyId } = ctx
  const { data: stages, error: stagesError } = await supabase.from('pipeline_stages')
    .select('id,name,is_won').eq('pipeline_id', SALES_FUNNEL_PIPELINE_ID).eq('active', true)
  if (stagesError || !stages || stages.length !== SALES_FUNNEL_STAGES.length) return fail('Não foi possível carregar as etapas do funil.')
  const target = stages.find(row => row.id === toStageId)
  if (!target) return fail('Etapa de destino indisponível.')
  if (target.is_won && !(await hasClosedSalesSchema(supabase)))
    return fail('O registro de vendas fechadas aguarda a migration 202610310009. Nenhuma oportunidade foi concluída como WON.')
  const { data, error } = await supabase.from('opportunities').update({ stage_id: target.id, status: target.is_won ? 'won' : 'open' })
    .eq('id', id).eq('company_id', companyId).eq('pipeline_id', SALES_FUNNEL_PIPELINE_ID).eq('stage_id', fromStageId).eq('status', 'open').select('id').maybeSingle()
  if (!error && data) {
    revalidatePath('/funil')
    revalidatePath('/oportunidades')
    if (target.is_won) { revalidatePath('/comissoes'); revalidatePath('/') }
    return succeed(target.is_won ? 'Oportunidade concluída como WON.' : 'Oportunidade movida para ' + target.name + '.')
  }
  const { data: latest } = await supabase.from('opportunities').select('stage_id,status').eq('id', id).eq('company_id', companyId).maybeSingle()
  if (latest && latest.stage_id === target.id && latest.status === (target.is_won ? 'won' : 'open')) return succeed('Movimentação já registrada.')
  return fail('Cartão alterado em outra solicitação ou encerrado. Atualize o funil.')
}

export async function closeOpportunity(id: string, type: 'lost' | 'rejected', reason: string): Promise<FunnelActionResult> {
  const ctx = await getContext()
  if ('error' in ctx) return ctx.error
  if (typeof id !== 'string' || !isUuid(id) || !['lost', 'rejected'].includes(type) || typeof reason !== 'string' || reason.trim().length < 3 || reason.trim().length > 1000)
    return fail('Informe o tipo e um motivo de encerramento entre 3 e 1000 caracteres.')
  const { data, error } = await ctx.supabase.from('opportunities').update({ status: 'lost', closure_type: type, closure_reason: reason.trim() })
    .eq('id', id).eq('company_id', ctx.companyId).eq('pipeline_id', SALES_FUNNEL_PIPELINE_ID).eq('status', 'open').select('id').maybeSingle()
  if (!error && data) { revalidatePath('/funil'); revalidatePath('/oportunidades'); return succeed(type === 'lost' ? 'Oportunidade encerrada como perdida.' : 'Oportunidade encerrada como reprovada.') }
  const { data: current } = await ctx.supabase.from('opportunities').select('status,closure_type,closure_reason').eq('id', id).eq('company_id', ctx.companyId).maybeSingle()
  if (current?.status === 'lost' && current.closure_type === type && current.closure_reason === reason.trim()) return succeed('Encerramento já registrado.')
  return fail('Não foi possível encerrar a oportunidade. Atualize o funil.')
}

