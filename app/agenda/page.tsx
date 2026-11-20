import { resolveAgendaContext } from '@/lib/agenda-context'
import { applyAgendaReadScope, isAgendaAdministrator, scopeAgendaEvents } from '@/lib/agenda-security'
import { hasAgendaSchema } from '@/lib/agenda-schema'
import Link from 'next/link'
import AgendaCalendar from './agenda-calendar'

const zone = 'America/Sao_Paulo'
const key = (d: Date) => {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d)
  return `${p.find((x) => x.type === 'year')?.value}-${p.find((x) => x.type === 'month')?.value}-${p.find((x) => x.type === 'day')?.value}`
}
const nowMonth = () => key(new Date()).slice(0, 7)
const add = (d: Date, n: number) => new Date(d.getTime() + n * 86400000)
const calendarDays = (month: string) => {
  const [year, mon] = month.split('-').map(Number)
  const first = new Date(Date.UTC(year, mon - 1, 1, 12))
  const last = new Date(Date.UTC(year, mon, 0, 12))
  const offset = first.getUTCDay()
  const total = Math.ceil((offset + last.getUTCDate()) / 7) * 7
  return Array.from({ length: total }, (_, i) => key(add(first, i - offset)))
}

type Params = { month?: string; view?: string; day?: string; notice?: string; action_error?: string; saved?: string; new?: string }
type AgendaMetrics = { total: number | null; scheduled: number | null; completed: number | null; cancelled: number | null }

