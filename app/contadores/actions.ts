'use server'

import { redirect } from 'next/navigation'
import { digits, validCpf, validCnpj } from '@/lib/crm-validation'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasAccountantRelationshipSchema, hasCompleteAccountantSchema } from '@/lib/customer-schema'
import { resolveTenantContext } from '@/lib/tenant/context'

export async function saveAccountant(formData: FormData) {
  const supabase = await createAdminClient()
  const tenant = await resolveTenantContext(supabase)
  const kind = String(formData.get('kind') ?? 'individual')
  const name = String(formData.get('name') ?? '').trim()
  const taxIdInput = String(formData.get('tax_id') ?? '').trim().toUpperCase()
  const taxId = taxIdInput ? (kind === 'individual' ? digits(taxIdInput) : taxIdInput.replace(/[.\/-]/g, '')) : null
  const email = String(formData.get('email') ?? '').trim().toLowerCase() || null
  const phone = String(formData.get('phone') ?? '').trim() || null
  const notes = String(formData.get('notes') ?? '').trim() || null
  const id = String(formData.get('accountant_id') ?? '').trim()
  const active = String(formData.get('active') ?? 'true') === 'true'
  const relationshipType = String(formData.get('relationship_type') ?? (id ? '' : 'lead'))
  if (relationshipType && !['lead', 'partner'].includes(relationshipType)) redirect('/contadores?notice=invalid')
  if (!['individual', 'office'].includes(kind) || name.length < 2) redirect('/contadores?notice=invalid')
  if (taxId && !(kind === 'individual' ? validCpf(taxId) : validCnpj(taxId))) redirect('/contadores?notice=tax-invalid')
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) redirect('/contadores?notice=email-invalid')
  const payload: Record<string, string | boolean | null> = { company_id: tenant.companyId, kind, name, tax_id: taxId, email, phone, notes, active }
  if (await hasCompleteAccountantSchema(supabase)) Object.assign(payload, {
    trade_name: String(formData.get('trade_name') ?? '').trim() || null,
    contact_name: String(formData.get('contact_name') ?? '').trim() || null,
    mobile_phone: String(formData.get('mobile_phone') ?? '').trim() || null,
    whatsapp: String(formData.get('whatsapp') ?? '').trim() || null,
    postal_code: digits(String(formData.get('postal_code') ?? '')) || null,
    address_line: String(formData.get('address_line') ?? '').trim() || null,
    address_number: String(formData.get('address_number') ?? '').trim() || null,
    address_extra: String(formData.get('address_extra') ?? '').trim() || null,
    district: String(formData.get('district') ?? '').trim() || null,
    city: String(formData.get('city') ?? '').trim() || null,
    state: String(formData.get('state') ?? '').trim().toUpperCase() || null,
  })
  if (await hasAccountantRelationshipSchema(supabase)) payload.relationship_type = relationshipType || null
  if (id) {
    const { data, error } = await supabase.from('accountants').update(payload)
      .eq('id', id).eq('company_id', tenant.companyId).select('id').maybeSingle()
    if (error) redirect(`/contadores?notice=${error.code === '23505' ? 'duplicate' : 'save-error'}`)
    if (!data) redirect('/contadores?notice=not-found')
    redirect('/contadores?notice=updated')
  }
  const { error } = await supabase.from('accountants').insert(payload)
  if (error) redirect(`/contadores?notice=${error.code === '23505' ? 'duplicate' : 'save-error'}`)
  redirect('/contadores?notice=created')
}

export async function createQuickAccountant(formData: FormData) {
  const supabase = await createAdminClient()
  const tenant = await resolveTenantContext(supabase)
  if (!(await hasCompleteAccountantSchema(supabase))) return { error: 'A migration de dados completos de contabilidades ainda precisa ser aplicada.' }
  const get = (key: string) => String(formData.get(`quick_accountant_${key}`) ?? '').trim()
  const kind = get('kind') || 'individual'
  const name = get('name')
  const taxRaw = get('tax_id').toUpperCase()
  const taxId = taxRaw ? (kind === 'individual' ? digits(taxRaw) : taxRaw.replace(/[.\/-]/g, '')) : null
  const email = get('email').toLowerCase() || null
  if (!['individual','office'].includes(kind) || name.length < 2) return { error: 'Informe o tipo e o nome da contabilidade.' }
  if (taxId && !(kind === 'individual' ? validCpf(taxId) : validCnpj(taxId))) return { error: 'CPF ou CNPJ da contabilidade inválido.' }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Informe um e-mail válido.' }
  const payload = {
    company_id: tenant.companyId,
    kind, name, tax_id: taxId, email, phone: get('phone') || null, notes: get('notes') || null, active: true,
    trade_name: get('trade_name') || null, contact_name: get('contact_name') || null,
    mobile_phone: get('mobile_phone') || null, whatsapp: get('whatsapp') || null,
    postal_code: digits(get('postal_code')) || null, address_line: get('address_line') || null,
    address_number: get('address_number') || null, address_extra: get('address_extra') || null,
    district: get('district') || null, city: get('city') || null, state: get('state').toUpperCase() || null,
  }
  if (await hasAccountantRelationshipSchema(supabase)) Object.assign(payload, { relationship_type: 'lead' })
  const { data, error } = await supabase.from('accountants').insert(payload).select('id,kind,name,trade_name,tax_id,contact_name,phone,mobile_phone,whatsapp,email,postal_code,address_line,address_number,address_extra,district,city,state,active').single()
  if (error || !data) return { error: error?.code === '23505' ? 'Já existe uma contabilidade cadastrada com esse documento.' : 'Não foi possível criar a contabilidade. Confira o schema e as políticas administrativas.' }
  return { accountant: data }
}
