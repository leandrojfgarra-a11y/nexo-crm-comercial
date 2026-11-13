import Link from 'next/link'
import { addLeadInteraction, convertLead, saveLead } from './actions'
import { createAdminClient } from '@/lib/supabase/admin'
import { safeSearchTerm } from '@/lib/crm-validation'
import { PageHeader, Panel, table, th, td } from '@/components/ui'
import { LeadNegotiationButton } from '@/components/lead-negotiation-button'
import { repairMojibake } from '@/lib/text-encoding'
import { messageForLeadStatus } from '@/lib/whatsapp-messages'
import { resolveTenantContext } from '@/lib/tenant/context'

type SearchParams = Promise<{ q?: string; status?: string; edit?: string; notice?: string; product?: string; activity?: string; competence?: string; opened_from?: string; opened_to?: string; page?: string; page_size?: string; reset_filters?: string }>
type Lead = { id: string; person_id: string | null; source: string | null; status: string; seller_id: string | null; converted_at: string | null; interest_product_id: string | null; notes: string | null; created_at: string }
type Person = { id: string; kind: 'individual' | 'company'; name: string; trade_name: string | null; tax_id: string | null; email: string | null; phone: string | null; mobile_phone?: string | null; whatsapp: string | null; postal_code: string | null; address_line: string | null; address_number: string | null; address_extra: string | null; district: string | null; city: string | null; state: string | null; notes: string | null; business_activity: string | null; primary_cnae: string | null; opened_at: string | null }
const statusLabels: Record<string, string> = { new: 'Novo', contacted: 'Contatado', qualified: 'Qualificado', converted: 'Convertido', lost: 'Perdido' }
const phoneForWhatsApp = (value: string) => {
  let digits = value.replace(/\D/g, '')
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`
  return digits.length >= 12 && digits.length <= 15 ? digits : ''
}
const notices: Record<string, string> = { 'lead-created': 'Lead cadastrado com sucesso.', 'lead-updated': 'Lead atualizado com sucesso.', 'lead-converted': 'Lead convertido em cliente, preservando o mesmo cadastro de pessoa.', 'interaction-added': 'Interação registrada no histórico. Se o lead estava como Novo, agora está Contatado.', 'interaction-invalid': 'Escreva um comentário de até 5.000 caracteres.', 'interaction-save-failed': 'Não foi possível registrar o comentário. Tente novamente.', 'interaction-status-failed': 'A interação foi salva, mas não foi possível atualizar a situação para Contatado. Ajuste-a na ficha.' }

export default async function LeadsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const resetFilters = params.reset_filters === '1'
  const term = safeSearchTerm(resetFilters ? '' : params.q ?? '').toLocaleLowerCase('pt-BR')
  const activityFilter = resetFilters ? '' : params.activity ?? ''
  const status = !resetFilters && Object.hasOwn(statusLabels, params.status ?? '') ? params.status! : 'all'
  const competence = !resetFilters && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.competence ?? '') ? params.competence! : ''
  const openedFrom = !resetFilters && /^\d{4}-\d{2}-\d{2}$/.test(params.opened_from ?? '') ? params.opened_from! : ''
  const openedTo = !resetFilters && /^\d{4}-\d{2}-\d{2}$/.test(params.opened_to ?? '') ? params.opened_to! : ''
  const requestedPageSize = Number(params.page_size)
  const pageSize = !resetFilters && [5, 10, 20].includes(requestedPageSize) ? requestedPageSize : 10
  const requestedPage = Number.parseInt(params.page ?? '1', 10)
  const supabase = await createAdminClient()
  const { companyId } = await resolveTenantContext(supabase)
  let leadQuery = supabase.from('leads').select('id,person_id,source,status,seller_id,converted_at,interest_product_id,notes,created_at').eq('company_id', companyId).order('created_at', { ascending: false }).limit(1000)
  if (status !== 'all') leadQuery = leadQuery.eq('status', status)
  if (!resetFilters && params.product && /^[0-9a-f-]{36}$/i.test(params.product)) leadQuery = leadQuery.eq('interest_product_id', params.product)
  if (competence) {
    const [year, month] = competence.split('-').map(Number)
    const next = new Date(Date.UTC(year, month, 1)).toISOString()
    leadQuery = leadQuery.gte('created_at', `${competence}-01T00:00:00.000Z`).lt('created_at', next)
  }
  const leadResult = await leadQuery
  const leads = (leadResult.data ?? []) as Lead[]
  const personIds = [...new Set(leads.map(lead => lead.person_id).filter((id): id is string => Boolean(id)))]
  const peopleResult = personIds.length
    ? await supabase.from('people').select('id,kind,name,trade_name,tax_id,email,phone,mobile_phone,whatsapp,postal_code,address_line,address_number,address_extra,district,city,state,notes,business_activity,primary_cnae,opened_at').eq('company_id', companyId).in('id', personIds)
    : { data: [], error: null }
  const people = peopleResult.data ?? []
  const peopleById = new Map(people.map(person => [person.id, person as Person]))
  const { data: sellers } = await supabase.from('sellers').select('id,name,active').eq('company_id', companyId).order('name')
  const { data: products } = await supabase.from('products').select('id,name,kind,active').eq('company_id', companyId).order('name')
  const productNames = new Map((products ?? []).map(product => [product.id, product.name]))
  const activeProducts = (products ?? []).filter(product => product.active)
  const activityOptions = [...new Set(people.flatMap(person => [person.business_activity, person.primary_cnae].filter((value): value is string => Boolean(value?.trim()))))].sort((a,b) => a.localeCompare(b, 'pt-BR'))
  const filteredLeads = leads.filter(lead => {
    const person = lead.person_id ? peopleById.get(lead.person_id) : undefined
    if (!person) return false
    if (activityFilter) {
      const selectedCnae = activityFilter.match(/\d{7}/)?.[0]
      const personCnae = person.primary_cnae?.match(/\d{7}/)?.[0]
      if (activityFilter !== person.business_activity && activityFilter !== person.primary_cnae && (!selectedCnae || selectedCnae !== personCnae)) return false
    }
    if (openedFrom && (!person.opened_at || person.opened_at < openedFrom)) return false
    if (openedTo && (!person.opened_at || person.opened_at > openedTo)) return false
    if (term && ![person.name, person.trade_name, person.tax_id, person.email, person.phone, person.whatsapp, lead.source, person.business_activity, person.primary_cnae]
      .some(value => repairMojibake(value).toLocaleLowerCase('pt-BR').includes(term))) return false
    return true
  })
  const pageCount = Math.max(1, Math.ceil(filteredLeads.length / pageSize))
  const currentPage = Math.min(pageCount, Math.max(1, Number.isFinite(requestedPage) ? requestedPage : 1))
  const pageLeads = filteredLeads.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const paginationParams = new URLSearchParams()
  if (!resetFilters && params.q?.trim()) paginationParams.set('q', params.q)
  if (!resetFilters && params.product && /^[0-9a-f-]{36}$/i.test(params.product)) paginationParams.set('product', params.product)
  if (activityFilter) paginationParams.set('activity', activityFilter)
  if (status !== 'all') paginationParams.set('status', status)
  if (competence) paginationParams.set('competence', competence)
  if (openedFrom) paginationParams.set('opened_from', openedFrom)
  if (openedTo) paginationParams.set('opened_to', openedTo)
  paginationParams.set('page_size', String(pageSize))
  const pageHref = (page: number) => `/leads?${paginationParams.toString()}&page=${page}`
  const sellerNames = new Map((sellers ?? []).map(seller => [seller.id, seller.name]))

  let editing: { lead: Lead; person: Person } | null = null
  let editActivities: { id: string; kind: string; title: string; details: string | null; created_at: string }[] = []
  if (params.edit && /^[0-9a-f-]{36}$/i.test(params.edit)) {
    const { data: lead } = await supabase.from('leads').select('id,person_id,source,status,seller_id,converted_at,interest_product_id,notes').eq('id', params.edit).eq('company_id', companyId).maybeSingle()
    if (lead?.person_id) {
      const { data: person } = await supabase.from('people').select('id,kind,name,trade_name,tax_id,email,phone,whatsapp,postal_code,address_line,address_number,address_extra,district,city,state,notes,business_activity,primary_cnae,opened_at').eq('id', lead.person_id).eq('company_id', companyId).maybeSingle()
      if (person) {
        editing = { lead: lead as Lead, person: person as Person }
        const { data: activities } = await supabase.from('activities').select('id,kind,title,details,created_at').eq('company_id', companyId).eq('person_id', person.id).order('created_at', { ascending: false }).limit(100)
        editActivities = activities ?? []
      }
    }
  }
  const sellerOptions = (sellers ?? []).filter(seller => seller.active || seller.id === editing?.lead.seller_id)
  const competenceOptions = [...new Set(leads.map(lead => new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date(lead.created_at))))].sort().reverse()

  const listError = peopleResult.error || leadResult.error
  const noticeText = params.notice ? notices[params.notice] ?? params.notice : undefined
  const successNotices = ['lead-created', 'lead-updated', 'lead-converted', 'interaction-added']
  const isEdit = Boolean(editing)

  return (
    <>
      <PageHeader
        eyebrow="Relacionamento"
        title="Leads"
        subtitle="Cadastre contatos, acompanhe a origem e converta oportunidades em clientes."
        action={isEdit ? 'Editar lead' : 'Novo lead'}
        href="#cadastro"
      />
      <div className="flex flex-wrap items-center gap-2 mt-2">
        <Link href="/leads/importar" className="btn-base btn-primary btn-md">Importar planilha</Link>
      </div>

      {noticeText && <p role={successNotices.includes(params.notice ?? '') ? 'status' : 'alert'} className={`msg-base mt-4 ${successNotices.includes(params.notice ?? '') ? 'msg-success' : 'msg-danger'}`}>{noticeText}</p>}

      <Panel title="Leads cadastrados" aside={`${filteredLeads.length} registros · até 1.000 mais recentes`}>
        <form action="/leads" method="get" className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-2 xl:grid-cols-8">
          <label className="flex flex-col gap-1 text-sm font-medium text-ink sm:col-span-2 lg:col-span-2 xl:col-span-3">
            Pesquisar nome, documento, contato ou origem
            <input name="q" key={`q-${resetFilters ? 'reset' : params.q ?? ''}`} defaultValue={resetFilters ? '' : params.q} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-blue focus:ring-2 focus:ring-blue/15" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-ink sm:col-span-1 lg:col-span-1 xl:col-span-1">
            Produto/serviço
            <select name="product" key={`product-${resetFilters ? 'reset' : params.product ?? ''}`} defaultValue={resetFilters ? '' : params.product ?? ''} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-blue focus:ring-2 focus:ring-blue/15"><option value="">Todos</option>{(products ?? []).map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-ink sm:col-span-1 lg:col-span-1 xl:col-span-1">
            Ramo / CNAE
            <select name="activity" key={`activity-${resetFilters ? 'reset' : activityFilter}`} defaultValue={activityFilter} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-blue focus:ring-2 focus:ring-blue/15"><option value="">Todas as atividades</option>{activityOptions.map(activity => <option key={activity} value={activity}>{repairMojibake(activity)}</option>)}</select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-ink sm:col-span-1 lg:col-span-1 xl:col-span-1">
            Competência de entrada
            <select name="competence" key={`competence-${resetFilters ? 'reset' : competence}`} defaultValue={competence} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-blue focus:ring-2 focus:ring-blue/15"><option value="">Todas</option>{competenceOptions.map(value => <option key={value} value={value}>{new Date(`${value}-01T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</option>)}</select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-ink sm:col-span-1 lg:col-span-1 xl:col-span-1">
            Situação
            <select name="status" key={`status-${resetFilters ? 'reset' : status}`} defaultValue={status} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-blue focus:ring-2 focus:ring-blue/15"><option value="all">Todas</option>{Object.entries(statusLabels).map(([value,title]) => <option key={value} value={value}>{title}</option>)}</select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-ink sm:col-span-1 lg:col-span-1 xl:col-span-2">
            Abertura da empresa · de
            <input type="date" name="opened_from" key={`opened-from-${resetFilters ? 'reset' : openedFrom}`} defaultValue={openedFrom} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-blue focus:ring-2 focus:ring-blue/15" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-ink sm:col-span-1 lg:col-span-1 xl:col-span-2">
            Abertura da empresa · até
            <input type="date" name="opened_to" key={`opened-to-${resetFilters ? 'reset' : openedTo}`} defaultValue={openedTo} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-blue focus:ring-2 focus:ring-blue/15" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-ink sm:col-span-1 lg:col-span-1 xl:col-span-2">
            Exibir por página
            <select name="page_size" defaultValue={String(pageSize)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-blue focus:ring-2 focus:ring-blue/15"><option value="5">5 por página</option><option value="10">10 por página</option><option value="20">20 por página</option></select>
          </label>
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-2 xl:col-span-2">
            <button type="submit" className="btn-base btn-primary btn-md">Filtrar</button>
            <a href="/leads?reset_filters=1" className="btn-base btn-secondary btn-md">Limpar</a>
          </div>
        </form>

        {listError ? (
          <p role="alert" className="p-4 msg-base msg-danger">Não foi possível carregar os leads. Confira se os campos comerciais estão disponíveis e as políticas RLS do projeto Nexo.</p>
        ) : filteredLeads.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-muted">Nenhum lead encontrado. Ajuste os filtros ou cadastre um lead.</p>
            {(openedFrom || openedTo) && (
              <p className="mt-2 text-sm text-muted">Leads importados antes desta correção podem estar sem data de abertura. <Link href="/leads" className="font-semibold text-blue hover:underline">Limpe os filtros</Link>, abra o lead e informe a data na edição.</p>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className={`${table} w-full min-w-[900px]`}>
                <thead>
                  <tr>{['Contato','Ramo / CNAE','Produto','Competência','Abertura','Vendedor','Situação','Ações'].map(col => <th className={th} key={col}>{col}</th>)}</tr>
                </thead>
                <tbody>
                  {pageLeads.map(lead => {
                    const person = lead.person_id ? peopleById.get(lead.person_id) : undefined
                    if (!person) return null
                    return (
                      <tr key={lead.id} className="border-t border-slate-100 hover:bg-slate-50/50 transition-colors">
                        <td className={`${td} font-semibold`}>
                          <Link className="text-blue hover:underline line-clamp-1" href={`/leads/${lead.id}`}>{person.trade_name || person.name}</Link>
                          <span className="block text-xs font-normal text-muted line-clamp-1">{person.name}{person.email ? ` · ${person.email}` : ''}</span>
                          <span className="block text-xs font-normal text-muted line-clamp-1">{person.phone ?? person.whatsapp ?? person.tax_id ?? 'Sem contato adicional'}</span>
                        </td>
                        <td className={td}>
                          <span className="line-clamp-2">{repairMojibake(person.business_activity ?? person.primary_cnae) || '—'}</span>
                          {person.business_activity && person.primary_cnae && <span className="block text-xs text-muted line-clamp-1">CNAE {repairMojibake(person.primary_cnae)}</span>}
                        </td>
                        <td className={td}>{lead.interest_product_id ? repairMojibake(productNames.get(lead.interest_product_id) ?? 'Produto/serviço') : '—'}</td>
                        <td className={td}>{new Intl.DateTimeFormat('pt-BR', { month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(new Date(lead.created_at))}</td>
                        <td className={td}>{person.opened_at ? new Date(`${person.opened_at}T12:00:00`).toLocaleDateString('pt-BR') : '—'}</td>
                        <td className={td}>{lead.seller_id ? sellerNames.get(lead.seller_id) ?? 'Vendedor' : 'Não atribuído'}</td>
                        <td className={td}>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${lead.status === 'converted' ? 'bg-emerald-50 text-emerald-800' : lead.status === 'lost' ? 'bg-rose-50 text-rose-800' : lead.status === 'contacted' ? 'bg-blue-50 text-blue-800' : 'bg-slate-100 text-slate-700'}`}>{statusLabels[lead.status] ?? lead.status}</span>
                        </td>
                        <td className={`${td} crm-action-group flex flex-wrap gap-1`}>
                          <Link className="btn-base btn-secondary btn-sm" href={`/leads?edit=${lead.id}#cadastro`}>Editar</Link>
                          {phoneForWhatsApp(person.whatsapp || person.mobile_phone || person.phone || '') ? (
                            <a href={`https://web.whatsapp.com/send?phone=${phoneForWhatsApp(person.whatsapp || person.mobile_phone || person.phone || '')}&text=${encodeURIComponent(messageForLeadStatus(lead.status, { contactName: person.name, companyName: person.trade_name || person.name, activity: person.business_activity || person.primary_cnae, productName: lead.interest_product_id ? productNames.get(lead.interest_product_id) : null }))}`} target="_blank" rel="noopener noreferrer" data-nexo-whatsapp-link="true" className="btn-base btn-success btn-sm">WhatsApp</a>
                          ) : (
                            <span className="text-xs text-muted" title="Cadastre um telefone com DDD">Sem telefone válido</span>
                          )}
                          {!['converted','lost'].includes(lead.status) && <LeadNegotiationButton leadId={lead.id} />}
                          {lead.status !== 'converted' && (
                            <form action={convertLead} className="inline">
                              <input type="hidden" name="lead_id" value={lead.id} />
                              <button type="submit" className="btn-base btn-ghost btn-sm">Cadastrar cliente</button>
                            </form>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {!listError && filteredLeads.length > 0 && (
              <nav aria-label="Paginação de leads" className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4 mt-4">
                <p className="text-sm text-muted">Exibindo {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredLeads.length)} de {filteredLeads.length} leads</p>
                <div className="flex items-center gap-2">
                  <Link aria-disabled={currentPage <= 1} tabIndex={currentPage <= 1 ? -1 : undefined} href={pageHref(Math.max(1, currentPage - 1))} className={`rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold ${currentPage <= 1 ? 'pointer-events-none opacity-50' : 'hover:bg-slate-50'}`}>Anterior</Link>
                  <span className="px-2 text-sm text-muted">Página {currentPage} de {pageCount}</span>
                  <Link aria-disabled={currentPage >= pageCount} tabIndex={currentPage >= pageCount ? -1 : undefined} href={pageHref(Math.min(pageCount, currentPage + 1))} className={`rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold ${currentPage >= pageCount ? 'pointer-events-none opacity-50' : 'hover:bg-slate-50'}`}>Próxima</Link>
                </div>
              </nav>
            )}
          </>
        )}
      </Panel>

      <section id="cadastro" className="mt-6 card-base p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">{isEdit ? 'Editar lead' : 'Cadastrar lead'}</h2>
            <p className="mt-1 text-sm text-muted">{isEdit ? 'Edite os dados do lead. A conversão reutiliza a pessoa cadastrada e preserva o lead e seu histórico.' : 'A conversão reutiliza a pessoa cadastrada e preserva o lead e seu histórico.'}</p>
          </div>
          <Link href="/leads#cadastro" className="btn-base btn-secondary btn-sm">Limpar edição</Link>
        </div>
        <form action={saveLead} className="grid gap-6">
          {isEdit && editing && <input type="hidden" name="lead_id" value={editing.lead.id} />}
          <fieldset className="grid gap-4 rounded-xl border border-slate-200 p-4 sm:grid-cols-2 lg:grid-cols-3">
            <legend className="px-2 text-sm font-bold">Contato</legend>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
              Tipo de pessoa<span className="text-blue ml-0.5" aria-hidden="true">*</span>
              <select name="kind" required defaultValue={editing?.person.kind ?? 'individual'} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-blue focus:ring-2 focus:ring-blue/15"><option value="individual">Pessoa física</option><option value="company">Pessoa jurídica</option></select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-ink lg:col-span-2">
              Nome completo / razão social<span className="text-blue ml-0.5" aria-hidden="true">*</span>
              <input name="name" required minLength={2} defaultValue={editing?.person.name ?? ''} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-blue focus:ring-2 focus:ring-blue/15" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
              Nome fantasia
              <input name="trade_name" defaultValue={editing?.person.trade_name ?? ''} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-blue focus:ring-2 focus:ring-blue/15" />
              <p className="text-xs text-muted mt-1">Nome de fantasia ou nome comercial (opcional).</p>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
              CPF ou CNPJ<span className="text-blue ml-0.5" aria-hidden="true">*</span>
              <input name="tax_id" inputMode="numeric" defaultValue={editing?.person.tax_id ?? ''} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-blue focus:ring-2 focus:ring-blue/15" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
              Data de abertura
              <input name="opened_at" type="date" defaultValue={editing?.person.opened_at ?? ''} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-blue focus:ring-2 focus:ring-blue/15" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
              E-mail
              <input name="email" type="email" autoComplete="email" defaultValue={editing?.person.email ?? ''} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-blue focus:ring-2 focus:ring-blue/15" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
              Telefone
              <input name="phone" type="tel" defaultValue={editing?.person.phone ?? ''} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-blue focus:ring-2 focus:ring-blue/15" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
              WhatsApp
              <input name="whatsapp" type="tel" autoComplete="tel" defaultValue={editing?.person.whatsapp ?? ''} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-blue focus:ring-2 focus:ring-blue/15" />
            </label>
          </fieldset>
          <fieldset className="grid gap-4 rounded-xl border border-slate-200 p-4 sm:grid-cols-2 lg:grid-cols-3">
            <legend className="px-2 text-sm font-bold">Qualificação comercial</legend>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
              Origem do lead
              <input name="source" defaultValue={editing?.lead.source ?? ''} placeholder="Indicação, site, evento…" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-blue focus:ring-2 focus:ring-blue/15" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
              Vendedor responsável
              <select name="seller_id" defaultValue={editing?.lead.seller_id ?? ''} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-blue focus:ring-2 focus:ring-blue/15"><option value="">Sem responsável</option>{sellerOptions.map(seller => <option key={seller.id} value={seller.id}>{seller.name}{!seller.active ? ' (inativo — vínculo atual)' : ''}</option>)}</select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
              Situação
              <select name="status" defaultValue={editing?.lead.status ?? 'new'} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-blue focus:ring-2 focus:ring-blue/15">{Object.entries(statusLabels).filter(([value]) => value !== 'converted' || editing?.lead.status === 'converted').map(([value,title]) => <option key={value} value={value}>{title}</option>)}</select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
              Produto/serviço de interesse
              <select name="interest_product_id" defaultValue={editing?.lead.interest_product_id ?? ''} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-blue focus:ring-2 focus:ring-blue/15"><option value="">Sem interesse definido</option>{activeProducts.map(product => <option key={product.id} value={product.id}>{product.name} · {product.kind === 'service' ? 'Serviço' : 'Produto'}</option>)}</select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-ink lg:col-span-2">
              Observações do lead
              <textarea name="lead_notes" rows={3} defaultValue={editing?.lead.notes ?? ''} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-blue focus:ring-2 focus:ring-blue/15" />
              <p className="text-xs text-muted mt-1">Observações sobre a qualificação deste lead.</p>
            </label>
          </fieldset>
          <section aria-labelledby="lead-activity-title" className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 mb-4">
              <h3 id="lead-activity-title" className="font-semibold">Comentários e atividade</h3>
              <span className="text-xs text-muted">{isEdit ? `${editActivities.length} registro(s)` : 'Disponível após salvar'}</span>
            </div>
            {isEdit ? (
              <>
                <div className="border-b border-slate-200 p-4 mb-4">
                  <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
                    Escrever um comentário
                    <textarea name="details" rows={2} maxLength={5000} placeholder="Registre uma ligação, mensagem enviada ou próximo passo…" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-blue focus:ring-2 focus:ring-blue/15" />
                  </label>
                  {editing && <input type="hidden" name="lead_id" value={editing.lead.id} />}
                  <input type="hidden" name="kind" value="note" />
                  <input type="hidden" name="title" value="Comentário" />
                  <input type="hidden" name="return_to" value="edit" />
                  <button formAction={addLeadInteraction} className="mt-3 btn-base btn-primary btn-md">Publicar comentário</button>
                </div>
                <ol className="max-h-96 divide-y divide-slate-200 overflow-y-auto">
                  {editActivities.length ? editActivities.map(item => (
                    <li key={item.id} className="px-4 py-3 border-b border-slate-100 last:border-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold">{item.title}</p>
                        <time className="text-xs text-muted" dateTime={item.created_at}>{new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(item.created_at))}</time>
                      </div>
                      {item.details && <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{item.details}</p>}
                    </li>
                  )) : (
                    <li className="px-4 py-6 text-center text-sm text-muted">Ainda não há comentários ou atividades neste lead.</li>
                  )}
                </ol>
              </>
            ) : (
              <p className="p-4 text-sm text-muted">Salve o lead para começar a registrar comentários e acompanhar o histórico com data e hora.</p>
            )}
          </section>
          <div className="flex flex-wrap gap-3 justify-end">
            {isEdit && <Link href="/leads#cadastro" className="btn-base btn-secondary btn-md">Cancelar edição</Link>}
            <button type="submit" className="btn-base btn-primary btn-md">{isEdit ? 'Salvar alterações' : 'Cadastrar lead'}</button>
          </div>
        </form>
      </section>
    </>
  )
}
