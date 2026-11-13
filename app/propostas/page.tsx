import Link from 'next/link'
import { PageHeader, Panel, table, th, td } from '@/components/ui'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasProductCatalogSchema } from '@/lib/product-catalog'
import { hasProposalBrandingSchema, hasProposalPricingSchema } from '@/lib/proposal-schema'
import { resolveTenantContext } from '@/lib/tenant/context'

type SearchParams = Promise<{ q?: string; status?: string }>
type ProposalListItem = { id: string; proposalNumber: string; customerName: string; opportunityId: string | null; status: string; validUntil: string | null; version: number; title: string; total: number | null; monthlyTotal: number; updatedAt: string }
const money = (value: number | string | null | undefined) => value == null ? '—' : Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const statusLabels: Record<string, string> = { draft: 'Rascunho', sent: 'Enviada', accepted: 'Aceita', rejected: 'Recusada', expired: 'Expirada', cancelled: 'Cancelada' }
const statusColors: Record<string, string> = { draft: 'bg-slate-50 text-slate-600', sent: 'bg-blue-50 text-blue-800', accepted: 'bg-emerald-50 text-emerald-800', rejected: 'bg-rose-50 text-rose-800', expired: 'bg-amber-50 text-amber-800', cancelled: 'bg-slate-100 text-slate-500' }

