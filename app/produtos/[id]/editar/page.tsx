import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { ProductForm, type ProductCatalogItem } from '@/components/product-catalog'
import { PageHeader } from '@/components/ui'
import { hasProductCatalogSchema } from '@/lib/product-catalog'
import { resolveTenantContext, TenantContextError } from '@/lib/tenant/context'

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createAdminClient()
  let tenant: Awaited<ReturnType<typeof resolveTenantContext>>
  try {
    tenant = await resolveTenantContext(supabase)
  } catch (error) {
    if (!(error instanceof TenantContextError)) throw error
    return <p role="alert" className="msg-base msg-danger">{error.message} A edição não foi aberta.</p>
  }
  const schemaReady = await hasProductCatalogSchema(supabase)

  const { id } = await params

  const { data: product } = await supabase.from('products').select('*').eq('id', id).eq('company_id', tenant.companyId).maybeSingle()

  if (!product) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Produto não encontrado</h1>
          <p className="text-slate-600 mb-6">O produto solicitado não existe.</p>
          <Link href="/produtos" className="btn-base btn-primary btn-md">Voltar para produtos</Link>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <Link href="/produtos" className="inline-flex items-center gap-2 text-sm font-semibold text-blue hover:underline">
          ← Voltar para produtos
        </Link>
      </div>
      {!schemaReady && <p role="alert" className="msg-base mt-4 msg-warning">O catálogo está em modo de leitura. Aplique manualmente a migration 202610310006 antes de gravar os novos campos comerciais.</p>}
      <section className="card-base p-5 mb-6">
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-slate-800 mb-1">Editar produto ou serviço</h1>
          <p className="text-sm text-muted">Atualize as informações comerciais do item selecionado.</p>
        </div>
        <ProductForm initial={product as ProductCatalogItem} schemaReady={schemaReady} />
      </section>
    </div>
  )
}
