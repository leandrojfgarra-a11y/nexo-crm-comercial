import { notFound } from 'next/navigation'
import { ProposalDetail, type ProposalDetailData } from '@/components/proposal-detail'
import type { ProposalCustomer, ProposalDraftItem, ProposalOpportunity, ProposalProduct } from '@/components/proposal-editor'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasProductCatalogSchema } from '@/lib/product-catalog'
import { hasProposalBrandingSchema, hasProposalPricingSchema } from '@/lib/proposal-schema'
import { resolveTenantContext } from '@/lib/tenant/context'

export default async function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createAdminClient()
  const { companyId } = await resolveTenantContext(supabase)
  const db = supabase as any
  const { data: proposal, error } = await supabase.from('proposals').select('id,customer_id,opportunity_id,proposal_number,status,valid_until,current_version').eq('id', id).eq('company_id', companyId).maybeSingle()
  if (error || !proposal || !proposal.current_version) notFound()
  const [pricingReady, templateReady] = await Promise.all([hasProposalPricingSchema(supabase), hasProposalBrandingSchema(supabase)])
  const versionColumns = ['id','proposal_id','version','title','terms','currency','subtotal','discount','total','created_at','sent_at', ...(pricingReady ? ['monthly_total'] : []), ...(templateReady ? ['brand_name','brand_tagline','logo_url','intro_text','first_billing_date','consultant_name','consultant_phone','consultant_email','consultant_city'] : [])].join(',')
  const [{ data: customerRow }, { data: versions }, { data: links }, { data: acceptances }] = await Promise.all([
    supabase.from('customers').select('id,person_id').eq('company_id', companyId).eq('id', proposal.customer_id).maybeSingle(),
    db.from('proposal_versions').select(versionColumns).eq('company_id', companyId).eq('proposal_id', id).order('version', { ascending: false }),
    supabase.from('proposal_links').select('expires_at').eq('company_id', companyId).eq('proposal_id', id).is('revoked_at', null).gt('expires_at', new Date().toISOString()).order('expires_at', { ascending: false }).limit(1),
    supabase.from('proposal_acceptances').select('id,version_id,status,declared_name,declared_email,declared_at,reviewed_at').eq('company_id', companyId).eq('proposal_id', id).order('declared_at', { ascending: false }).limit(100),
  ])
  if (!customerRow || !versions?.length) notFound()
  const productPricingReady = await hasProductCatalogSchema(supabase)
  const [{ data: person }, { data: opportunityRows }, { data: productRows }, { data: acceptanceVersions }] = await Promise.all([
    supabase.from('people').select('id,name,trade_name,email,phone').eq('company_id', companyId).eq('id', customerRow.person_id).maybeSingle(),
    supabase.from('opportunities').select('id,person_id,title,status').eq('company_id', companyId).eq('person_id', customerRow.person_id).order('updated_at', { ascending: false }),
    db.from('products').select(productPricingReady ? 'id,name,kind,description,reference_price,default_installation_value,default_monthly_value,active' : 'id,name,kind,description,reference_price,active').eq('company_id', companyId).order('name'),
    acceptances?.length ? supabase.from('proposal_versions').select('id,version').eq('company_id', companyId).in('id', acceptances.map(row => row.version_id)) : Promise.resolve({ data: [], error: null }),
  ])
  if (!person) notFound()
  const customer: ProposalCustomer = { id: customerRow.id, personId: customerRow.person_id, name: person.trade_name || person.name, email: person.email ?? '', phone: person.phone ?? '' }
  const products: ProposalProduct[] = (productRows ?? []).map((row: any) => {
    const pricing = row as typeof row & { default_installation_value?: number | string | null; default_monthly_value?: number | string | null }
    const referencePrice = Number(pricing.reference_price ?? 0)
    return { id: pricing.id, name: pricing.name, kind: pricing.kind, description: pricing.description ?? '', referencePrice, installationPrice: Number(pricing.default_installation_value ?? referencePrice), monthlyPrice: Number(pricing.default_monthly_value ?? 0), active: pricing.active }
  })
  const opportunities: ProposalOpportunity[] = (opportunityRows ?? []).map(row => ({ id: row.id, personId: row.person_id, title: row.title, customerName: customer.name, status: row.status }))
  const currentVersion = versions.find((row: any) => row.version === proposal.current_version)
  if (!currentVersion) notFound()
  const itemColumns = ['product_id','description','quantity','unit_price','line_total','position', ...(pricingReady ? ['installation_unit_price','extra_description','extra_unit_price','monthly_unit_price'] : []), ...(templateReady ? ['optional'] : [])].join(',')
  const { data: itemRows } = await db.from('proposal_items').select(itemColumns).eq('company_id', companyId).eq('version_id', currentVersion.id).order('position')
  const currentItems: ProposalDraftItem[] = (itemRows ?? []).map((row: any) => {
    const pricing = row as typeof row & { installation_unit_price?: number | string | null; extra_description?: string | null; extra_unit_price?: number | string | null; monthly_unit_price?: number | string | null }
    return { productId: pricing.product_id ?? '', description: pricing.description, quantity: String(pricing.quantity), installationPrice: String(pricing.installation_unit_price ?? pricing.unit_price), extraDescription: pricing.extra_description ?? '', extraPrice: String(pricing.extra_unit_price ?? 0), monthlyPrice: String(pricing.monthly_unit_price ?? 0), optional: Boolean(pricing.optional) }
  })
  const versionById = new Map((acceptanceVersions ?? []).map(row => [row.id, row.version]))
  const data: ProposalDetailData = {
    proposal: { id: proposal.id, proposalNumber: proposal.proposal_number, status: proposal.status, validUntil: proposal.valid_until, currentVersion: proposal.current_version, customerId: proposal.customer_id, opportunityId: proposal.opportunity_id },
    customer,
    current: { customerId: customer.id, opportunityId: proposal.opportunity_id ?? '', versionId: currentVersion.id, version: currentVersion.version, title: currentVersion.title, terms: currentVersion.terms ?? '', currency: currentVersion.currency, subtotal: Number(currentVersion.subtotal), discount: String(currentVersion.discount), total: Number(currentVersion.total), monthlyTotal: Number((currentVersion as typeof currentVersion & { monthly_total?: number | string | null }).monthly_total ?? 0), validUntil: proposal.valid_until ?? '', createdAt: currentVersion.created_at, sentAt: currentVersion.sent_at, items: currentItems, brandName: currentVersion.brand_name ?? '', brandTagline: currentVersion.brand_tagline ?? '', logoUrl: currentVersion.logo_url ?? '', introText: currentVersion.intro_text ?? '', firstBillingDate: currentVersion.first_billing_date ?? '', consultantName: currentVersion.consultant_name ?? '', consultantPhone: currentVersion.consultant_phone ?? '', consultantEmail: currentVersion.consultant_email ?? '', consultantCity: currentVersion.consultant_city ?? '' },
    versions: versions.map((row: any) => ({ version: row.version, title: row.title, total: Number(row.total), monthlyTotal: Number(row.monthly_total ?? 0), createdAt: row.created_at, sentAt: row.sent_at })),
    acceptances: (acceptances ?? []).map(row => ({ id: row.id, version: versionById.get(row.version_id) ?? 0, status: row.status, declaredName: row.declared_name, declaredEmail: row.declared_email, declaredAt: row.declared_at, reviewedAt: row.reviewed_at })),
    activeLinkExpiry: links?.[0]?.expires_at ?? null, opportunities, products, pricingReady, templateReady,
  }
  return <ProposalDetail data={data} />
}
