import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CustomerForm, type CustomerFormValues } from '@/components/customer-form'
import { PageHeader } from '@/components/ui'
import { hasBusinessActivitySchema, hasCompleteAccountantSchema, hasCompleteCustomerSchema } from '@/lib/customer-schema'
import { createAdminClient } from '@/lib/supabase/admin'
import { isUuid } from '@/lib/customer-files'
import { resolveTenantContext } from '@/lib/tenant/context'

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) notFound()
  const supabase = await createAdminClient()
  const { companyId } = await resolveTenantContext(supabase)
  const [{ data: customer }, schemaReady, businessActivityReady, { data: sellers }] = await Promise.all([
    supabase.from('customers').select('*,people(*)').eq('id', id).eq('company_id', companyId).maybeSingle(),
    hasCompleteCustomerSchema(supabase),
    hasBusinessActivitySchema(supabase),
    supabase.from('sellers').select('id,name').eq('company_id', companyId).eq('active', true).order('name'),
  ])
  if (!customer) notFound()
  const person = (Array.isArray(customer.people) ? customer.people[0] : customer.people) as Record<string, string | boolean | null> | null
  if (!person) notFound()
  const str = (key: string) => typeof person[key] === 'string' ? person[key] as string : null
  const accountantDetailsReady = await hasCompleteAccountantSchema(supabase)
  const { data: accountantRows } = schemaReady ? await supabase.from('accountants').select(accountantDetailsReady ? 'id,kind,name,trade_name,tax_id,contact_name,email,phone,mobile_phone,whatsapp,postal_code,address_line,address_number,address_extra,district,city,state,active' : 'id,name,active,email,phone').eq('company_id', companyId).order('name') : { data: [] }
  const accountants = (accountantRows ?? []) as unknown as import('@/components/customer-form').AccountantOption[]
  const initial: CustomerFormValues = {
    id: customer.id, status: customer.status, customer_notes: customer.notes, source: customer.source,
    seller_id: customer.seller_id, accountant_id: customer.accountant_id,
    kind: str('kind'), name: str('name'), trade_name: str('trade_name'), tax_id: str('tax_id'),
    email: str('email'), phone: str('phone'), mobile_phone: str('mobile_phone'), whatsapp: str('whatsapp'),
    postal_code: str('postal_code'), address_line: str('address_line'), address_number: str('address_number'),
    address_extra: str('address_extra'), district: str('district'), city: str('city'), state: str('state'),
    state_registration: str('state_registration'), municipal_registration: str('municipal_registration'),
    icms_contributor: typeof person.icms_contributor === 'boolean' ? person.icms_contributor : null,
    primary_cnae: str('primary_cnae'), tax_regime: str('tax_regime'), business_activity: str('business_activity'),
    registration_status: str('registration_status'), opened_at: str('opened_at'), person_notes: str('notes'),
  }
  return <>
    <Link href={`/clientes/${id}`} className="mb-5 inline-block text-sm font-semibold text-blue">← Voltar para ficha 360°</Link>
    <PageHeader eyebrow="Relacionamento · Clientes" title="Editar cadastro" subtitle={str('name') ?? 'Atualize os dados do cliente.'} />
    <CustomerForm mode="edit" initial={initial} schemaReady={schemaReady} accountantDetailsReady={accountantDetailsReady} businessActivityReady={businessActivityReady} sellers={sellers ?? []} accountants={accountants} />
  </>
}
