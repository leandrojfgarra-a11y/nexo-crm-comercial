import Link from 'next/link'
import { notFound } from 'next/navigation'
import { addLeadInteraction } from '../actions'
import { LeadNegotiationButton } from '@/components/lead-negotiation-button'
import { Panel } from '@/components/ui'
import { createAdminClient } from '@/lib/supabase/admin'
import { repairMojibake } from '@/lib/text-encoding'
import { resolveTenantContext } from '@/lib/tenant/context'

type PageProps = { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string }> }
const input = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-blue focus:ring-2 focus:ring-blue/15'
const label = 'grid gap-1.5 text-sm font-medium text-ink'
const statusLabels: Record<string, string> = { new: 'Novo', contacted: 'Contatado', qualified: 'Qualificado', converted: 'Convertido', lost: 'Perdido' }
const kindLabels: Record<string, string> = { call: 'Ligação', message: 'Mensagem', meeting: 'Reunião', task: 'Tarefa', note: 'Observação' }

export default async function LeadDetailPage({ params, searchParams }: PageProps) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const supabase = await createAdminClient()
  const { companyId } = await resolveTenantContext(supabase)
  const { data: lead, error } = await supabase.from('leads')
    .select('id,person_id,source,status,seller_id,interest_product_id,notes,created_at,converted_at')
    .eq('id', id).eq('company_id', companyId).maybeSingle()
  if (error || !lead?.person_id) notFound()

  const [personResult, activitiesResult, sellerResult, productResult] = await Promise.all([
    supabase.from('people').select('id,kind,name,trade_name,tax_id,email,phone,whatsapp,postal_code,address_line,address_number,address_extra,district,city,state,business_activity,primary_cnae,opened_at').eq('id', lead.person_id).eq('company_id', companyId).maybeSingle(),
    supabase.from('activities').select('id,kind,title,details,created_at,created_by').eq('company_id', companyId).eq('person_id', lead.person_id).order('created_at', { ascending: false }).limit(200),
    lead.seller_id ? supabase.from('sellers').select('name').eq('id', lead.seller_id).eq('company_id', companyId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    lead.interest_product_id ? supabase.from('products').select('name').eq('id', lead.interest_product_id).eq('company_id', companyId).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ])
  const person = personResult.data
  if (personResult.error || !person) notFound()
  const address = [person.address_line, person.address_number, person.address_extra, person.district, person.city, person.state, person.postal_code].filter(Boolean).join(', ')
  const notice = query.notice === 'interaction-added' ? { message: 'Interação registrada no histórico com data e hora.', tone: 'success' }
    : query.notice === 'interaction-status-failed' ? { message: 'A interação foi salva, mas não foi possível atualizar a situação. Altere-a para Contatado manualmente.', tone: 'error' }
    : query.notice === 'interaction-invalid' ? { message: 'Confira o tipo, o título e o limite de caracteres da interação.', tone: 'error' }
      : query.notice === 'interaction-save-failed' ? { message: 'Não foi possível registrar a interação. Verifique as permissões e tente novamente.', tone: 'error' }
        : null

  return <>
    <div className="mb-6"><Link href="/leads" className="text-sm font-semibold text-blue hover:underline">← Voltar aos leads</Link></div>
    {notice && <p role={notice.tone === 'success' ? 'status' : 'alert'} className={`mb-5 rounded-lg border px-4 py-3 text-sm ${notice.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>{notice.message}</p>}
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-blue">Relacionamento · ficha do lead</p><h1 className="mt-1 text-3xl font-bold tracking-tight">{person.trade_name || person.name}</h1><p className="mt-1 text-sm text-muted">{person.name}{person.tax_id ? ` · ${person.tax_id}` : ''} · {statusLabels[lead.status] ?? lead.status}</p></div><div className="flex flex-wrap gap-2"><Link href={`/leads?edit=${lead.id}#cadastro`} className="rounded-lg border border-slate-300 bg-surface px-4 py-2.5 text-sm font-semibold text-ink hover:bg-slate-50">Editar lead</Link>{!['converted','lost'].includes(lead.status) && <LeadNegotiationButton leadId={lead.id} />}</div></header>

    <div className="grid gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      <div className="grid content-start gap-5">
        <Panel title="Dados do contato"><dl className="grid gap-4 p-5 sm:grid-cols-2">
          <Info label="Razão social / nome" value={person.name} /><Info label="Nome fantasia" value={person.trade_name} />
          <Info label="CNPJ / CPF" value={person.tax_id} /><Info label="Telefone" value={person.phone} />
          <Info label="WhatsApp" value={person.whatsapp} /><Info label="E-mail" value={person.email} />
          <Info label="Endereço" value={address} /><Info label="Data de abertura" value={person.opened_at ? new Date(`${person.opened_at}T12:00:00`).toLocaleDateString('pt-BR') : null} />
          <Info label="Ramo de atividade" value={repairMojibake(person.business_activity)} /><Info label="CNAE principal" value={repairMojibake(person.primary_cnae)} />
          <Info label="Produto / serviço" value={productResult.data?.name} /><Info label="Vendedor" value={sellerResult.data?.name} />
          <Info label="Origem" value={lead.source} /><Info label="Lead incluído" value={new Date(lead.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} />
          {lead.converted_at && <Info label="Convertido em" value={new Date(lead.converted_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} />}
          {lead.notes && <div className="sm:col-span-2"><Info label="Observações comerciais" value={lead.notes} /></div>}
        </dl></Panel>
        <Panel title="Registrar interação"><form action={addLeadInteraction} className="grid gap-4 p-5">
          <input type="hidden" name="lead_id" value={lead.id} />
          <label className={label}>Tipo<select name="kind" className={input}><option value="call">Ligação / contato telefônico</option><option value="message">WhatsApp, e-mail ou propaganda enviada</option><option value="meeting">Reunião</option><option value="task">Tarefa</option><option value="note">Observação</option></select></label>
          <label className={label}>O que foi feito?<input name="title" list="lead-interaction-suggestions" required minLength={2} maxLength={180} placeholder="Ex.: 1º contato realizado; propaganda enviada" className={input} /><datalist id="lead-interaction-suggestions"><option value="1º contato realizado" /><option value="Ligação realizada" /><option value="WhatsApp de apresentação enviado" /><option value="Material de propaganda enviado" /><option value="E-mail enviado" /><option value="Reunião realizada" /><option value="Retorno agendado" /></datalist></label>
          <label className={label}>Detalhes<textarea name="details" rows={3} maxLength={5000} placeholder="Resultado, retorno combinado ou próximo passo" className={input} /></label>
          <button className="w-fit rounded-lg bg-blue px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">Salvar no histórico</button>
          <p className="text-xs text-muted">A data e a hora são registradas automaticamente pelo banco.</p>
        </form></Panel>
      </div>

      <Panel title="Histórico de interações" aside="Mais recentes primeiro">
        {activitiesResult.error ? <p role="alert" className="p-5 text-sm text-red-700">Não foi possível carregar o histórico de atividades.</p> : activitiesResult.data?.length ? <ol className="divide-y divide-slate-100">{activitiesResult.data.map(activity => <li key={activity.id} className="p-5"><div className="flex flex-wrap items-center justify-between gap-2"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{kindLabels[activity.kind] ?? activity.kind}</span><time className="text-xs text-muted" dateTime={activity.created_at}>{new Date(activity.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })}</time></div><h2 className="mt-2 font-semibold">{activity.title}</h2>{activity.details && <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{activity.details}</p>}</li>)}</ol> : <p className="p-8 text-center text-sm text-muted">Ainda não há interações. Registre o primeiro contato para iniciar o histórico.</p>}
      </Panel>
    </div>
  </>
}

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  return <div><dt className="text-xs text-muted">{label}</dt><dd className="mt-1 whitespace-pre-wrap text-sm font-semibold">{value || '—'}</dd></div>
}
