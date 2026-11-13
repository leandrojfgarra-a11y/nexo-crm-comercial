'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { addWhatsAppInteraction } from '@/app/whatsapp/actions'
import { repairMojibake } from '@/lib/text-encoding'
import { messageForLeadStatus } from '@/lib/whatsapp-messages'

type RecentActivity = { id: string; title: string; details: string; createdAt: string }
export type WhatsAppLead = {
  id: string; personId: string; name: string; legalName: string; phone: string; email: string; activity: string;
  openedAt: string; status: string; sellerId: string; sellerName: string; productId: string; productName: string;
  createdAt: string; activities: RecentActivity[]
}
type Product = { id: string; name: string }
type Filters = { search: string; status: string; sellerId: string; productId: string; activity: string }
type SavedView = { id: string; name: string; filters: Filters }
type Props = { contacts: WhatsAppLead[]; products: Product[]; loadError: boolean; notice: { tone: 'success' | 'error'; text: string } | null }

const emptyFilters: Filters = { search: '', status: 'all', sellerId: 'all', productId: 'all', activity: 'all' }
const builtInViews: SavedView[] = [
  { id: 'all', name: 'Todos os leads', filters: emptyFilters },
  { id: 'new', name: 'Novos', filters: { ...emptyFilters, status: 'new' } },
  { id: 'contacted', name: 'Contatados', filters: { ...emptyFilters, status: 'contacted' } },
  { id: 'qualified', name: 'Qualificados', filters: { ...emptyFilters, status: 'qualified' } },
  { id: 'unassigned', name: 'Sem vendedor', filters: { ...emptyFilters, sellerId: 'unassigned' } },
]
const statusNames: Record<string, string> = { new: 'Novo', contacted: 'Contatado', qualified: 'Qualificado', converted: 'Convertido', lost: 'Perdido' }
const input = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-blue focus:ring-2 focus:ring-blue/15'
const label = 'grid gap-1.5 text-sm font-medium text-ink'
const localDate = (value: string) => value ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }) : ''
const phoneForWhatsApp = (value: string) => {
  let digits = value.replace(/\D/g, '')
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`
  return digits.length >= 12 && digits.length <= 15 ? digits : ''
}

export function WhatsAppWorkspace({ contacts, products, loadError, notice }: Props) {
  const [savedViews, setSavedViews] = useState<SavedView[]>([])
  const [activeViewId, setActiveViewId] = useState('all')
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [viewName, setViewName] = useState('')
  const [expandedLead, setExpandedLead] = useState<string | null>(null)
  useEffect(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem('nexo-whatsapp-saved-views') || '[]')
      if (Array.isArray(parsed)) setSavedViews(parsed.filter(item => item && typeof item.id === 'string' && typeof item.name === 'string' && item.filters))
    } catch { setSavedViews([]) }
  }, [])

  const activities = useMemo(() => [...new Set(contacts.map(contact => contact.activity).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [contacts])
  const sellers = useMemo(() => [...new Map(contacts.filter(contact => contact.sellerId).map(contact => [contact.sellerId, contact.sellerName])).entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [contacts])
  const filtered = useMemo(() => contacts.filter(contact => {
    const query = filters.search.trim().toLocaleLowerCase('pt-BR')
    if (query && [contact.name, contact.legalName, contact.phone, contact.email, contact.activity, contact.productName].every(value => !repairMojibake(value).toLocaleLowerCase('pt-BR').includes(query))) return false
    if (filters.status !== 'all' && contact.status !== filters.status) return false
    if (filters.sellerId === 'unassigned' && contact.sellerId) return false
    if (filters.sellerId !== 'all' && filters.sellerId !== 'unassigned' && contact.sellerId !== filters.sellerId) return false
    if (filters.productId !== 'all' && contact.productId !== filters.productId) return false
    if (filters.activity !== 'all' && contact.activity !== filters.activity) return false
    return true
  }), [contacts, filters])

  function changeFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setActiveViewId('manual')
    setFilters(current => ({ ...current, [key]: value }))
  }

  function selectView(view: SavedView) {
    setActiveViewId(view.id)
    setFilters(view.filters)
  }

  function saveCurrentView() {
    const name = viewName.trim()
    if (!name || name.length > 40) return
    const view = { id: crypto.randomUUID(), name, filters: { ...filters } }
    const next = [...savedViews, view]
    setSavedViews(next)
    localStorage.setItem('nexo-whatsapp-saved-views', JSON.stringify(next))
    setViewName('')
    setActiveViewId(view.id)
  }

  function removeView(id: string) {
    const next = savedViews.filter(view => view.id !== id)
    setSavedViews(next)
    localStorage.setItem('nexo-whatsapp-saved-views', JSON.stringify(next))
    if (activeViewId === id) selectView(builtInViews[0])
  }

  return <>
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-blue">Relacionamento · atendimento</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Central de WhatsApp</h1><p className="mt-1 text-sm text-muted">Organize os leads, abra a conversa no WhatsApp e registre cada interação no histórico.</p></div><span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900">Modo gratuito · sem API</span></header>
    <div className="mb-5 rounded-xl border border-blue/20 bg-blue-50 px-4 py-3 text-sm text-blue-900">As conversas são abertas no WhatsApp ou WhatsApp Web. O CRM não lê nem envia mensagens automaticamente; registre manualmente o resultado do contato.</div>
    {notice && <p role={notice.tone === 'success' ? 'status' : 'alert'} className={`mb-5 rounded-lg border px-4 py-3 text-sm ${notice.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>{notice.text}</p>}
    {loadError && <p role="alert" className="mb-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">Não foi possível carregar todos os leads ou o histórico de interações.</p>}

    <section className="crm-whatsapp-list overflow-hidden rounded-xl border border-slate-200 bg-surface shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 pt-4" role="tablist" aria-label="Abas de contatos">
        {[...builtInViews, ...savedViews].map(view => <div className="flex items-center" key={view.id}><button type="button" role="tab" aria-selected={activeViewId === view.id} onClick={() => selectView(view)} className={`rounded-t-lg border px-3 py-2 text-sm font-semibold ${activeViewId === view.id ? 'border-slate-200 border-b-white bg-white text-blue' : 'border-transparent text-muted hover:bg-slate-50 hover:text-ink'}`}>{view.name}</button>{savedViews.some(item => item.id === view.id) && <button type="button" aria-label={`Excluir aba ${view.name}`} onClick={() => removeView(view.id)} className="ml-1 rounded px-1 text-xs text-muted hover:text-red-700">×</button>}</div>)}
      </div>
      <div className="crm-filter-form grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 xl:grid-cols-5">
        <label className={`${label} sm:col-span-2 xl:col-span-1`}>Pesquisar contato<input value={filters.search} onChange={event => changeFilter('search', event.target.value)} placeholder="Nome, telefone, e-mail" className={input} /></label>
        <label className={label}>Situação<select value={filters.status} onChange={event => changeFilter('status', event.target.value)} className={input}><option value="all">Todas</option>{Object.entries(statusNames).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
        <label className={label}>Vendedor<select value={filters.sellerId} onChange={event => changeFilter('sellerId', event.target.value)} className={input}><option value="all">Todos</option><option value="unassigned">Sem vendedor</option>{sellers.map(seller => <option key={seller.id} value={seller.id}>{seller.name}</option>)}</select></label>
        <label className={label}>Produto / serviço<select value={filters.productId} onChange={event => changeFilter('productId', event.target.value)} className={input}><option value="all">Todos</option>{products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
        <label className={label}>Atividade<select value={filters.activity} onChange={event => changeFilter('activity', event.target.value)} className={input}><option value="all">Todas</option>{activities.map(activity => <option key={activity} value={activity}>{activity}</option>)}</select></label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-3">
        <form className="flex flex-wrap items-center gap-2" onSubmit={event => { event.preventDefault(); saveCurrentView() }}><input aria-label="Nome da nova aba" value={viewName} onChange={event => setViewName(event.target.value)} maxLength={40} placeholder="Nome da aba personalizada" className="w-64 max-w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"/><button disabled={!viewName.trim()} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-ink disabled:opacity-50">Salvar filtros como aba</button></form>
        <p className="text-sm text-muted">{filtered.length} lead(s)</p>
      </div>

      {!filtered.length ? <p className="p-10 text-center text-sm text-muted">Nenhum lead corresponde a esta aba e aos filtros.</p> : <div className="divide-y divide-slate-100">{filtered.map(contact => {
        const phone = phoneForWhatsApp(contact.phone)
        const message = messageForLeadStatus(contact.status, { contactName: contact.legalName || contact.name, companyName: contact.name, activity: contact.activity, productName: contact.productName })
        const whatsappHref = phone ? `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}` : null
        return <article key={contact.id} className="grid gap-4 p-4 lg:grid-cols-[minmax(200px,1.1fr)_minmax(160px,1fr)_minmax(150px,0.8fr)_auto] lg:items-center">
          <div><Link href={`/leads/${contact.id}`} className="font-semibold text-blue hover:underline">{contact.name}</Link><p className="text-xs text-muted">{contact.legalName}</p><p className="mt-1 text-xs text-muted">{contact.phone || 'Sem telefone'}{contact.email ? ` · ${contact.email}` : ''}</p></div>
          <div className="text-sm">{repairMojibake(contact.activity) || 'Atividade não informada'}<p className="text-xs text-muted">{repairMojibake(contact.productName) || 'Sem produto de interesse'}</p></div>
          <div className="text-sm">{contact.sellerName || 'Sem vendedor'}<p className="text-xs text-muted">{statusNames[contact.status] || contact.status} · Lead desde {localDate(contact.createdAt)}</p></div>
          <div className="crm-action-group lg:justify-end"><Link href={`/leads/${contact.id}`} className="crm-button crm-button-secondary">Abrir ficha</Link>{whatsappHref ? <a href={whatsappHref} target="_blank" rel="noopener noreferrer" data-nexo-whatsapp-link="true" className="crm-button crm-button-success">Abrir WhatsApp Web</a> : <button type="button" disabled className="crm-button crm-button-secondary" title="Cadastre um telefone com DDD">Sem WhatsApp</button>}<button type="button" aria-expanded={expandedLead === contact.id} onClick={() => setExpandedLead(expandedLead === contact.id ? null : contact.id)} className="crm-button crm-button-primary">Registrar interação</button></div>
          {expandedLead === contact.id && <div className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 lg:col-span-4 lg:grid-cols-2">
            <div><h2 className="font-semibold">Últimas interações</h2>{contact.activities.length ? <ol className="mt-2 grid gap-2">{contact.activities.map(item => <li key={item.id} className="border-b border-slate-200 pb-2 text-sm last:border-0"><p className="font-medium">{item.title}</p><p className="text-xs text-muted">{localDate(item.createdAt)}</p>{item.details && <p className="mt-1 whitespace-pre-wrap text-muted">{item.details}</p>}</li>)}</ol> : <p className="mt-2 text-sm text-muted">Ainda sem interações registradas.</p>}<Link href={`/leads/${contact.id}`} className="mt-3 inline-block text-sm font-semibold text-blue hover:underline">Ver histórico completo →</Link></div>
            <form action={addWhatsAppInteraction} className="grid content-start gap-3"><input type="hidden" name="lead_id" value={contact.id}/><h2 className="font-semibold">Adicionar ao histórico</h2><label className={label}>Canal<select name="kind" className={input}><option value="message">WhatsApp / mensagem</option><option value="call">Ligação</option></select></label><label className={label}>O que aconteceu?<select name="title" className={input}><option>1º contato realizado</option><option>Ligação realizada</option><option>WhatsApp de apresentação enviado</option><option>Material de propaganda enviado</option><option>Cliente respondeu no WhatsApp</option><option>Retorno agendado</option><option>Outro contato realizado</option></select></label><label className={label}>Situação depois desta interação<select name="lead_status" defaultValue="auto" className={input}><option value="auto">Automática (Novo passa para Contatado)</option><option value="new">Novo</option><option value="contacted">Contatado</option><option value="qualified">Qualificado</option><option value="lost">Perdido</option></select></label><label className={label}>Observação<textarea name="details" maxLength={5000} rows={3} placeholder="Resultado, resposta ou próximo passo" className={input}/></label><p className="text-xs text-muted">A data e a hora serão registradas automaticamente ao salvar. A conversão em cliente é feita pela ação própria.</p><button className="w-fit rounded-lg bg-blue px-4 py-2.5 text-sm font-semibold text-white">Salvar interação</button></form>
          </div>}
        </article>
      })}</div>}
      <p className="border-t border-slate-100 px-4 py-3 text-xs text-muted">Exibindo até 1.000 leads mais recentes. As abas personalizadas ficam salvas neste navegador.</p>
    </section>
  </>
}
