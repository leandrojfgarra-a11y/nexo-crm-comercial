'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { parsePerson } from '@/lib/crm-validation'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveTenantContext } from '@/lib/tenant/context'

const leadPath = '/leads'
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
function notice(value: string): never { redirect(`${leadPath}?notice=${encodeURIComponent(value)}`) }

function personRecord(person: NonNullable<ReturnType<typeof parsePerson>['value']>) {
  return {
    kind: person.kind, name: person.name, trade_name: person.tradeName, tax_id: person.taxId,
    email: person.email, phone: person.phone, whatsapp: person.whatsapp, postal_code: person.postalCode,
    address_line: person.addressLine, address_number: person.addressNumber,
    address_extra: person.addressExtra, district: person.district, city: person.city,
    state: person.state, notes: person.notes,
  }
}

function validDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export async function saveLead(formData: FormData) {
  const supabase = await createAdminClient()
  const { companyId } = await resolveTenantContext(supabase)
  const parsed = parsePerson(formData)
  if (parsed.error || !parsed.value) notice(parsed.error ?? 'Revise os dados informados.')
  const id = String(formData.get('lead_id') ?? '').trim()
  const source = String(formData.get('source') ?? '').trim() || null
  const sellerValue = String(formData.get('seller_id') ?? '').trim()
  const sellerId = sellerValue || null
  const productValue = String(formData.get('interest_product_id') ?? '').trim()
  const interestProductId = productValue || null
  const leadNotes = String(formData.get('lead_notes') ?? '').trim() || null
  const openedAt = String(formData.get('opened_at') ?? '').trim()
  if (openedAt && !validDateOnly(openedAt)) notice('Informe uma data de abertura válida.')
  const status = String(formData.get('status') ?? 'new')
  if (!['new', 'contacted', 'qualified', 'converted', 'lost'].includes(status)) notice('Selecione uma situação válida.')
  if (status === 'converted') {
    if (!id || !uuidPattern.test(id)) notice('Use a ação Converter para transformar um lead em cliente.')
    const { data: previous, error } = await supabase.from('leads').select('status').eq('id', id).eq('company_id', companyId).maybeSingle()
    if (error || previous?.status !== 'converted') notice('Use a ação Converter para transformar um lead em cliente.')
  }
  if (sellerId && !uuidPattern.test(sellerId)) notice('Selecione um vendedor válido.')
  if (sellerId) {
    const { data: seller, error: sellerError } = await supabase.from('sellers').select('id,active').eq('id', sellerId).eq('company_id', companyId).maybeSingle()
    if (sellerError || !seller) notice('O vendedor selecionado não existe ou está indisponível.')
    if (!seller.active) {
      if (!id || !uuidPattern.test(id)) notice('Vendedores inativos não podem ser atribuídos a novos leads.')
      const { data: existingLead, error: existingLeadError } = await supabase.from('leads').select('seller_id').eq('id', id).eq('company_id', companyId).maybeSingle()
      if (existingLeadError || existingLead?.seller_id !== sellerId) notice('Um vendedor inativo só pode ser preservado no vínculo já existente.')
    }
  }
  if (interestProductId && !uuidPattern.test(interestProductId)) notice('Selecione um produto ou serviço válido.')
  if (interestProductId) {
    const { data: product, error } = await supabase.from('products').select('id').eq('id', interestProductId).eq('company_id', companyId).eq('active', true).maybeSingle()
    if (error || !product) notice('O produto/serviço selecionado não existe ou está indisponível.')
  }
  if (parsed.value.taxId) {
    let duplicateQuery = supabase.from('people').select('id').eq('company_id', companyId).eq('tax_id', parsed.value.taxId).limit(1)
    if (id) {
      if (!uuidPattern.test(id)) notice('Lead inválido.')
      const { data: existing } = await supabase.from('leads').select('person_id').eq('id', id).eq('company_id', companyId).maybeSingle()
      if (!existing?.person_id) notice('Lead não encontrado.')
      duplicateQuery = duplicateQuery.neq('id', existing.person_id)
    }
    const { data: duplicate, error } = await duplicateQuery.maybeSingle()
    if (error) notice('Não foi possível verificar a duplicidade do documento.')
    if (duplicate) notice('Já existe um cadastro com este CPF/CNPJ.')
  }

  const lead = { company_id: companyId, source, seller_id: sellerId, status, interest_product_id: interestProductId, notes: leadNotes }
  if (id) {
    const { data: existing, error: lookupError } = await supabase.from('leads').select('person_id').eq('id', id).eq('company_id', companyId).maybeSingle()
    if (lookupError || !existing?.person_id) notice('Lead não encontrado ou sem acesso.')
    const { error: personError } = await supabase.from('people').update({ ...personRecord(parsed.value), opened_at: openedAt || null }).eq('id', existing.person_id).eq('company_id', companyId)
    if (personError) notice('Não foi possível atualizar os dados do contato.')
    const { error } = await supabase.from('leads').update(lead).eq('id', id).eq('company_id', companyId)
    if (error) notice('Contato atualizado, mas não foi possível salvar os dados do lead. Tente novamente.')
    notice('lead-updated')
  }

  const { data: person, error: personError } = await supabase.from('people').insert({ ...personRecord(parsed.value), company_id: companyId, opened_at: openedAt || null }).select('id').single()
  if (personError || !person) notice(personError?.code === '23505' ? 'Já existe um cadastro com este CPF/CNPJ.' : 'Não foi possível criar o contato.')
  const { error } = await supabase.from('leads').insert({ ...lead, person_id: person.id })
  if (error) {
    await supabase.from('people').delete().eq('id', person.id).eq('company_id', companyId)
    notice(error.code === '23505' ? 'Este contato já está cadastrado como lead.' : 'Não foi possível concluir o cadastro do lead.')
  }
  notice('lead-created')
}