export default async function ProposalsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const supabase = await createAdminClient()
  const { companyId } = await resolveTenantContext(supabase)
  const db = supabase as any
  const [productPricingReady, proposalPricingReady, proposalTemplateReady] = await Promise.all([hasProductCatalogSchema(supabase), hasProposalPricingSchema(supabase), hasProposalBrandingSchema(supabase)])
  const [customersResult, opportunitiesResult, productsResult, proposalsResult] = await Promise.all([
    supabase.from('customers').select('id,person_id,status').eq('company_id', companyId).eq('status', 'active').order('created_at', { ascending: false }).limit(1000),
    supabase.from('opportunities').select('id,person_id,title,status').eq('company_id', companyId).eq('status', 'open').order('updated_at', { ascending: false }).limit(1000),
    db.from('products').select(productPricingReady ? 'id,name,kind,description,reference_price,default_installation_value,default_monthly_value,active' : 'id,name,kind,description,reference_price,active').eq('company_id', companyId).eq('active', true).order('name').limit(2000),
    supabase.from('proposals').select('id,customer_id,opportunity_id,proposal_number,status,valid_until,current_version,created_at,updated_at').eq('company_id', companyId).order('updated_at', { ascending: false }).limit(1000),
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

  const proposalRows = proposalsResult.data ?? []
  const proposalIds = proposalRows.map(row => row.id)
  const versionRows = proposalIds.length ? await db.from('proposal_versions').select(proposalPricingReady ? 'id,proposal_id,version,title,total,monthly_total' : 'id,proposal_id,version,title,total').eq('company_id', companyId).in('proposal_id', proposalIds).order('version', { ascending: false }) : { data: [], error: null }
  const latestVersion = new Map<string, NonNullable<typeof versionRows.data>[number]>()
  for (const version of versionRows.data ?? []) if (!latestVersion.has(version.proposal_id)) latestVersion.set(version.proposal_id, version)
  const customerById = new Map(customers.map(row => [row.id, row]))
  const proposals: ProposalListItem[] = proposalRows.map(row => {
    const version = latestVersion.get(row.id)
    const withMonthly = version as typeof version & { monthly_total?: number | string | null }
    return { id: row.id, proposalNumber: row.proposal_number, customerName: customerById.get(row.customer_id)?.name ?? 'Cliente', opportunityId: row.opportunity_id, status: row.status, validUntil: row.valid_until, version: version?.version ?? row.current_version ?? 0, title: version?.title ?? 'Proposta', total: version?.total == null ? null : Number(version.total), monthlyTotal: Number(withMonthly?.monthly_total ?? 0), updatedAt: row.updated_at }
  })
  const errors = [customersResult.error, opportunitiesResult.error, productsResult.error, proposalsResult.error, peopleResult.error, versionRows.error].filter(Boolean)

  return (
    <div>
      <PageHeader eyebrow="Comercial" title="Propostas" subtitle="Monte propostas versionadas, acompanhe o envio e gere uma versão imprimível para PDF." action="Nova proposta" href="/propostas/novo" />
      {errors.length > 0 && <p role="alert" className="msg-base mt-4 msg-danger">Não foi possível carregar parte do módulo. Confirme se as tabelas de propostas da migration inicial estão disponíveis e se a sessão administrativa está ativa.</p>}
      <Panel title="Propostas" aside={`${proposals.length} registros`}>
        <form method="get" className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1 text-sm font-medium text-ink sm:col-span-1 lg:col-span-2">
            Pesquisar
            <input name="q" defaultValue={params.q} placeholder="Número, cliente ou título" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-blue focus:ring-2 focus:ring-blue/15" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-ink sm:col-span-1 lg:col-span-1">
            Status
            <select name="status" defaultValue={params.status ?? 'all'} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-blue focus:ring-2 focus:ring-blue/15"><option value="all">Todos os status</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          </label>
          <button className="self-end btn-base btn-primary btn-md">Filtrar</button>
        </form>
        {proposals.length === 0 ? <p className="p-6 text-center text-sm text-muted">Nenhuma proposta criada. Cadastre a primeira abaixo.</p> : <div className="overflow-x-auto"><table className={`${table} w-full min-w-[900px]`}>
          <thead>
            <tr>{['Proposta','Cliente','Versão','Valor','Status','Validade','Ações'].map(col => <th key={col} className={th}>{col}</th>)}</tr>
          </thead>
          <tbody>
            {proposals.filter(row => (!params.status || params.status === 'all' || row.status === params.status) && (!params.q || `${row.proposalNumber} ${row.customerName} ${row.title}`.toLocaleLowerCase('pt-BR').includes(params.q.toLocaleLowerCase('pt-BR')))).map(row => <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/50 transition-colors">
              <td className={`${td} font-semibold`}>
                <Link href={`/propostas/${row.id}`} className="font-semibold text-blue hover:underline">{row.proposalNumber}</Link>
                <span className="block text-xs text-muted">{row.title}</span>
              </td>
              <td className={td}>{row.customerName}</td>
              <td className={td}>{row.version || '—'}</td>
              <td className={`${td} text-right`}>
                {money(row.total)}
                {row.monthlyTotal > 0 && <span className="block text-xs text-muted text-right">+ {money(row.monthlyTotal)}/mês</span>}
              </td>
              <td className={td}>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusColors[row.status] ?? statusColors.draft}`}>{statusLabels[row.status] ?? row.status}</span>
              </td>
              <td className={td}>{row.validUntil ? new Date(`${row.validUntil}T00:00:00`).toLocaleDateString('pt-BR') : '—'}</td>
              <td className={`${td} crm-action-group`}>
                <Link href={`/propostas/${row.id}`} className="btn-base btn-secondary btn-sm">Abrir</Link>
              </td>
            </tr>)}
          </tbody>
        </table></div>}
      </Panel>
      {!proposalPricingReady && <p role="alert" className="msg-base mt-4 msg-warning">A separação dos preços depende da migration <strong>202611020002_proposal_recurring_prices.sql</strong>. Aplique-a manualmente para habilitar a criação e edição de propostas com instalação, taxas extras e mensalidade.</p>}
    </div>
  )
}

type ProposalCustomer = { id: string; personId: string; name: string; email: string; phone: string }
type ProposalOpportunity = { id: string; personId: string; title: string; customerName: string; status?: string }
type ProposalProduct = { id: string; name: string; kind: string; description: string; referencePrice: number; installationPrice: number; monthlyPrice: number; active?: boolean }
