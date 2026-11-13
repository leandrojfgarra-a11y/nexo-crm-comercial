import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { safeSearchTerm } from '@/lib/crm-validation'
import { PageHeader, Panel, table, th, td } from '@/components/ui'
import { resolveTenantContext } from '@/lib/tenant/context'

type SearchParams = Promise<{ q?: string; status?: string; notice?: string; customer?: string }>
type Person = { id: string; kind: string; name: string; trade_name: string | null; tax_id: string | null; email: string | null; phone: string | null; mobile_phone: string | null; whatsapp: string | null }
const phoneForWhatsApp = (value: string) => {
  let digits = value.replace(/\D/g, '')
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`
  return digits.length >= 12 && digits.length <= 15 ? digits : ''
}
const statusLabels: Record<string, string> = { active: 'Ativo', inactive: 'Inativo' }
const statusColors: Record<string, string> = { active: 'bg-emerald-50 text-emerald-800', inactive: 'bg-slate-100 text-slate-700' }

export default async function CustomersPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const term = safeSearchTerm(params.q ?? '')
  const status = ['active', 'inactive'].includes(params.status ?? '') ? params.status! : 'all'
  const supabase = await createAdminClient()
  const { companyId } = await resolveTenantContext(supabase)

  let peopleQuery = supabase.from('people').select('id,kind,name,trade_name,tax_id,email,phone,mobile_phone,whatsapp').eq('company_id', companyId)
  if (term) peopleQuery = peopleQuery.or(`name.ilike.%${term}%,trade_name.ilike.%${term}%,tax_id.ilike.%${term}%,phone.ilike.%${term}%,whatsapp.ilike.%${term}%`)
  const { data: people, error: peopleError } = await peopleQuery.limit(1000)
  const personMap = new Map((people ?? []).map(person => [person.id, person as Person]))
  let customerQuery = supabase.from('customers').select('id,person_id,status,since').eq('company_id', companyId).order('created_at', { ascending: false }).limit(500)
  if (status !== 'all') customerQuery = customerQuery.eq('status', status)
  if (term) {
    const ids = (people ?? []).map(person => person.id)
    customerQuery = ids.length ? customerQuery.in('person_id', ids) : customerQuery.eq('person_id', '00000000-0000-0000-0000-000000000000')
  }
  const { data: customers, error: customerError } = await customerQuery
  const noticeText: Record<string, string> = {
    'customer-created': 'Cliente cadastrado. Confira a ficha 360°.',
    'customer-updated': 'Cadastro atualizado.',
    'customer-created-schema-pending': 'Cliente salvo com os campos atuais. Os dados fiscais e vínculos estão pendentes da migration complementar.',
    'customer-updated-schema-pending': 'Cadastro atualizado com os campos disponíveis. Dados fiscais e vínculos seguem pendentes da migration complementar.',
    'lead-converted': 'Lead convertido em cliente.',
  }
  const notice = params.notice ? noticeText[params.notice] ?? params.notice : null
  const noticeIsSuccess = ['customer-created', 'customer-updated', 'customer-created-schema-pending', 'customer-updated-schema-pending', 'lead-converted'].includes(params.notice ?? '')

  return (
    <div>
      <PageHeader eyebrow="Relacionamento" title="Clientes" subtitle="Pesquise e acompanhe os cadastros comerciais de pessoas físicas e jurídicas." action="Novo cliente" href="/clientes/novo" />
      <div className="-mt-3 mb-5 flex justify-end"><Link href="/clientes/importar" className="btn-base btn-secondary btn-sm">Importar clientes históricos</Link></div>
      {notice && <p role={noticeIsSuccess ? 'status' : 'alert'} className={`msg-base mt-4 ${noticeIsSuccess ? 'msg-success' : 'msg-danger'}`}>{notice}{params.customer && <Link className="ml-2 font-semibold underline" href={`/clientes/${params.customer}`}>Abrir ficha 360°</Link>}</p>}
      <Panel title="Clientes cadastrados" aside={`${customers?.length ?? 0} registros`}>
        <form method="get" className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1 text-sm font-medium text-ink sm:col-span-2 lg:col-span-2">
            Nome, CPF/CNPJ, telefone ou WhatsApp
            <input name="q" defaultValue={params.q} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-blue focus:ring-2 focus:ring-blue/15" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-ink sm:col-span-1 lg:col-span-1">
            Situação
            <select name="status" defaultValue={status} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-blue focus:ring-2 focus:ring-blue/15">
              <option value="all">Todos</option>
              <option value="active">Ativos</option>
              <option value="inactive">Inativos</option>
            </select>
          </label>
          <button className="self-end btn-base btn-primary btn-md">Pesquisar</button>
        </form>
        {peopleError || customerError ? (
          <p role="alert" className="msg-base mt-4 msg-danger">Não foi possível carregar os clientes. Verifique a sessão administrativa e o schema.</p>
        ) : !customers?.length ? (
          <p className="p-6 text-center text-sm text-muted">Nenhum cliente encontrado. Ajuste os filtros ou cadastre um novo cliente.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className={`${table} w-full min-w-[900px]`}>
              <thead>
                <tr>{['Cliente', 'Tipo', 'CPF/CNPJ', 'Contato', 'Situação', 'Ações'].map(col => <th key={col} className={th}>{col}</th>)}</tr>
              </thead>
              <tbody>
                {customers.map(customer => {
                  const person = personMap.get(customer.person_id)
                  if (!person) return null
                  const phone = phoneForWhatsApp(person.whatsapp || person.mobile_phone || person.phone || '')
                  const whatsappHref = phone ? `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(`Olá, ${person.trade_name || person.name}! Aqui é da Garra Automação. Podemos conversar?`)}` : null
                  return (
                    <tr key={customer.id} className="border-t border-slate-100 hover:bg-slate-50/50 transition-colors">
                      <td className={`${td} font-semibold`}>
                        <Link href={`/clientes/${customer.id}`} className="font-semibold text-blue hover:underline">{person.name}</Link>
                        {person.trade_name && <span className="block text-xs font-normal text-muted">{person.trade_name}</span>}
                      </td>
                      <td className={td}>{person.kind === 'individual' ? 'Pessoa física' : 'Pessoa jurídica'}</td>
                      <td className={td}>{person.tax_id ?? '—'}</td>
                      <td className={td}>{[person.phone, person.whatsapp, person.email].filter(Boolean).join(' · ') || '—'}</td>
                      <td className={td}>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusColors[customer.status] ?? statusColors.active}`}>{customer.status === 'active' ? 'Ativo' : 'Inativo'}</span>
                      </td>
                      <td className={`${td} crm-action-group`}>
                        <Link href={`/clientes/${customer.id}`} className="btn-base btn-secondary btn-sm">Visualizar</Link>
                        <Link href={`/clientes/${customer.id}/editar`} className="btn-base btn-secondary btn-sm">Editar</Link>
                        {whatsappHref ? (
                          <a href={whatsappHref} target="_blank" rel="noopener noreferrer" data-nexo-whatsapp-link="true" className="btn-base btn-success btn-sm">WhatsApp</a>
                        ) : (
                          <span className="text-xs text-muted" title="Cadastre um telefone com DDD">Sem telefone válido</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}
