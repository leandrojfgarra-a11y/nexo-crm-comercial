import { PageHeader } from '@/components/ui'
import { HistoricalCustomerImport } from '@/components/historical-customer-import'
import { hasHistoricalCustomerImportSchema } from '@/lib/customer-schema'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveTenantContext } from '@/lib/tenant/context'

export default async function ImportHistoricalCustomersPage() {
  const supabase = await createAdminClient()
  const { companyId } = await resolveTenantContext(supabase)
  const [schemaReady, productResult] = await Promise.all([
    hasHistoricalCustomerImportSchema(supabase),
    supabase.from('products').select('id,name,internal_code,active').eq('company_id', companyId).order('name').limit(1000),
  ])
  return <div className="grid gap-5">
    <PageHeader eyebrow="Relacionamento · Clientes" title="Importar clientes históricos" subtitle="Revise uma pequena seleção da planilha, consulte CNPJ/IE se necessário e importe sem criar movimentações no funil." />
    <HistoricalCustomerImport products={(productResult.data ?? []) as { id: string; name: string; internal_code: string | null; active: boolean }[]} schemaReady={schemaReady} productSchemaReady={!productResult.error} />
  </div>
}