export async function convertLead(formData: FormData) {
  const supabase = await createAdminClient()
  const { companyId } = await resolveTenantContext(supabase)
  const id = String(formData.get('lead_id') ?? '').trim()
  if (!uuidPattern.test(id)) notice('Lead inválido.')
  const { data: lead, error: leadError } = await supabase.from('leads').select('id,person_id,status').eq('id', id).eq('company_id', companyId).maybeSingle()
  if (leadError || !lead?.person_id) notice('Lead não encontrado ou sem acesso.')
  const { data: existingCustomer, error: lookupError } = await supabase.from('customers').select('id').eq('person_id', lead.person_id).eq('company_id', companyId).maybeSingle()
  if (lookupError) notice('Não foi possível verificar se o contato já é cliente.')
  let customerId = existingCustomer?.id
  if (!customerId) {
    const { data: createdCustomer, error } = await supabase.from('customers').insert({ company_id: companyId, person_id: lead.person_id, status: 'active' }).select('id').single()
    if (error?.code === '23505') {
      const { data: racedCustomer } = await supabase.from('customers').select('id').eq('person_id', lead.person_id).eq('company_id', companyId).maybeSingle()
      customerId = racedCustomer?.id
    } else if (error || !createdCustomer) notice('Não foi possível converter o lead em cliente.')
    else customerId = createdCustomer.id
  }
  if (!customerId) notice('Não foi possível localizar o cadastro de cliente convertido.')
  const { error } = await supabase.from('leads').update({ status: 'converted', converted_at: new Date().toISOString() }).eq('id', id).eq('company_id', companyId)
  if (error) notice('Cliente criado; não foi possível concluir o status da conversão. Tente novamente.')
  redirect(`/clientes?notice=lead-converted&customer=${customerId}`)
}

export async function addLeadInteraction(formData: FormData) {
  const supabase = await createAdminClient()
  const { companyId } = await resolveTenantContext(supabase)
  const id = String(formData.get('lead_id') ?? '').trim()
  const returnToEdit = formData.get('return_to') === 'edit'
  const kind = String(formData.get('kind') ?? '')
  const title = String(formData.get('title') ?? '').trim()
  const details = String(formData.get('details') ?? '').trim()
  const interactionPath = (code?: string) => returnToEdit
    ? `/leads?edit=${encodeURIComponent(id)}${code ? `&notice=${code}` : ''}#cadastro`
    : `/leads/${encodeURIComponent(id)}${code ? `?notice=${code}` : ''}`
  if (!uuidPattern.test(id)) notice('Lead inválido.')
  const cardNotice = (code: string): never => redirect(interactionPath(code))
  if (!['call', 'message', 'meeting', 'task', 'note'].includes(kind)) cardNotice('interaction-invalid')
  if (title.length < 2 || title.length > 180 || details.length > 5000 || !details) cardNotice('interaction-invalid')
  const { data: lead, error: leadError } = await supabase.from('leads').select('id,person_id,status').eq('id', id).eq('company_id', companyId).maybeSingle()
  if (leadError || !lead?.person_id) notice('Lead não encontrado ou sem acesso.')
  const { data: auth } = await supabase.auth.getUser()
  const { error } = await supabase.from('activities').insert({
    company_id: companyId,
    person_id: lead.person_id,
    kind,
    title,
    details: details || null,
    created_by: auth.user?.id ?? null,
  })
  if (error) cardNotice('interaction-save-failed')
  if (lead.status === 'new' && (kind === 'call' || kind === 'message')) {
    const { error: statusError } = await supabase.from('leads').update({ status: 'contacted' }).eq('id', id).eq('company_id', companyId).eq('status', 'new')
    if (statusError) {
      revalidatePath('/leads')
      revalidatePath(`/leads/${id}`)
      cardNotice('interaction-status-failed')
    }
  }
  revalidatePath('/leads')
  revalidatePath(`/leads/${id}`)
  redirect(interactionPath('interaction-added'))
}
