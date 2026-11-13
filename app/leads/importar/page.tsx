import { LeadImportWorkspace } from '@/components/lead-import-workspace'
import { createTenantClient } from '@/lib/tenant/authorized-client'

export default async function LeadImportPage() {
  const { supabase, tenant } = await createTenantClient()
  const { data, error } = await supabase.from('products').select('id,name,kind').eq('company_id', tenant.companyId).eq('active', true).order('name')
  return <LeadImportWorkspace products={data ?? []} productLoadError={Boolean(error)} />
}
