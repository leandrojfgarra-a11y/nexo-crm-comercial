import Link from 'next/link'
import { CustomerForm } from '@/components/customer-form'
import { PageHeader } from '@/components/ui'
import { hasBusinessActivitySchema, hasCompleteAccountantSchema, hasCompleteCustomerSchema } from '@/lib/customer-schema'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveTenantContext } from '@/lib/tenant/context'

export default async function NewCustomerPage() {
  const supabase = await createAdminClient()
  const { companyId } = await resolveTenantContext(supabase)
  const schemaReady = await hasCompleteCustomerSchema(supabase)
  const businessActivityReady = await hasBusinessActivitySchema(supabase)
  const accountantDetailsReady = await hasCompleteAccountantSchema(supabase)
  const [{ data: sellers }, { data: accountantRows }] = await Promise.all([
    supabase.from('sellers').select('id,name').eq('company_id', companyId).eq('active', true).order('name'),
    schemaReady ? supabase.from('accountants').select(accountantDetailsReady ? 'id,kind,name,trade_name,tax_id,contact_name,email,phone,mobile_phone,whatsapp,postal_code,address_line,address_number,address_extra,district,city,state,active' : 'id,name,active,email,phone').eq('company_id', companyId).order('name') : Promise.resolve({ data: [] }),
  ])
  const accountants = (accountantRows ?? []) as unknown as import('@/components/customer-form').AccountantOption[]
  return <>
    <Link href="/clientes" className="mb-5 inline-block text-sm font-semibold text-blue">← Voltar para clientes</Link>
    <PageHeader eyebrow="Relacionamento · Clientes" title="Novo cliente" subtitle="Preencha o cadastro organizado por identificação, dados fiscais, contato e relacionamento." />
    <CustomerForm mode="create" schemaReady={schemaReady} accountantDetailsReady={accountantDetailsReady} businessActivityReady={businessActivityReady} sellers={sellers ?? []} accountants={accountants} />
  </>
}
