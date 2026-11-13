import Link from 'next/link'
import { PageHeader } from '@/components/ui'
import { ProductCatalog, type ProductCatalogItem } from '@/components/product-catalog'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasProductCatalogSchema } from '@/lib/product-catalog'
import { resolveTenantContext, TenantContextError } from '@/lib/tenant/context'

export default async function ProductsPage() {
  const supabase = await createAdminClient()
  let tenant: Awaited<ReturnType<typeof resolveTenantContext>>
  try {
    tenant = await resolveTenantContext(supabase)
  } catch (error) {
    if (!(error instanceof TenantContextError)) throw error
    return (
      <div>
        <PageHeader eyebrow="Catálogo comercial" title="Produtos e serviços" subtitle="Cadastre itens reutilizáveis nas oportunidades, propostas e leads." action="Novo item" href="/produtos/novo" />
        <p role="alert" className="msg-base mt-4 msg-danger">{error.message} Nenhum produto foi carregado.</p>
      </div>
    )
  }
  const schemaReady = await hasProductCatalogSchema(supabase)
  const columns = schemaReady
    ? 'id,name,internal_code,kind,commercial_category,description,default_installation_value,default_monthly_value,reference_price,standard_cost,billing_mode,active,created_at'
    : 'id,name,kind,description,reference_price,active,created_at'
  const { data, error } = await supabase.from('products').select(columns).eq('company_id', tenant.companyId).order('name').limit(2000)
  const items = (data ?? []) as unknown as ProductCatalogItem[]
  return (
    <div>
      <PageHeader eyebrow="Catálogo comercial" title="Produtos e serviços" subtitle="Cadastre itens reutilizáveis nas oportunidades, propostas e leads." action="Novo item" href="/produtos/novo" />
      {!schemaReady && <div role="alert" className="msg-base mt-4 msg-warning">O catálogo está em modo de leitura. Aplique manualmente a migration 202610310006 antes de gravar os novos campos comerciais.</div>}
      <ProductCatalog products={items} schemaReady={schemaReady} loadError={error ? `Falha ao consultar o catálogo: ${error.message}` : null} />
    </div>
  )
}
