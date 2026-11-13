'use server'

import { redirect } from 'next/navigation'
import { parsePerson } from '@/lib/crm-validation'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasBusinessActivitySchema, hasCompleteCustomerSchema } from '@/lib/customer-schema'
import { resolveTenantContext } from '@/lib/tenant/context'

const customerPath = '/clientes'
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
function notice(value: string): never { redirect(`${customerPath}?notice=${encodeURIComponent(value)}`) }

export async function saveCustomer(formData: FormData) {
  const supabase = await createAdminClient()
  const { companyId } = await resolveTenantContext(supabase)
  const parsed = parsePerson(formData)
  if (parsed.error || !parsed.value) notice(parsed.error ?? 'Revise os dados informados.')

  const id = String(formData.get('customer_id') ?? '').trim()
  const status = String(formData.get('status') ?? 'active')
  const customerNotes = String(formData.get('customer_notes') ?? '').trim() || null
  if (!['active', 'inactive'].includes(status)) notice('Selecione uma situação válida.')

  const schemaReady = await hasCompleteCustomerSchema(supabase)
  const businessActivityReady = await hasBusinessActivitySchema(supabase)
  const businessActivity = String(formData.get('business_activity') ?? '').trim()
  if (businessActivity.length > 150) notice('Ramo de atividade deve ter até 150 caracteres.')
  if (businessActivity && !businessActivityReady) notice('A coluna do ramo de atividade ainda aguarda a migration incremental.')
  if (!schemaReady && parsed.value.kind === 'company' && /[A-Z]/i.test(parsed.value.taxId ?? '')) {
    notice('CNPJ alfanumérico exige a migration complementar antes de salvar.')
  }
  const sellerId = schemaReady ? String(formData.get('seller_id') ?? '').trim() || null : null
  const accountantId = schemaReady ? String(formData.get('accountant_id') ?? '').trim() || null : null
  if (sellerId) {
    const { data } = await supabase.from('sellers').select('id').eq('id', sellerId).eq('company_id', companyId).eq('active', true).maybeSingle()
    if (!data) notice('Selecione um vendedor ativo válido.')
  }
  if (accountantId) {
    const { data } = await supabase.from('accountants').select('id').eq('id', accountantId).eq('company_id', companyId).maybeSingle()
    if (!data) notice('Selecione uma contabilidade válida.')
  }
  const openedAt = parsed.value.openedAt
  if (openedAt && !/^\d{4}-\d{2}-\d{2}$/.test(openedAt)) notice('Informe uma data de abertura válida.')

  if (parsed.value.taxId) {
    let duplicateQuery = supabase.from('people').select('id').eq('company_id', companyId).eq('tax_id', parsed.value.taxId).limit(1)
    if (id) {
      if (!uuidPattern.test(id)) notice('Cadastro inválido.')
      const { data: existing } = await supabase.from('customers').select('person_id').eq('id', id).eq('company_id', companyId).maybeSingle()
      if (!existing) notice('Cliente não encontrado.')
      duplicateQuery = duplicateQuery.neq('id', existing.person_id)
    }
    const { data: duplicate, error } = await duplicateQuery.maybeSingle()
    if (error) notice('Não foi possível verificar a duplicidade do documento.')
    if (duplicate) notice('Já existe um cadastro com este CPF/CNPJ.')
  }

  const person: Record<string, string | boolean | null> = {
    company_id: companyId,
    kind: parsed.value.kind, name: parsed.value.name, trade_name: parsed.value.tradeName,
    tax_id: parsed.value.taxId, email: parsed.value.email, phone: parsed.value.phone, whatsapp: parsed.value.whatsapp,
    postal_code: parsed.value.postalCode, address_line: parsed.value.addressLine,
    address_number: parsed.value.addressNumber, address_extra: parsed.value.addressExtra,
    district: parsed.value.district, city: parsed.value.city, state: parsed.value.state,
    notes: parsed.value.notes,
  }
  if (schemaReady) Object.assign(person, {
    mobile_phone: parsed.value.mobilePhone, state_registration: parsed.value.stateRegistration,
    municipal_registration: parsed.value.municipalRegistration, icms_contributor: parsed.value.icmsContributor,
    primary_cnae: parsed.value.primaryCnae, tax_regime: parsed.value.taxRegime,
    registration_status: parsed.value.registrationStatus, opened_at: openedAt || null,
  })
  if (businessActivityReady) person.business_activity = businessActivity || null
  const commercial = schemaReady ? { status, notes: customerNotes, seller_id: sellerId, accountant_id: accountantId, source: String(formData.get('source') ?? '').trim() || null } : { status, notes: customerNotes }

  if (id) {
    const { data: existing, error: lookupError } = await supabase.from('customers').select('person_id').eq('id', id).eq('company_id', companyId).maybeSingle()
    if (lookupError || !existing) notice('Cliente não encontrado ou sem acesso.')
    const { error: personError } = await supabase.from('people').update(person).eq('id', existing.person_id).eq('company_id', companyId)
    if (personError) notice('Não foi possível atualizar os dados cadastrais.')
    const { error: customerError } = await supabase.from('customers').update(commercial).eq('id', id).eq('company_id', companyId)
    if (customerError) notice('Dados cadastrais atualizados, mas não foi possível salvar a situação/observação. Tente novamente.')
    redirect(`/clientes/${id}?notice=${schemaReady ? 'customer-updated' : 'customer-updated-schema-pending'}`)
  }

  const { data: createdPerson, error: personError } = await supabase.from('people').insert(person).select('id').single()
  if (personError || !createdPerson) notice(personError?.code === '23505' ? 'Já existe um cadastro com este CPF/CNPJ.' : 'Não foi possível criar a pessoa.')
  const { data: createdCustomer, error: customerError } = await supabase.from('customers').insert({ company_id: companyId, person_id: createdPerson.id, ...commercial }).select('id').single()
  if (customerError) {
    await supabase.from('people').delete().eq('id', createdPerson.id).eq('company_id', companyId)
    notice(customerError.code === '23505' ? 'Esta pessoa já está cadastrada como cliente.' : 'Não foi possível concluir o cadastro do cliente.')
  }
  redirect(`/clientes/${createdCustomer.id}?notice=${schemaReady ? 'customer-created' : 'customer-created-schema-pending'}`)
}

