import Link from 'next/link'
import { ProposalsWorkspace, type ProposalCustomer, type ProposalOpportunity, type ProposalProduct } from '@/components/proposal-editor'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasProductCatalogSchema } from '@/lib/product-catalog'
import { hasProposalBrandingSchema, hasProposalPricingSchema } from '@/lib/proposal-schema'
import { resolveTenantContext } from '@/lib/tenant/context'

export default async function NewProposalPage() {
  const supabase = await createAdminClient()
  const { companyId } = await resolveTenantContext(supabase)
  const db = supabase as any
  const [productPricingReady, proposalPricingReady, proposalTemplateReady] = await Promise.all([hasProductCatalogSchema(supabase), hasProposalPricingSchema(supabase), hasProposalBrandingSchema(supabase)])
  const [customersResult, opportunitiesResult, productsResult] = await Promise.all([
    supabase.from('customers').select('id,person_id,status').eq('company_id', companyId).eq('status', 'active').order('created_at', { ascending: false }).limit(1000),
    supabase.from('opportunities').select('id,person_id,title,status').eq('company_id', companyId).eq('status', 'open').order('updated_at', { ascending: false }).limit(1000),
    db.from('products').select(productPricingReady ? 'id,name,kind,description,reference_price,default_installation_value,default_monthly_value,active' : 'id,name,kind,description,reference_price,active').eq('company_id', companyId).eq('active', true).order('name').limit(2000),
  ])

  const customerRows = customersResult.data ?? []
  const peopleIds = [...new Set([...customerRows.map(row => row.person_id), ...(opportunitiesResult.data ?? []).map(row => row.person_id)])]
  const peopleResult = peopleIds.length
    ? await supabase.from('people').select('id,name,trade_name,email,phone').eq('company_id', companyId).in('id', peopleIds)
    : { data: [], error: null }
  const people = new Map((peopleResult.data ?? []).map(row => [row.id, row]))
  const customers: ProposalCustomer[] = customerRows.map(row => {
    const person = people.get(row.person_id)
    return { id: row.id, personId: row.person_id, name: person?.trade_name || person?.name || 'Cliente sem nome', email: person?.email ?? '', phone: person?.phone ?? '' }
  })
  const customerByPerson = new Map(customers.map(row => [row.personId, row]))
  const opportunities: ProposalOpportunity[] = (opportunitiesResult.data ?? []).flatMap(row => {
    const customer = customerByPerson.get(row.person_id)
    return customer ? [{ id: row.id, personId: row.person_id, title: row.title, customerName: customer.name }] : []
  })
  const products: ProposalProduct[] = (productsResult.data ?? []).map((row: any) => {
    const pricing = row as typeof row & { default_installation_value?: number | string | null; default_monthly_value?: number | string | null }
    const referencePrice = Number(pricing.reference_price ?? 0)
    return { id: pricing.id, name: pricing.name, kind: pricing.kind, description: pricing.description ?? '', referencePrice, installationPrice: Number(pricing.default_installation_value ?? referencePrice), monthlyPrice: Number(pricing.default_monthly_value ?? 0) }
  })

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <Link href="/propostas" className="inline-flex items-center gap-2 text-sm font-semibold text-blue hover:underline">
          ← Voltar para propostas
        </Link>
      </div>
      {!proposalPricingReady && <p role="alert" className="msg-base mb-4 msg-warning">A separação dos preços depende da migration <strong>202611020002_proposal_recurring_prices.sql</strong>. Aplique-a manualmente para habilitar a criação e edição de propostas com instalação, taxas extras e mensalidade.</p>}
      {!proposalTemplateReady && <p role="alert" className="msg-base mb-4 msg-warning">O modelo com logotipo, dados comerciais e backup opcional depende da migration <strong>202611050002_proposal_branding_and_backup.sql</strong>. O SQL está preparado para aplicação manual.</p>}
      <ProposalsWorkspace customers={customers} opportunities={opportunities} products={products} pricingReady={proposalPricingReady} templateReady={proposalTemplateReady} />
    </div>
  )
}