export default async function AgendaPage({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams
  const { supabase, actor } = await resolveAgendaContext()
  const { companyId, userId } = actor

  const schemaReady = await hasAgendaSchema(supabase)

  const today = new Date()
  const todayStr = key(today)
  const view = sp.view && ['month', 'week', 'day'].includes(sp.view) ? (sp.view as 'month' | 'week' | 'day') : 'month'
  const selectedDay = sp.day && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? sp.day : todayStr
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : selectedDay.slice(0, 7)
  const days = calendarDays(month)
  const weekStart = (() => {
    const d = new Date(`${selectedDay}T12:00:00-03:00`)
    d.setUTCDate(d.getUTCDate() - d.getUTCDay())
    return key(d)
  })()
  const weekEnd = key(add(new Date(`${weekStart}T12:00:00-03:00`), 6))
  const rangeStart = view === 'day' ? selectedDay : view === 'week' ? weekStart : days[0]
  const rangeEnd = view === 'day' ? selectedDay : view === 'week' ? weekEnd : days[days.length - 1]
  const from = new Date(`${rangeStart}T00:00:00-03:00`).toISOString()
  const to = new Date(`${rangeEnd}T23:59:59.999-03:00`).toISOString()

  let events: any[] = []
  let contacts: any[] = []
  let services: any[] = []
  let members: any[] = []
  let loadError: string | null = null
  let metrics: AgendaMetrics = { total: null, scheduled: null, completed: null, cancelled: null }

  const isAdminOrOwner = isAgendaAdministrator(actor)

  if (schemaReady) {
    // Verificar se o usuário é admin/owner da empresa
    const metricQuery = () => {
      return applyAgendaReadScope(
        supabase.from('agenda_events').select('id', { count: 'exact', head: true }), actor,
      ).gte('starts_at', from).lte('starts_at', to)
    }
    const [eventsResult, contactsResult, servicesResult, membersResult, totalMetric, scheduledMetric, completedMetric, cancelledMetric] = await Promise.all([
      applyAgendaReadScope(supabase
        .from('agenda_events')
        .select(
          'id,title,description,event_type,starts_at,ends_at,all_day,contact_id,contact_name_manual,contact_phone_manual,service_id,service_name_manual,service_description_manual,assigned_user_id,status,color'
        ), actor)
        .gte('starts_at', from)
        .lte('starts_at', to)
        .order('starts_at'),
      supabase
        .from('people')
        .select('id,name,phone')
        .eq('company_id', companyId)
        .order('name'),
      supabase.from('products').select('id,name').eq('company_id', companyId).eq('active', true).order('name'),
      supabase.from('crm_company_members').select('user_id').eq('company_id', companyId).eq('active', true),
      metricQuery(),
      metricQuery().eq('status', 'scheduled'),
      metricQuery().eq('status', 'completed'),
      metricQuery().eq('status', 'cancelled'),
    ])

    metrics = {
      total: totalMetric.error ? null : totalMetric.count ?? 0,
      scheduled: scheduledMetric.error ? null : scheduledMetric.count ?? 0,
      completed: completedMetric.error ? null : completedMetric.count ?? 0,
      cancelled: cancelledMetric.error ? null : cancelledMetric.count ?? 0,
    }

    if (eventsResult.error) loadError = `Não foi possível carregar os compromissos: ${eventsResult.error.message}`
    events = scopeAgendaEvents((eventsResult.data ?? []) as any[], actor)
    contacts = (contactsResult.data ?? []) as any[]
    services = (servicesResult.data ?? []) as any[]
    members = (membersResult.data ?? []) as any[]

    // Vendedores só veem compromissos próprios
  }

  const contactOptions = contacts.map((x) => ({
    id: String(x.id),
    name: String(x.name),
    phone: x.phone ? String(x.phone) : null,
  }))
  const serviceOptions = services.map((x) => ({ id: String(x.id), name: String(x.name) }))
  const memberOptions = members.map((x) => ({
    user_id: String(x.user_id),
    full_name: String(x.full_name ?? `Usuário ${String(x.user_id).slice(0, 8)}`),
    email: String(x.email ?? ''),
  }))

  return (
    <div className="space-y-2">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-blue">Relacionamento</p>
          <h1 className="text-xl font-bold tracking-tight text-ink">Agenda</h1>
          <p className="mt-0.5 text-xs text-muted">Acompanhe compromissos, contatos e serviços da empresa ativa.</p>
        </div>
        {schemaReady && <Link href={`/agenda?view=${view}&month=${month}&day=${selectedDay}&new=1`} className="btn-base btn-primary btn-sm"><span aria-hidden="true">+</span> Novo agendamento</Link>}
      </header>
      {schemaReady === false && (
        <p role="alert" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          O endpoint deste ambiente não confirmou o schema da Agenda. Verifique a migration e o projeto Supabase configurado antes de habilitar gravações.
        </p>
      )}
      {loadError && (
        <p role="alert" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {loadError}
        </p>
      )}
      {sp.notice && (
        <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {sp.notice}
        </p>
      )}
      {sp.saved && (
        <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {sp.saved === 'created'
            ? 'Compromisso criado com sucesso.'
            : sp.saved === 'updated'
              ? 'Compromisso atualizado com sucesso.'
              : sp.saved === 'completed'
                ? 'Compromisso concluído.'
                : sp.saved === 'cancelled'
                  ? 'Compromisso cancelado.'
                  : sp.saved === 'reopened'
                    ? 'Compromisso reaberto.'
                    : sp.saved === 'deleted'
                      ? 'Compromisso excluído.'
                      : undefined}
        </p>
      )}
      <AgendaCalendar
        key={`${view}-${selectedDay}`}
        month={month}
        view={view as 'month' | 'week' | 'day'}
        selectedDay={selectedDay}
        days={days}
        events={events}
        contacts={contactOptions}
        services={serviceOptions}
        members={memberOptions}
        canCreate={schemaReady}
        canEdit={schemaReady && isAdminOrOwner}
        canDelete={schemaReady && isAdminOrOwner}
        today={todayStr}
        error={loadError ?? sp.action_error}
        saved={sp.saved}
        userId={userId}
        isAdminOrOwner={isAdminOrOwner}
        metrics={metrics}
        initialOpen={sp.new === '1' && schemaReady}
      />
    </div>
  )
}