export async function saveCustomerAccountant(formData: FormData) {
  const supabase = await createAdminClient()
  const { companyId } = await resolveTenantContext(supabase)
  const customerId = String(formData.get('customer_id') ?? '').trim()
  const accountantId = String(formData.get('accountant_id') ?? '').trim() || null
  if (!uuidPattern.test(customerId) || (accountantId && !uuidPattern.test(accountantId))) notice('Vínculo inválido.')
  if (!(await hasCompleteCustomerSchema(supabase))) notice('O vínculo com contabilidade depende da migration de clientes.')
  const { data: customer } = await supabase.from('customers').select('id').eq('id', customerId).eq('company_id', companyId).maybeSingle()
  if (!customer) notice('Cliente não encontrado.')
  if (accountantId) {
    const { data: accountant } = await supabase.from('accountants').select('id').eq('id', accountantId).eq('company_id', companyId).maybeSingle()
    if (!accountant) notice('Contabilidade não encontrada.')
  }
  const { error } = await supabase.from('customers').update({ accountant_id: accountantId }).eq('id', customerId).eq('company_id', companyId)
  if (error) redirect(`/clientes/${customerId}?tab=accountant&notice=accountant-link-error#accountant`)
  redirect(`/clientes/${customerId}?tab=accountant&notice=accountant-link-updated#accountant`)
}

export async function addCustomerActivity(formData: FormData) {
  const supabase = await createAdminClient()
  const { companyId } = await resolveTenantContext(supabase)
  const customerId = String(formData.get('customer_id') ?? '').trim()
  const kind = String(formData.get('kind') ?? '')
  const title = String(formData.get('title') ?? '').trim()
  const details = String(formData.get('details') ?? '').trim() || null
  if (!uuidPattern.test(customerId)) notice('Cliente inválido.')
  if (!['call', 'message', 'meeting', 'task', 'note'].includes(kind)) notice('Selecione um tipo de atividade válido.')
  if (title.length < 2) notice('Informe um título para a atividade.')
  const { data: customer, error: lookupError } = await supabase.from('customers').select('person_id').eq('id', customerId).eq('company_id', companyId).maybeSingle()
  if (lookupError || !customer) notice('Cliente não encontrado ou sem acesso.')
  const { error } = await supabase.from('activities').insert({ company_id: companyId, person_id: customer.person_id, kind, title, details })
  if (error) notice('Não foi possível registrar a atividade. Confira as políticas RLS.')
  redirect(`/clientes/${customerId}?notice=activity-created#historico`)
}
