import { SellerCatalog, type SellerCatalogItem } from '@/components/seller-catalog'
import { PageHeader } from '@/components/ui'
import { SALES_FUNNEL_PIPELINE_ID } from '@/lib/sales-funnel'
import { hasSellerCommercialSchema, hasSellerInstallationGoalSchema } from '@/lib/seller-schema'
import { createTenantClient } from '@/lib/tenant/authorized-client'

export default async function SellersPage() {
  const { supabase, tenant } = await createTenantClient()
  const schemaReady = await hasSellerCommercialSchema(supabase)
  const installationGoalSchemaReady = await hasSellerInstallationGoalSchema(supabase)
  const columns = schemaReady
    ? `id,name,email,phone,active,seller_type,user_id,installation_commission_percent,monthly_commission_percent,monthly_commission_mode,monthly_commission_competencies${installationGoalSchemaReady ? ',monthly_installation_goal_count' : ''}`
    : 'id,name,email,phone,active'
  const { data, error } = await supabase.from('sellers').select(columns).eq('company_id', tenant.companyId).order('name').limit(2000)
  const sellers = (data ?? []) as unknown as SellerCatalogItem[]
  let opportunityCountError = ''
  if (schemaReady && sellers.length) {
    const counts = await Promise.all(sellers.map(seller => supabase.from('opportunities')
      .select('id', { count: 'exact', head: true }).eq('company_id', tenant.companyId)
      .eq('pipeline_id', SALES_FUNNEL_PIPELINE_ID).eq('seller_id', seller.id).eq('status', 'open')))
    if (counts.some(result => result.error)) opportunityCountError = counts.find(result => result.error)?.error?.message ?? 'Erro de consulta.'
    else for (let index=0; index<sellers.length; index++) sellers[index].openOpportunityCount = counts[index].count ?? 0
  }
  return <>
    <PageHeader eyebrow="Equipe comercial" title="Vendedores" subtitle="Cadastre responsáveis, contatos e regras individuais de comissão futura." action="Novo vendedor" href="#cadastro" />
    {!schemaReady && <p role="alert" className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Cadastro em modo de leitura. Aplique manualmente a migration 202610310007 para liberar os campos comerciais.</p>}
    <SellerCatalog sellers={sellers} schemaReady={schemaReady} installationGoalSchemaReady={installationGoalSchemaReady} loadError={error ? `Falha ao consultar vendedores: ${error.message}` : null} opportunityCountError={opportunityCountError || null} />
  </>
}
