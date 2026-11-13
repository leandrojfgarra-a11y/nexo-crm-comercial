import { PageHeader, Card, Panel, EmptyRows, table, th, td } from '@/components/ui'
import { createTenantClient } from '@/lib/tenant/authorized-client'
import { hasSellerInstallationGoalSchema } from '@/lib/seller-schema'

type SearchParams = Promise<{ month?: string; seller?: string }>
type Seller = {
  id: string
  name: string
  active: boolean | null
  installation_commission_percent: number | string | null
  monthly_commission_percent: number | string | null
  monthly_commission_mode: 'none' | 'single' | 'recurring' | null
  monthly_commission_competencies: number | null
  monthly_installation_goal_count?: number | null
}
type Sale = {
  id: string
  opportunity_id: string
  seller_id: string | null
  seller_name_snapshot: string | null
  effective_closed_at: string
  cycle_number: number
  installation_value: number | string | null
  monthly_value: number | string | null
  commercial_snapshot: Record<string, unknown> | null
}

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/
const amount = (value: unknown) => {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}
const cents = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100
const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
const monthInSaoPaulo = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).formatToParts(date)
  return `${parts.find(part => part.type === 'year')?.value}-${parts.find(part => part.type === 'month')?.value}`
}
const monthKeyInSaoPaulo = (timestamp: string) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).formatToParts(new Date(timestamp))
  return `${parts.find(part => part.type === 'year')?.value}-${parts.find(part => part.type === 'month')?.value}`
}
const monthIndex = (month: string) => {
  const [year, number] = month.split('-').map(Number)
  return year * 12 + number - 1
}
const monthLabel = (month: string) => new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`))
const dateLabel = (value: string) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(value))

export default async function CommissionsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const month = monthPattern.test(params.month ?? '') ? params.month! : monthInSaoPaulo(new Date())
  const sellerId = params.seller ?? ''
  const [year, monthNumber] = month.split('-').map(Number)
  // As regras permitem até 120 competências. Busca esse horizonte para projetar
  // recorrências ainda vigentes, além das vendas fechadas na competência atual.
  const earliest = new Date(Date.UTC(year, monthNumber - 1 - 120, 1, 3)).toISOString()
  const end = new Date(Date.UTC(year, monthNumber, 1, 3)).toISOString()
  const { supabase, tenant } = await createTenantClient()
  const companyId = tenant.companyId
  const installationGoalSchemaReady = await hasSellerInstallationGoalSchema(supabase)

  const salesQuery = supabase.from('active_closed_sales')
    .select('id,opportunity_id,seller_id,seller_name_snapshot,effective_closed_at,cycle_number,installation_value,monthly_value,commercial_snapshot')
    .gte('effective_closed_at', earliest).lt('effective_closed_at', end)
    .order('effective_closed_at', { ascending: false }).limit(5000)
  const sellersQuery = installationGoalSchemaReady
    ? supabase.from('sellers')
      .select('id,name,active,installation_commission_percent,monthly_commission_percent,monthly_commission_mode,monthly_commission_competencies,monthly_installation_goal_count')
      .eq('company_id', companyId).order('name').limit(2000)
    : supabase.from('sellers')
      .select('id,name,active,installation_commission_percent,monthly_commission_percent,monthly_commission_mode,monthly_commission_competencies')
      .eq('company_id', companyId).order('name').limit(2000)
  const [salesResult, sellersResult] = await Promise.all([salesQuery, sellersQuery])

  const closedSales = (salesResult.data ?? []) as unknown as Sale[]
  const opportunityIds = [...new Set(closedSales.map(sale => sale.opportunity_id))]
  let currentOpportunityRows: { id: string; seller_id: string | null; installation_value: number | string | null; monthly_value: number | string | null }[] = []
  let currentOpportunityError: string | null = null
  for (let offset = 0; offset < opportunityIds.length; offset += 500) {
    const ids = opportunityIds.slice(offset, offset + 500)
    const result = await supabase.from('opportunities')
      .select('id,seller_id,installation_value,monthly_value')
      .eq('company_id', companyId).in('id', ids).eq('status', 'won')
    if (result.error) {
      currentOpportunityError = result.error.message
      break
    }
    currentOpportunityRows.push(...(result.data ?? []))
  }
  const currentOpportunityById = new Map(currentOpportunityRows.map(opportunity => [opportunity.id, opportunity]))
  const sales = closedSales.map(sale => {
    const current = currentOpportunityById.get(sale.opportunity_id)
    if (!current) return sale
    const currentSeller = current.seller_id ? sellersResult.data?.find(seller => seller.id === current.seller_id) : null
    return {
      ...sale,
      seller_id: current.seller_id,
      seller_name_snapshot: currentSeller?.name ?? (current.seller_id ? sale.seller_name_snapshot : null),
      installation_value: current.installation_value,
      monthly_value: current.monthly_value,
    }
  })
  const sellers = (sellersResult.data ?? []) as unknown as Seller[]
  const sellerMap = new Map(sellers.map(seller => [seller.id, seller]))
  const filteredSales = sellerId ? sales.filter(sale => sale.seller_id === sellerId) : sales
  const rows = filteredSales.map(sale => {
    const rule = sale.seller_id ? sellerMap.get(sale.seller_id) : undefined
    const installation = amount(sale.installation_value)
    const monthly = amount(sale.monthly_value)
    const installationPercent = amount(rule?.installation_commission_percent)
    const monthlyPercent = amount(rule?.monthly_commission_percent)
    const competencies = rule?.monthly_commission_mode === 'recurring'
      ? Math.max(1, Number(rule.monthly_commission_competencies ?? 1)) : 1
    const installationCommission = cents(installation * installationPercent / 100)
    const saleMonth = monthKeyInSaoPaulo(sale.effective_closed_at)
    const elapsedCompetencies = monthIndex(month) - monthIndex(saleMonth)
    const monthlyCommission = rule?.monthly_commission_mode !== 'none' && elapsedCompetencies >= 0 && elapsedCompetencies < competencies
      ? cents(monthly * monthlyPercent / 100) : 0
    const installationInPeriod = saleMonth === month ? installationCommission : 0
    const snapshot = sale.commercial_snapshot ?? {}
    const customer = String(snapshot.customer_trade_name || snapshot.customer_name || 'Cliente sem identificação')
    const opportunity = String(snapshot.title || 'Venda concluída')
    const grossCommission = cents(installationInPeriod + monthlyCommission)
    const taxCommission = cents(grossCommission * 0.12)
    return { sale, rule, customer, opportunity, installation, monthly, installationPercent, monthlyPercent, competencies, elapsedCompetencies, installationCommission: installationInPeriod, monthlyCommission, grossCommission, taxCommission, netCommission: cents(grossCommission - taxCommission) }
  }).filter(row => row.installationCommission > 0 || row.monthlyCommission > 0)
  const installationTotal = cents(rows.reduce((sum, row) => sum + row.installationCommission, 0))
  const monthlyTotal = cents(rows.reduce((sum, row) => sum + row.monthlyCommission, 0))
  const grossTotal = cents(rows.reduce((sum, row) => sum + row.grossCommission, 0))
  const taxWithholding = cents(rows.reduce((sum, row) => sum + row.taxCommission, 0))
  const netTotal = cents(rows.reduce((sum, row) => sum + row.netCommission, 0))
  const installationSales = sales.filter(sale => monthKeyInSaoPaulo(sale.effective_closed_at) === month && amount(sale.installation_value) > 0)
  const installationCounts = new Map<string, number>()
  for (const sale of installationSales) if (sale.seller_id) installationCounts.set(sale.seller_id, (installationCounts.get(sale.seller_id) ?? 0) + 1)
  const sellerProgress = sellers
    .filter(seller => !sellerId || seller.id === sellerId)
    .map(seller => {
      const target = Number(seller.monthly_installation_goal_count ?? 0)
      const achieved = installationCounts.get(seller.id) ?? 0
      const sellerRows = rows.filter(row => row.sale.seller_id === seller.id)
      const gross = cents(sellerRows.reduce((sum, row) => sum + row.grossCommission, 0))
      const tax = cents(sellerRows.reduce((sum, row) => sum + row.taxCommission, 0))
      const net = cents(sellerRows.reduce((sum, row) => sum + row.netCommission, 0))
      return { seller, target, achieved, percent: target > 0 ? Math.min(100, Math.round(achieved / target * 100)) : null, gross, tax, net }
    })
  const loadError = salesResult.error
    ? 'Não foi possível consultar vendas WON. Confirme se a migration 009 e a view active_closed_sales estão disponíveis.'
    : currentOpportunityError
      ? 'Não foi possível atualizar os valores atuais dos cards WON para calcular as comissões.'
    : sellersResult.error
      ? 'Não foi possível consultar as regras de comissão dos vendedores. Confirme se a migration 007 está disponível.'
      : null

  return <>
    <PageHeader eyebrow="Planejamento comercial" title="Comissões" subtitle={`Previsão da competência ${monthLabel(month)}, considerando vendas WON vigentes e recorrências configuradas.`} />

    <form method="get" className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-surface p-4">
      <label className="grid gap-1 text-sm font-medium">Competência da comissão
        <input type="month" name="month" defaultValue={month} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </label>
      <label className="grid min-w-52 gap-1 text-sm font-medium">Vendedor
        <select name="seller" defaultValue={sellerId} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="">Todos os vendedores</option>
          {sellers.map(seller => <option key={seller.id} value={seller.id}>{seller.name}{seller.active === false ? ' (inativo)' : ''}</option>)}
        </select>
      </label>
      <button className="btn-base btn-primary btn-md">Aplicar filtros</button>
      <span className="text-sm text-muted">Cálculo previsto sobre valores contratados, sem conciliação de pagamentos.</span>
    </form>

    {loadError && <p role="alert" className="msg-warning mb-5 rounded-lg border p-4 text-sm">{loadError}</p>}
    {!installationGoalSchemaReady && <p role="status" className="msg-base msg-warning mb-5">A meta mensal por vendedor será exibida após aplicar a migration 202611100001_seller_installation_goal_and_net_commission.sql.</p>}
    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      <Card compact label="Comissão bruta" value={loadError ? '—' : money(grossTotal)} detail="Instalações + mensalidades" accent="bg-blue" />
      <Card compact label="Retenção (12%)" value={loadError ? '—' : money(taxWithholding)} detail="Desconto sobre comissão bruta" accent="bg-amber-500" />
      <Card compact label="Líquido a receber" value={loadError ? '—' : money(netTotal)} detail="Após retenção informada de 12%" accent="bg-emerald-500" />
      <Card compact label="Comissão de instalação" value={loadError ? '—' : money(installationTotal)} detail="Vendas WON do mês" accent="bg-cyan" />
      <Card compact label="Comissão mensal" value={loadError ? '—' : money(monthlyTotal)} detail="Mensalidades elegíveis" accent="bg-violet-500" />
      <Card compact label="Vendas com comissão" value={loadError ? '—' : String(rows.length)} detail="Fechamentos ou recorrências" accent="bg-indigo-500" />
    </div>

    <Panel title="Meta mensal de instalações por vendedor" aside={`${installationSales.filter(sale => !sellerId || sale.seller_id === sellerId).length} instalação(ões) WON na competência`}>
      {!installationGoalSchemaReady ? <p className="p-5 text-sm text-muted">Aplique a migration indicada acima para habilitar as metas mensais por vendedor.</p> : sellerProgress.length === 0 ? <p className="p-5 text-sm text-muted">Nenhuma meta cadastrada ou instalação WON para este filtro.</p> : (
        <div className="overflow-x-auto"><table className={table}>
          <thead><tr><th className={th}>VENDEDOR</th><th className={th}>META</th><th className={th}>REALIZADO</th><th className={th}>ATINGIMENTO</th><th className={th}>COMISSÃO BRUTA</th><th className={th}>RETENÇÃO 12%</th><th className={th}>LÍQUIDO</th></tr></thead>
          <tbody>{sellerProgress.map(({seller,target,achieved,percent,gross,tax,net}) => <tr key={seller.id}>
            <td className={`${td} font-semibold`}>{seller.name}</td><td className={td}>{target > 0 ? `${target} instalação(ões)` : 'Não definida'}</td><td className={td}>{achieved}</td>
            <td className={td}>{percent === null ? 'Meta não definida' : <><span>{percent}%</span><div className="mt-1 h-2 w-28 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue" style={{width:`${percent}%`}} /></div></>}</td>
            <td className={td}>{money(gross)}</td><td className={td}>{money(tax)}</td><td className={`${td} font-bold`}>{money(net)}</td>
          </tr>)}</tbody>
        </table></div>
      )}
      <p className="border-t border-slate-100 px-5 py-3 text-xs text-muted">O realizado conta vendas WON vigentes fechadas no mês com valor de instalação maior que zero. O líquido aplica 12% sobre a comissão bruta prevista.</p>
    </Panel>

    <div className="mt-5"><Panel title="Detalhamento das comissões previstas" aside={`${rows.length} venda(s)`}>
      <div className="overflow-x-auto">
        <table className={table}>
          <thead><tr>
            <th className={th}>CLIENTE / OPORTUNIDADE</th><th className={th}>VENDEDOR</th><th className={th}>FECHAMENTO</th>
            <th className={th}>INSTALAÇÃO</th><th className={th}>COMISSÃO INSTALAÇÃO NESTE MÊS</th><th className={th}>MENSALIDADE</th>
            <th className={th}>COMISSÃO MENSAL NESTE MÊS</th><th className={th}>BRUTO · RETENÇÃO · LÍQUIDO</th>
          </tr></thead>
          <tbody>
            {loadError ? <EmptyRows columns={8} message={loadError} /> : rows.length === 0 ? <EmptyRows columns={8} message="Nenhuma venda WON vigente encontrada neste período e filtro." /> : rows.map(({ sale, rule, customer, opportunity, installation, monthly, installationPercent, monthlyPercent, competencies, elapsedCompetencies, installationCommission, monthlyCommission, grossCommission, taxCommission, netCommission }) => (
              <tr key={`${sale.id}-${sale.cycle_number}`}>
                <td className={td}><p className="font-semibold">{customer}</p><p className="mt-1 text-xs text-muted">{opportunity}</p></td>
                <td className={td}>{sale.seller_name_snapshot || rule?.name || 'Sem vendedor'}<p className="mt-1 text-xs text-muted">{rule ? `${installationPercent}% instalação · ${monthlyPercent}% mensal` : 'Sem regra cadastrada'}</p></td>
                <td className={td}>{dateLabel(sale.effective_closed_at)}</td>
                <td className={td}>{money(installation)}</td>
                <td className={td}>{money(installationCommission)}</td>
                <td className={td}>{money(monthly)}</td>
                <td className={td}>{money(monthlyCommission)}<p className="mt-1 text-xs text-muted">Competência {elapsedCompetencies + 1} de {competencies}</p></td>
                <td className={`${td} font-bold`}><div>{money(grossCommission)}</div><div className="mt-1 text-xs font-normal text-muted">− {money(taxCommission)} · 12%</div><div className="mt-1 text-emerald-700">{money(netCommission)}</div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-slate-100 px-5 py-3 text-xs text-muted">Comissão de instalação aparece na competência do fechamento. Comissão mensal considera a mensalidade contratada da venda desde o mês do WON, até a quantidade de competências cadastrada no vendedor. O líquido aplica retenção fixa de 12% sobre o total bruto. As regras atuais do vendedor também são aplicadas às vendas antigas; o CRM não controla liquidação de pagamentos.</p>
    </Panel></div>
  </>
}
