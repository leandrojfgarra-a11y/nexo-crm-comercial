import Link from 'next/link'
import { PageHeader, Panel, table, th, td } from '@/components/ui'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveTenantContext, TenantContextError } from '@/lib/tenant/context'

type SearchParams = Promise<{ q?: string; status?: string }>
const statuses: Record<string, string> = { draft: 'Rascunho', sent: 'Enviado', awaiting_signature: 'Aguardando assinatura', signed: 'Assinado', active: 'Vigente', closed: 'Encerrado', cancelled: 'Cancelado' }
const colors: Record<string, string> = { draft: 'bg-slate-100 text-slate-700', sent: 'bg-blue-100 text-blue-800', awaiting_signature: 'bg-amber-100 text-amber-800', signed: 'bg-emerald-100 text-emerald-800', active: 'bg-emerald-100 text-emerald-800', closed: 'bg-slate-200 text-slate-700', cancelled: 'bg-rose-100 text-rose-800' }

export default async function ContractsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const supabase = await createAdminClient()
  let tenant: Awaited<ReturnType<typeof resolveTenantContext>>
  try {
    tenant = await resolveTenantContext(supabase)
  } catch (error) {
    if (!(error instanceof TenantContextError)) throw error
    return <div><PageHeader eyebrow="Comercial · Assinaturas" title="Contratos" subtitle="Consulte contratos dos clientes, acompanhe vigência e prepare o envio para assinatura eletrônica." /><p role="alert" className="msg-base mt-4 msg-danger">{error.message} Nenhum contrato foi carregado.</p></div>
  }
  const [contractsResult, customersResult] = await Promise.all([
    supabase.from('customer_contracts').select('id,customer_id,contract_number,title,contract_type,status,signed_at,effective_from,effective_until,contract_value,created_at').eq('company_id', tenant.companyId).order('updated_at', { ascending: false }).limit(1000),
    supabase.from('customers').select('id,person_id').eq('company_id', tenant.companyId).limit(2000),
  ])
  const customerRows = customersResult.data ?? []
  const peopleIds = [...new Set(customerRows.map(row => row.person_id))]
  const peopleResult = peopleIds.length ? await supabase.from('people').select('id,name,trade_name,tax_id').eq('company_id', tenant.companyId).in('id', peopleIds) : { data: [], error: null }
  const people = new Map((peopleResult.data ?? []).map(row => [row.id, row]))
  const customers = new Map(customerRows.map(row => {
    const person = people.get(row.person_id)
    return [row.id, { personId: row.person_id, name: person?.trade_name || person?.name || 'Cliente sem nome', taxId: person?.tax_id ?? '' }] as const
  }))
  const query = (params.q ?? '').trim().toLocaleLowerCase('pt-BR')
  const status = params.status ?? 'all'
  const contracts = (contractsResult.data ?? []).map(row => ({ ...row, customer: customers.get(row.customer_id) })).filter(row => {
    const searchable = `${row.contract_number} ${row.title} ${row.contract_type} ${row.customer?.name ?? ''} ${row.customer?.taxId ?? ''}`.toLocaleLowerCase('pt-BR')
    return (!query || searchable.includes(query)) && (status === 'all' || row.status === status)
  })
  const hasError = Boolean(contractsResult.error || customersResult.error || peopleResult.error)

  return <div>
    <PageHeader eyebrow="Comercial · Assinaturas" title="Contratos" subtitle="Consulte contratos dos clientes, acompanhe vigência e prepare o envio para assinatura eletrônica." />
    {hasError && <p role="alert" className="msg-base mt-4 msg-danger">Não foi possível carregar todos os contratos. Confira se as migrations de contratos e as permissões administrativas estão disponíveis.</p>}
    <Panel title="Contratos cadastrados" aside={`${contracts.length} registros · até 1.000 mais recentes`}>
      <form method="get" className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-[minmax(0,1fr)_240px_auto]">
        <label className="grid gap-1 text-sm font-medium">Pesquisar<input name="q" defaultValue={params.q ?? ''} placeholder="Número, título, cliente ou CNPJ" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink" /></label>
        <label className="grid gap-1 text-sm font-medium">Situação<select name="status" defaultValue={status} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink"><option value="all">Todas</option>{Object.entries(statuses).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <button className="btn-base btn-primary btn-md self-end">Filtrar</button>
      </form>
      {!contracts.length ? <div className="grid gap-2 p-8 text-center"><p className="text-sm text-muted">Nenhum contrato encontrado.</p><Link href="/clientes" className="text-sm font-semibold text-blue hover:underline">Abrir clientes para cadastrar ou consultar contratos</Link></div> : <div className="overflow-x-auto"><table className={`${table} min-w-[950px]`}><thead><tr>{['Contrato','Cliente','Tipo','Situação','Vigência','Valor','Ações'].map(label => <th className={th} key={label}>{label}</th>)}</tr></thead><tbody>{contracts.map(row => <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/60"><td className={`${td} font-semibold`}><span>{row.contract_number}</span><span className="block text-xs font-normal text-muted">{row.title}</span></td><td className={td}>{row.customer?.name ?? 'Cliente indisponível'}<span className="block text-xs text-muted">{row.customer?.taxId || 'Sem documento'}</span></td><td className={td}>{row.contract_type}</td><td className={td}><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${colors[row.status] ?? colors.draft}`}>{statuses[row.status] ?? row.status}</span></td><td className={td}>{row.effective_from ? new Date(`${row.effective_from}T00:00:00`).toLocaleDateString('pt-BR') : '—'} – {row.effective_until ? new Date(`${row.effective_until}T00:00:00`).toLocaleDateString('pt-BR') : '—'}</td><td className={td}>{row.contract_value == null ? '—' : Number(row.contract_value).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</td><td className={td}><Link className="btn-base btn-secondary btn-sm" href={`/clientes/${row.customer_id}?tab=contracts#contracts`}>Abrir contrato</Link></td></tr>)}</tbody></table></div>}
    </Panel>
    <p className="mt-4 text-xs text-muted">O arquivo e o histórico permanecem na ficha do cliente. O envio à Clicksign exige credencial de servidor, a migration incremental e confirmação do responsável pelo envio.</p>
  </div>
}
