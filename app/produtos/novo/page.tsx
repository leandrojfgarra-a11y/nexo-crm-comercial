import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { ProductForm } from '@/components/product-catalog'
import { hasProductCatalogSchema } from '@/lib/product-catalog'
import { resolveTenantContext, TenantContextError } from '@/lib/tenant/context'

export default async function NewProductPage() {
  const supabase = await createAdminClient()
  try {
    await resolveTenantContext(supabase)
  } catch (error) {
    if (!(error instanceof TenantContextError)) throw error
    return <p role="alert" className="msg-base msg-danger">{error.message} O cadastro de produtos não foi aberto.</p>
  }
  const schemaReady = await hasProductCatalogSchema(supabase)
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <Link href="/produtos" className="inline-flex items-center gap-2 text-sm font-semibold text-blue hover:underline">
          ← Voltar para produtos
        </Link>
      </div>
      {!schemaReady && <p role="alert" className="msg-base mt-4 msg-warning">O catálogo está em modo de leitura. Aplique manualmente a migration 202610310006 antes de gravar os novos campos comerciais.</p>}
      <ProductForm initial={{}} schemaReady={schemaReady} />
    </div>
  )
}
