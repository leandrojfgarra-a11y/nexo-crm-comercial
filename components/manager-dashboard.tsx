import { Panel } from '@/components/ui'
import Link from 'next/link'

export type ManagerChartPoint = { label: string; value: number; detail?: string }
export type SellerResult = { label: string; count: number; installation: number; monthly: number }
export type GoalProgress = { id: string; label: string; planned: number; realized: number; remaining: number; percent: number; type: string }
export type DashboardMetrics = {
  opportunities: { open: number; won: number; lost: number; cancelled: number; inNegotiation: number; negotiatedInstallation: number; negotiatedMonthly: number }
  proposals: { analysis: number; accepted: number; rejected: number }
  sales: { count: number; installation: number; monthly: number }
  commissions: { installation: number; monthly: number; available: boolean }
}
export type DashboardAvailability = { opportunities: boolean; proposals: boolean; sales: boolean; items: boolean; goals: boolean; commissions: boolean }

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const hasData = (points: ManagerChartPoint[]) => points.some(p => p.value > 0)

export function ManagerDashboard({ metrics, weekly, monthly, sellers, products, goals, errors, available, sellerFiltered }: {
  rangeLabel: string
  metrics: DashboardMetrics
  weekly: ManagerChartPoint[]
  monthly: ManagerChartPoint[]
  sellers: SellerResult[]
  products: ManagerChartPoint[]
  goals: GoalProgress[]
  errors: string[]
  available: DashboardAvailability
  sellerFiltered: boolean
}) {
  const statusPoints = [
    { label: 'Abertas no período', value: metrics.opportunities.open },
    { label: 'Ganhas', value: metrics.opportunities.won },
    { label: 'Perdidas', value: metrics.opportunities.lost },
    { label: 'Canceladas', value: metrics.opportunities.cancelled },
  ]

  return (
    <div className="space-y-5">
      {/* Mensagens de erro */}
      {errors.map(error => <p key={error} role="alert" className="msg-base msg-danger">{error}</p>)}

      {/* Indicadores principais */}
      <section aria-label="Indicadores principais" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <MetricTile label="Vendas WON" value={available.sales ? String(metrics.sales.count) : '—'} detail="Fechamentos vigentes no período" accent="border-l-emerald-500" />
        <MetricTile label="Em negociação" value={available.opportunities ? String(metrics.opportunities.inNegotiation) : '—'} detail="Oportunidades abertas agora" accent="border-l-cyan-500" />
        <MetricTile label="Implantação WON" value={available.sales ? money(metrics.sales.installation) : '—'} detail="Total vigente fechado" accent="border-l-blue-500" />
        <MetricTile label="Mensalidade WON" value={available.sales ? money(metrics.sales.monthly) : '—'} detail="Recorrência vigente fechada" accent="border-l-violet-500" />
        <MetricTile label="Propostas aceitas" value={available.proposals ? String(metrics.proposals.accepted) : '—'} detail="Aceitas no período" accent="border-l-emerald-500" />
      </section>

      {/* Gráficos comerciais */}
      <section aria-label="Gráficos comerciais" className="grid gap-4 lg:grid-cols-2">
        <div className="lg:col-span-2"><Chart title="Vendas WON · últimos meses" points={monthly} unavailable={!available.sales} empty={!hasData(monthly)} /></div>
        <div className="lg:col-span-1"><Chart title="Vendas concluídas · por vendedor" points={sellers.map(s => ({ label: s.label, value: s.count, detail: `Implantação ${money(s.installation)} · Mensalidade ${money(s.monthly)}` }))} variant="rank" unavailable={!available.sales} empty={!sellers.some(s => s.count > 0)} /></div>
        <div className="lg:col-span-1"><Chart title="Vendas · por produto/serviço" points={products} variant="rank" unavailable={!available.items} empty={!hasData(products)} /></div>
      </section>

      {/* Oportunidades e Propostas agrupadas */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="card-base p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Oportunidades</h2>
              <span className="text-[10px] font-medium text-blue">{metrics.opportunities.inNegotiation}</span>
            </div>
            <div className="grid gap-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-400">Abertas no período</span><span className="font-medium text-ink">{metrics.opportunities.open}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Ganhas</span><span className="font-medium text-emerald-600">{metrics.opportunities.won}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Perdidas</span><span className="font-medium text-rose-600">{metrics.opportunities.lost}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Canceladas</span><span className="font-medium text-slate-600">{metrics.opportunities.cancelled}</span></div>
            </div>
          </div>
        </div>
        <div className="space-y-3">
          <div className="card-base p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Propostas no período</h2>
              <span className="text-[10px] font-medium text-blue">{metrics.proposals.accepted}</span>
            </div>
            <div className="grid gap-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-400">Em análise</span><span className="font-medium text-cyan-600">{metrics.proposals.analysis}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Aceitas</span><span className="font-medium text-emerald-600">{metrics.proposals.accepted}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Recusadas</span><span className="font-medium text-rose-600">{metrics.proposals.rejected}</span></div>
            </div>
            <p className="mt-2 text-[10px] text-muted">O CRM não registra pagamentos confiáveis das propostas; nenhuma é apresentada como paga.</p>
          </div>
        </div>
      </section>

      {/* Valores comerciais e Comissões */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="card-base p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Valores comerciais</h2>
              <span className="text-xs font-bold text-emerald-600">{money(metrics.sales.installation + metrics.sales.monthly)}</span>
            </div>
            <div className="grid gap-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-400 text-sm">Instalação WON</span><span className="font-medium text-ink">{money(metrics.sales.installation)}</span></div>
              <div className="flex justify-between"><span className="text-slate-400 text-sm">Mensalidade WON</span><span className="font-medium text-ink">{money(metrics.sales.monthly)}</span></div>
              <div className="flex justify-between"><span className="text-slate-400 text-sm">Instalação em negociação</span><span className="font-medium text-blue">{money(metrics.opportunities.negotiatedInstallation)}</span></div>
              <div className="flex justify-between"><span className="text-slate-400 text-sm">Mensalidade em negociação</span><span className="font-medium text-cyan">{money(metrics.opportunities.negotiatedMonthly)}</span></div>
            </div>
          </div>
        </div>
        <div className="space-y-3">
          <div className="card-base p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Comissões previstas</h2>
              <span className="text-xs font-bold text-violet-600">{metrics.commissions.available ? money(metrics.commissions.installation + metrics.commissions.monthly) : '—'}</span>
            </div>
            <div className="grid gap-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-400 text-sm">Sobre instalação</span><span className="font-medium text-ink">{metrics.commissions.available ? money(metrics.commissions.installation) : '—'}</span></div>
              <div className="flex justify-between"><span className="text-slate-400 text-sm">Sobre mensalidade</span><span className="font-medium text-ink">{metrics.commissions.available ? money(metrics.commissions.monthly) : '—'}</span></div>
            </div>
            <p className="mt-2 text-xs text-muted">Estimativas com base nas regras atuais. As taxas históricas não foram congeladas nas vendas.</p>
          </div>
        </div>
      </section>

      {/* Metas comerciais */}
      <Panel title="Metas comerciais" aside="Apuração por vendas WON vigentes">
        {sellerFiltered && <p className="border-b border-slate-100 px-5 py-3 text-xs text-muted">O realizado considera o vendedor selecionado. As metas gerais, de produto e categoria mantêm o planejado global.</p>}
        <div className="divide-y divide-slate-100">
          {!available.goals ? <p className="p-4 text-sm text-muted">Dados de metas indisponíveis.</p> : goals.length === 0 ? <p className="p-4 text-sm text-muted">Nenhuma meta cadastrada para o período.</p> : goals.map(goal => <article key={goal.id} className="grid gap-3 p-3 md:grid-cols-[minmax(160px,1fr)_repeat(4,auto)_minmax(120px,1fr)] md:items-center">
            <div><p className="text-[10px] uppercase tracking-wide text-muted">{goal.type}</p><p className="text-sm font-semibold">{goal.label}</p></div>
            <Metric label="Planejado" value={goal.planned} />
            <Metric label="Realizado" value={goal.realized} />
            <Metric label="Restante" value={goal.remaining} />
            <Metric label="Atingimento" value={`${goal.percent}%`} />
            <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue" style={{ width: `${Math.min(100, goal.percent)}%` }} /></div>
          </article>)}
        </div>
      </Panel>

      {/* Atalhos comerciais */}
      <nav aria-label="Atalhos comerciais" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[["Funil de vendas", "/funil"], ["Metas comerciais", "/metas"], ["Propostas", "/propostas"], ["Vendedores", "/vendedores"]].map(([label, href]) => <Link key={href} href={href} className="rounded-lg border border-slate-200 bg-surface px-4 py-3 text-sm font-semibold text-blue transition hover:border-blue/40 hover:shadow-sm">{label} →</Link>)}
      </nav>
    </div>
  )
}

function MetricTile({ label, value, detail, accent = 'border-l-blue-500' }: { label: string; value: string; detail: string; accent?: string }) {
  return <article className={`crm-dashboard-tile min-w-0 rounded-xl border border-slate-200/80 border-l-4 ${accent} bg-surface px-4 py-3 shadow-sm`}>
    <p className="text-xs font-semibold text-muted">{label}</p>
    <p className="mt-1 truncate text-xl font-bold tracking-tight text-ink" title={value}>{value}</p>
    <p className="mt-1 text-xs leading-5 text-muted">{detail}</p>
  </article>
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div><p className="text-xs text-muted">{label}</p><p className="font-semibold">{value}</p></div>
}

function Chart({ title, points, variant = 'trend', unavailable = false, empty = false }: { title: string; points: ManagerChartPoint[]; variant?: 'trend' | 'rank'; unavailable?: boolean; empty?: boolean }) {
  const palette = ['#2878d0', '#18a7b5', '#805ad5', '#e59a19', '#15966a', '#dc5b82', '#52657f', '#e06c35']
  const semanticColor = (label: string, index: number) => {
    const value = label.toLocaleLowerCase('pt-BR')
    if (value.includes('ganh') || value.includes('aceit') || value.includes('won')) return '#15966a'
    if (value.includes('perdid') || value.includes('recus')) return '#dc4c64'
    if (value.includes('cancel')) return '#718096'
    if (value.includes('abert') || value.includes('análise')) return '#2878d0'
    return palette[index % palette.length]
  }
  const max = Math.max(1, ...points.map(point => point.value))
  const coordinates = points.map((point, index) => ({
    x: points.length <= 1 ? 300 : 28 + index * (544 / (points.length - 1)),
    y: 145 - (point.value / max) * 105,
  }))
  const linePath = coordinates.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
  const areaPath = coordinates.length ? `${linePath} L ${coordinates[coordinates.length - 1].x} 155 L ${coordinates[0].x} 155 Z` : ''

  return <Panel title={title} aside={variant === 'trend' ? 'Dados reais' : 'Por volume'}>
    {unavailable ? <p className="p-4 text-sm text-muted">Dados indisponíveis.</p> : empty ? <p className="p-4 text-sm text-muted">Sem vendas no período.</p> : points.length === 0 ? <p className="p-4 text-sm text-muted">Sem dados no período.</p> : variant === 'trend' ? <div className="p-3 sm:p-4">
      <div className="flex items-baseline gap-2"><strong className="text-xl font-bold">{points.reduce((sum, point) => sum + point.value, 0)}</strong><span className="text-xs text-muted">vendas no gráfico</span></div>
      <svg viewBox="0 0 600 175" preserveAspectRatio="none" role="img" aria-label={`${title}: ${points.map(point => `${point.label} ${point.value}`).join(', ')}`} className="mt-2 h-32 w-full overflow-visible">
        {[40, 95, 150].map(y => <line key={y} x1="24" x2="578" y1={y} y2={y} stroke="currentColor" className="text-slate-200" strokeDasharray="3 5" />)}
        <defs><linearGradient id={`chart-area-${title.replace(/[^a-z0-9]/gi, '')}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#2878d0" stopOpacity=".26"/><stop offset="100%" stopColor="#20b9d2" stopOpacity=".02"/></linearGradient></defs>
        {areaPath && <path d={areaPath} fill={`url(#chart-area-${title.replace(/[^a-z0-9]/gi, '')})`} />}
        {linePath && <path d={linePath} fill="none" stroke="#2878d0" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />}
        {coordinates.map((point, index) => <g key={`${points[index].label}-${index}`}><circle cx={point.x} cy={point.y} r="5" fill="white" stroke={semanticColor(points[index].label, index)} strokeWidth="3" /><title>{`${points[index].label}: ${points[index].value}`}</title></g>)}
      </svg>
      <div className="-mt-1 flex justify-between gap-1 text-[10px] text-muted">{points.map((point, index) => <span key={`${point.label}-${index}`} className="min-w-0 truncate text-center" title={`${point.label}: ${point.value}`}>{point.label}</span>)}</div>
    </div> : <div className="grid gap-3 p-3 sm:p-4">
      {points.slice(0, 8).map((point, index) => <div key={`${point.label}-${index}`} title={point.detail}>
        <div className="mb-1 flex items-center justify-between gap-3 text-sm"><span className="min-w-0 truncate font-medium">{point.label}</span><strong>{point.value}</strong></div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full transition-all" style={{ width: `${point.value ? Math.max(3, point.value / max * 100) : 0}%`, backgroundColor: semanticColor(point.label, index) }} /></div>
        {point.detail && <p className="mt-1 truncate text-xs text-muted">{point.detail}</p>}
      </div>)}
    </div>}
  </Panel>
}