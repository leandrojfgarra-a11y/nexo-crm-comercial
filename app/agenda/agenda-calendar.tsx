'use client'

import { FormEvent, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { saveAgendaEvent, deleteAgendaEvent, setAgendaEventStatus } from './actions'
import styles from './agenda-calendar.module.css'

type Event = {
  id: string
  title: string
  description: string | null
  event_type: string
  starts_at: string
  ends_at: string
  all_day: boolean
  contact_id: string | null
  contact_name_manual: string | null
  contact_phone_manual: string | null
  service_id: string | null
  service_name_manual: string | null
  service_description_manual: string | null
  assigned_user_id: string | null
  status: string
  color: string | null
}
type ContactOption = { id: string; name: string; phone: string | null }
type Option = { id: string; name: string }
type Member = { user_id: string; full_name: string; email: string }
type Metrics = { total: number | null; scheduled: number | null; completed: number | null; cancelled: number | null }

type Props = {
  month: string
  view: 'month' | 'week' | 'day'
  selectedDay: string
  days: string[]
  events: Event[]
  contacts: ContactOption[]
  services: Option[]
  members: Member[]
  canCreate: boolean
  canEdit: boolean
  canDelete: boolean
  today: string
  userId: string
  isAdminOrOwner: boolean
  metrics: Metrics
  initialOpen?: boolean
  error?: string
  saved?: string
}

const zone = 'America/Sao_Paulo'
const typeLabel: Record<string, string> = { note: 'Nota', contact: 'Contato', service: 'Serviço', appointment: 'Compromisso' }
const statusLabel: Record<string, string> = { scheduled: 'Agendado', completed: 'Concluído', cancelled: 'Cancelado' }
const input = 'w-full rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] px-2.5 py-2 text-[13px] text-ink outline-none focus:border-blue focus:ring-2 focus:ring-blue/15 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500'
const btnBase = 'btn-base btn-secondary btn-sm'
const btnPrimary = 'btn-base btn-primary btn-sm'
const btnSecondary = 'btn-base btn-secondary btn-sm'
const btnDanger = 'btn-base btn-danger btn-sm'
const btnViewActive = 'btn-base btn-primary btn-sm'
const btnViewInactive = 'btn-base btn-secondary btn-sm'

function parts(value: string | Date) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value))
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? ''
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` }
}
const dateKey = (value: string | Date) => parts(value).date
const clock = (value: string) => parts(value).time
const monthLabel = (m: string) => new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: zone }).format(new Date(`${m}-15T12:00:00-03:00`))
const dayLabel = (d: string) => new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: zone }).format(new Date(`${d}T12:00:00-03:00`))
const fullDayLabel = (d: string) => new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: zone }).format(new Date(`${d}T12:00:00-03:00`))
const plusHour = (value: string) => { const [h, m] = value.split(':').map(Number); const total = h * 60 + m + 60; return total <= 1439 ? `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}` : '23:59' }

const TIME_SLOTS = Array.from({ length: 17 }, (_, i) => `${String(i + 6).padStart(2, '0')}:00`)
const SLOT_H = 56
const COLORS = [{ value: '#2563EB', label: 'Azul' }, { value: '#16A34A', label: 'Verde' }, { value: '#D97706', label: 'Âmbar' }, { value: '#7C3AED', label: 'Roxo' }, { value: '#0891B2', label: 'Ciano' }, { value: '#DC2626', label: 'Vermelho' }]
const defaultColor = (eventType: string) => (eventType === 'contact' ? '#0891B2' : eventType === 'service' ? '#7C3AED' : eventType === 'note' ? '#D97706' : '#2563EB')

function AgendaMetricCard({ label, value, detail, accent = 'bg-blue' }: { label: string; value: string; detail: string; accent?: string }) {
  return (
    <article className="card-base relative overflow-hidden p-3">
      <div className={`absolute inset-x-0 top-0 h-[3px] ${accent}`} />
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 text-xl font-bold tracking-tight text-ink">{value}</p>
      <p className="mt-0.5 text-xs text-muted">{detail}</p>
    </article>
  )
}

export default function AgendaCalendar(props: Props) {
  const { month, view, selectedDay, days, events, contacts, services, members, canCreate, canEdit, canDelete, today, userId, isAdminOrOwner, error, saved, metrics, initialOpen } = props
  const router = useRouter()
  const [open, setOpen] = useState(initialOpen ?? false)
  const [selected, setSelected] = useState(selectedDay)
  const [endDate, setEndDate] = useState(selectedDay)
  const [detail, setDetail] = useState<Event | null>(null)
  const [editing, setEditing] = useState<Event | null>(null)
  const [contactMode, setContactMode] = useState<'registered' | 'manual'>('registered')
  const [serviceMode, setServiceMode] = useState<'registered' | 'manual'>('registered')
  const [manualContactName, setManualContactName] = useState('')
  const [manualContactPhone, setManualContactPhone] = useState('')
  const [manualServiceName, setManualServiceName] = useState('')
  const [manualServiceDescription, setManualServiceDescription] = useState('')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:00')
  const [allDay, setAllDay] = useState(false)
  const [timeError, setTimeError] = useState('')
  const [selectedColor, setSelectedColor] = useState('#2563EB')
  const [eventType, setEventType] = useState('appointment')
  const [status, setStatus] = useState('scheduled')
  const [assignedUserId, setAssignedUserId] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [assignedFilter, setAssignedFilter] = useState('all')
  const [contactFilter, setContactFilter] = useState('all')
  const [search, setSearch] = useState('')

  const canEditEvent = (e: Event) => (canEdit && isAdminOrOwner) || e.assigned_user_id === userId
  const canDeleteEvent = (e: Event) => (canDelete && isAdminOrOwner) || e.assigned_user_id === userId
  const message = saved === 'created' ? 'Compromisso criado com sucesso.' : saved === 'updated' ? 'Compromisso atualizado com sucesso.' : saved === 'completed' ? 'Compromisso concluído.' : saved === 'cancelled' ? 'Compromisso cancelado.' : saved === 'reopened' ? 'Compromisso reaberto.' : saved === 'deleted' ? 'Compromisso excluído.' : undefined
  const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR')
  const filteredEvents = useMemo(() => events.filter((event) =>
    (statusFilter === 'all' || event.status === statusFilter) &&
    (assignedFilter === 'all' || (assignedFilter === 'unassigned' ? !event.assigned_user_id : event.assigned_user_id === assignedFilter)) &&
    (contactFilter === 'all' || event.contact_id === contactFilter) &&
    (!normalizedSearch || [
      event.title,
      event.description,
      event.contact_name_manual,
      event.contact_phone_manual,
      event.service_name_manual,
      event.service_description_manual,
      contacts.find((contact) => contact.id === event.contact_id)?.name,
      contacts.find((contact) => contact.id === event.contact_id)?.phone,
      services.find((service) => service.id === event.service_id)?.name,
    ].some((value) => value?.toLocaleLowerCase('pt-BR').includes(normalizedSearch)))
  ), [assignedFilter, contactFilter, contacts, events, normalizedSearch, services, statusFilter])
  const grouped = useMemo(() => filteredEvents.reduce<Record<string, Event[]>>((a, e) => { (a[dateKey(e.starts_at)] ??= []).push(e); return a }, {}), [filteredEvents])

  const addDays = (day: string, n: number) => { const d = new Date(`${day}T12:00:00-03:00`); d.setDate(d.getDate() + n); return parts(d).date }
  const addMonths = (m: string, day: string, n: number) => {
    const [y, mo] = m.split('-').map(Number)
    const d = new Date(y, mo - 1 + n, 1)
    const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const max = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
    const dayNum = Math.min(Number(day.slice(8, 10)) || 1, max)
    return { month: monthStr, day: `${monthStr}-${String(dayNum).padStart(2, '0')}` }
  }
  const navigate = (next: { view?: 'month' | 'week' | 'day'; month?: string; day?: string }) => {
    const v = next.view ?? view
    const day = next.day ?? selectedDay
    const m = next.month ?? day.slice(0, 7)
    const same = v === view && day === selectedDay && m === month
    if (same) router.refresh()
    else router.push(`/agenda?view=${v}&month=${m}&day=${day}`)
  }
  const goToday = () => navigate({ day: parts(new Date()).date })
  const shift = (n: number) => {
    if (view === 'month') { const r = addMonths(month, selectedDay, n); navigate({ month: r.month, day: r.day }) }
    else if (view === 'week') { navigate({ day: addDays(selectedDay, n * 7) }) }
    else { navigate({ day: addDays(selectedDay, n) }) }
  }
  const setView = (v: 'month' | 'week' | 'day') => navigate({ view: v, day: selectedDay })

  const closeForm = () => {
    setOpen(false)
    if (initialOpen) router.replace(`/agenda?view=${view}&month=${month}&day=${selectedDay}`, { scroll: false })
  }

  const resetForm = () => { setContactMode('registered'); setServiceMode('registered'); setManualContactName(''); setManualContactPhone(''); setManualServiceName(''); setManualServiceDescription(''); setTimeError('') }
  const openFor = (d: string) => { setSelected(d); setEndDate(d); setEditing(null); setStartTime('09:00'); setEndTime('10:00'); setAllDay(false); setSelectedColor('#2563EB'); setEventType('appointment'); setStatus('scheduled'); setAssignedUserId(isAdminOrOwner ? '' : userId); resetForm(); setDetail(null); setOpen(true) }
  const openEdit = (event: Event) => {
    const s = parts(event.starts_at); const e = parts(event.ends_at)
    setSelected(s.date); setEndDate(e.date); setStartTime(s.time); setEndTime(e.time); setAllDay(event.all_day)
    setSelectedColor(event.color ?? defaultColor(event.event_type)); setEventType(event.event_type); setStatus(event.status)
    setContactMode(event.contact_name_manual ? 'manual' : 'registered'); setManualContactName(event.contact_name_manual ?? ''); setManualContactPhone(event.contact_phone_manual ?? '')
    setServiceMode(event.service_name_manual ? 'manual' : 'registered'); setManualServiceName(event.service_name_manual ?? ''); setManualServiceDescription(event.service_description_manual ?? '')
    setAssignedUserId(event.assigned_user_id ?? (isAdminOrOwner ? '' : userId)); setEditing(event); setDetail(null); setTimeError(''); setOpen(true)
  }
  const changeStart = (value: string) => { setStartTime(value); if (!allDay && selected === endDate && endTime <= value) { setEndTime(plusHour(value)); setTimeError('') } }
  const changeEnd = (value: string) => { setEndTime(value); setTimeError(!allDay && selected === endDate && value <= startTime ? 'A hora final deve ser posterior ao horário inicial.' : '') }
  const submit = (ev: FormEvent<HTMLFormElement>) => { if (!allDay && selected === endDate && endTime <= startTime) { ev.preventDefault(); setTimeError('A hora final deve ser posterior ao horário inicial.'); return } setOpen(false) }

  const contactFor = (e: Event) => e.contact_id ? contacts.find((x) => x.id === e.contact_id) : undefined
  const serviceFor = (e: Event) => e.service_id ? services.find((x) => x.id === e.service_id) : undefined

  const weekStart = useMemo(() => { const d = new Date(`${selected}T12:00:00-03:00`); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return dateKey(d) }, [selected])
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = new Date(`${weekStart}T12:00:00-03:00`); d.setUTCDate(d.getUTCDate() + i); return dateKey(d) }), [weekStart])
  const eventsByDay = grouped
  const dayEvents = useMemo(() => (eventsByDay[selected] ?? []).slice().sort((a, b) => a.starts_at.localeCompare(b.starts_at)), [eventsByDay, selected])
  const metricValue = (value: number | null) => value === null ? '—' : value.toLocaleString('pt-BR')
  const eventStyle = (e: Event) => {
    if (e.status === 'completed') return { bg: '#ECFDF5', fg: '#047857', border: e.color ?? '#A7F3D0', cls: '' }
    if (e.status === 'cancelled') return { bg: '#F1F5F9', fg: '#64748B', border: '#CBD5E1', cls: 'line-through' }
    return { bg: '#EFF6FF', fg: '#1D4ED8', border: e.color ?? '#BFDBFE', cls: '' }
  }

  return (
    <section className={`${styles.root} min-w-0 space-y-3`}>
      <section aria-label="Indicadores da agenda" className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        <AgendaMetricCard label="Compromissos no período" value={metricValue(metrics.total)} detail={view === 'month' ? 'Grade exibida' : view === 'week' ? 'Semana exibida' : 'Dia selecionado'} />
        <AgendaMetricCard label="Agendados" value={metricValue(metrics.scheduled)} detail="Aguardando atendimento" accent="bg-blue" />
        <AgendaMetricCard label="Concluídos" value={metricValue(metrics.completed)} detail="No período exibido" accent="bg-emerald-500" />
        <AgendaMetricCard label="Cancelados" value={metricValue(metrics.cancelled)} detail="No período exibido" accent="bg-slate-400" />
      </section>
      <header className="flex flex-wrap items-center justify-between gap-2.5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-blue">Período</p>
          <h2 className="text-base font-semibold text-ink">{view === 'month' ? monthLabel(month) : view === 'week' ? `Semana de ${dayLabel(weekStart)}` : fullDayLabel(selected)}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={goToday} className={btnBase}>Hoje</button>
          <button type="button" onClick={() => shift(-1)} aria-label="Anterior" className={btnBase}>‹</button>
          <button type="button" onClick={() => shift(1)} aria-label="Próximo" className={btnBase}>›</button>
          <button type="button" onClick={() => setView('month')} className={view === 'month' ? btnViewActive : btnViewInactive}>Mês</button>
          <button type="button" onClick={() => setView('week')} className={view === 'week' ? btnViewActive : btnViewInactive}>Semana</button>
          <button type="button" onClick={() => setView('day')} className={view === 'day' ? btnViewActive : btnViewInactive}>Dia</button>
        </div>
      </header>

      {error && <p role="alert" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{error}</p>}
      {message && <p role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{message}</p>}

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0 space-y-3">
      <section aria-label="Filtros da agenda" className={`${styles.filters} grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4`}>
        <label className={styles.field}>Pesquisa
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Título, contato ou serviço" className="w-full" aria-label="Pesquisar agendamentos" />
        </label>
        <label className={styles.field}>Status
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="w-full">
            <option value="all">Todos os status</option><option value="scheduled">Agendados</option><option value="completed">Concluídos</option><option value="cancelled">Cancelados</option>
          </select>
        </label>
        <label className={styles.field}>Responsável
          <select value={assignedFilter} onChange={(event) => setAssignedFilter(event.target.value)} className="w-full">
            <option value="all">Todos os responsáveis</option><option value="unassigned">Não definido</option>
            {members.map((member) => <option key={member.user_id} value={member.user_id}>{member.full_name || member.email || `Usuário ${member.user_id.slice(0, 8)}`}</option>)}
          </select>
        </label>
        <label className={styles.field}>Cliente / contato
          <select value={contactFilter} onChange={(event) => setContactFilter(event.target.value)} className="w-full">
            <option value="all">Todos os contatos</option>
            {contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}
          </select>
        </label>
      </section>

      {view === 'month' && (
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">{['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map((x) => (<div key={x} className="px-2 py-3 text-center text-[10px] font-bold uppercase tracking-wide text-slate-500">{x}</div>))}</div>
          <div className="grid grid-cols-7">
            {days.map((day) => {
              const list = (grouped[day] ?? []).slice().sort((a, b) => a.starts_at.localeCompare(b.starts_at))
              const outside = day.slice(0, 7) !== month; const isToday = day === today; const isSelected = day === selected
              return (
                <div key={day} onClick={() => { setSelected(day); if (canCreate) openFor(day) }} className={`min-h-[92px] border-b border-r border-slate-100 p-1.5 transition sm:min-h-[104px] sm:p-2 ${outside ? 'bg-slate-50 text-slate-400' : 'bg-white'} ${canCreate ? 'cursor-pointer hover:bg-blue-50' : 'cursor-pointer'} ${isToday ? 'ring-2 ring-inset ring-blue' : ''} ${isSelected ? 'bg-blue-50' : ''}`}>
                  <div className={`mb-1.5 flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${isToday ? 'bg-blue text-white' : isSelected ? 'bg-blue-100 text-blue' : 'text-slate-500'}`}>{Number(day.slice(-2))}</div>
                  <div className="space-y-1">
                    {list.slice(0, 4).map((e) => { const st = eventStyle(e); return (<button type="button" key={e.id} onClick={(x) => { x.stopPropagation(); setDetail(e) }} className={`block w-full truncate rounded border px-1.5 py-1 text-left text-[10px] font-semibold hover:opacity-90 ${st.cls}`} style={{ backgroundColor: st.bg, color: st.fg, borderColor: st.border }}>{!e.all_day && <span className="mr-1 text-[9px] font-bold opacity-80">{clock(e.starts_at)}</span>}{e.title}</button>) })}
                    {list.length > 4 && <p className="px-1 text-[10px] font-medium text-slate-400">+{list.length - 4} evento(s)</p>}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {view === 'week' && (
        <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="min-w-[900px]">
            <div className="grid border-b border-slate-200 bg-slate-50" style={{ gridTemplateColumns: '64px repeat(7, minmax(0,1fr))' }}>
              <div className="border-r border-slate-200 px-2 py-3 text-center text-[10px] font-bold uppercase tracking-wide text-slate-500">Hora</div>
              {weekDays.map((d) => { const isToday = d === today; return (<div key={d} className={`border-r border-slate-200 px-2 py-3 text-center ${isToday ? 'bg-blue-50' : ''}`}><div className={`text-[10px] font-bold uppercase tracking-wide ${isToday ? 'text-blue' : 'text-slate-500'}`}>{dayLabel(d)}</div>{isToday && <div className="mx-auto mt-1 h-1.5 w-1.5 rounded-full bg-blue" />}</div>) })}
            </div>
            <div className="grid" style={{ gridTemplateColumns: '64px repeat(7, minmax(0,1fr))' }}>
              {TIME_SLOTS.map((slot) => (
                <div key={`row-${slot}`} className="contents">
                  <div className="border-b border-r border-slate-200 px-1 py-2 text-center text-[10px] font-semibold text-slate-400" style={{ height: SLOT_H }}>{slot}</div>
                  {weekDays.map((day) => {
                    const isToday = day === today
                    const slotEvents = (eventsByDay[day] ?? []).filter((e) => e.all_day ? slot === TIME_SLOTS[0] : clock(e.starts_at).slice(0, 2) === slot.slice(0, 2))
                    return (
                      <div key={`${day}-${slot}`} onClick={() => { navigate({ view: 'week', day }); if (canCreate) openFor(day) }} className={`relative border-b border-r border-slate-100 p-0.5 ${canCreate ? 'cursor-pointer hover:bg-blue-50/50' : ''} ${isToday ? 'bg-blue-50/30' : ''}`} style={{ height: SLOT_H }}>
                        <div className="flex h-full flex-col gap-0.5 overflow-hidden">
                          {slotEvents.slice(0, 2).map((e) => { const st = eventStyle(e); return (<button type="button" key={e.id} onClick={(x) => { x.stopPropagation(); setDetail(e) }} className={`block w-full truncate rounded border px-1 py-0.5 text-left text-[10px] font-semibold hover:opacity-90 ${st.cls}`} style={{ backgroundColor: st.bg, color: st.fg, borderColor: st.border }} title={`${e.all_day ? 'Dia inteiro' : clock(e.starts_at)} ${e.title}`}>{!e.all_day && <span className="mr-0.5 opacity-80">{clock(e.starts_at)}</span>}{e.title}</button>) })}
                          {slotEvents.length > 2 && <span className="px-1 text-[9px] font-medium text-slate-400">+{slotEvents.length - 2}</span>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {view === 'day' && (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="grid border-b border-slate-200 bg-slate-50" style={{ gridTemplateColumns: '72px minmax(0,1fr)' }}>
            <div className="border-r border-slate-200 px-2 py-3 text-center text-[10px] font-bold uppercase tracking-wide text-slate-500">Hora</div>
            <div className="px-4 py-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">Compromissos</div>
          </div>
          {TIME_SLOTS.map((slot) => {
            const slotEvents = dayEvents.filter((e) => e.all_day ? slot === TIME_SLOTS[0] : clock(e.starts_at).slice(0, 2) === slot.slice(0, 2))
            return (
              <div key={slot} className="grid border-b border-slate-100" style={{ gridTemplateColumns: '72px minmax(0,1fr)', minHeight: SLOT_H }}>
                <div className="border-r border-slate-200 px-2 py-3 text-center text-[11px] font-semibold text-slate-500">{slot}</div>
                <div className={`flex flex-wrap items-start gap-1.5 px-3 py-1.5 ${canCreate ? 'cursor-pointer hover:bg-blue-50/40' : ''}`} onClick={() => canCreate && openFor(selected)}>
            {slotEvents.map((e) => { const st = eventStyle(e); return (<button type="button" key={e.id} onClick={(x) => { x.stopPropagation(); setDetail(e) }} className={`inline-flex max-w-md items-center gap-2 rounded-lg border px-3 py-1.5 text-left text-sm font-semibold hover:opacity-90 ${st.cls}`} style={{ backgroundColor: st.bg, color: st.fg, borderColor: st.border }}><span className="text-xs opacity-90">{e.all_day ? 'Dia inteiro' : `${clock(e.starts_at)}–${clock(e.ends_at)}`}</span><span className="truncate">{e.title}</span></button>) })}
                </div>
              </div>
            )
          })}
          {dayEvents.length === 0 && <div className="p-8 text-center text-sm text-slate-400">Sem compromissos neste dia.</div>}
        </section>
      )}
      </div>

      <aside className="panel-base h-fit overflow-hidden xl:sticky xl:top-20" aria-label="Compromissos do dia selecionado">
        <div className="panel-header">
          <div><h3 className="text-sm font-semibold">Dia selecionado</h3><p className="mt-0.5 text-xs text-muted">{fullDayLabel(selected)}</p></div>
          <span className="badge badge-info">{dayEvents.length}</span>
        </div>
        {dayEvents.length ? <ol className="divide-y divide-slate-100">
          {dayEvents.map((event) => {
            const statusClass = event.status === 'scheduled' ? 'badge-info' : event.status === 'completed' ? 'badge-success' : 'badge-neutral'
            return <li key={event.id} className="p-2.5">
              <button type="button" onClick={() => setDetail(event)} className="w-full rounded-md p-1 text-left transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue/40">
                <span className="flex items-center justify-between gap-2"><time className="text-xs font-semibold text-muted">{event.all_day ? 'Dia inteiro' : `${clock(event.starts_at)}–${clock(event.ends_at)}`}</time><span className={`badge ${statusClass}`}>{statusLabel[event.status] ?? event.status}</span></span>
                <span className="mt-1 block text-[13px] font-semibold text-ink">{event.title}</span>
                {(event.contact_name_manual || contactFor(event)) && <span className="mt-0.5 block truncate text-xs text-muted">{event.contact_name_manual ?? contactFor(event)?.name}</span>}
              </button>
            </li>
          })}
        </ol> : <p className="p-4 text-sm text-muted">Nenhum compromisso corresponde aos filtros neste dia.</p>}
      </aside>
      </div>

      {open && (
        <div className={`${styles.modalBackdrop} fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-2 sm:p-4`} role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="agenda-dialog-title" className={`${styles.modal} flex h-[min(90dvh,42rem)] max-h-[calc(100dvh-1rem)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border shadow-2xl sm:max-h-[calc(100dvh-2rem)]`}>
            <div className={`${styles.modalHeader} flex shrink-0 items-center justify-between border-b px-4 py-3 sm:px-5`}>
              <div><p className="text-[10px] font-semibold uppercase tracking-[.12em] text-blue">{editing ? 'Editar' : 'Novo agendamento'}</p><h2 id="agenda-dialog-title" className="text-lg font-bold text-ink">{editing ? 'Editar compromisso' : 'Novo compromisso'}</h2></div>
              <button type="button" onClick={closeForm} aria-label="Fechar formulário" className="btn-base btn-secondary btn-sm">Fechar</button>
            </div>
            <form key={editing?.id ?? `new-${selected}`} action={async (fd) => { await saveAgendaEvent(fd) }} onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
              {editing && <input type="hidden" name="event_id" value={editing.id} />}
              <div className={`${styles.modalBody} min-h-0 flex-1 space-y-3 overflow-y-auto p-3 sm:p-4`}>
              <section className={styles.formSection}>
                <div className={styles.formSectionHeader}><div><h3 className={styles.formSectionTitle}>Dados e horário</h3><p className={styles.formSectionDescription}>Defina o compromisso, período e observações.</p></div></div>
                <div className="grid gap-2.5">
              <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">Título<span className="ml-0.5 text-blue">*</span><input name="title" defaultValue={editing?.title ?? ''} required className={input} /></label>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">Tipo<select name="event_type" value={eventType} onChange={(e) => { setEventType(e.target.value); if (!editing) setSelectedColor(defaultColor(e.target.value)) }} className={input}>{Object.entries(typeLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">Data inicial<input type="date" name="starts_at" value={selected} required onChange={(e) => { setSelected(e.target.value); if (endDate < e.target.value) setEndDate(e.target.value) }} className={input} /></label>
                <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">Data final<input type="date" name="ends_at" value={endDate} min={selected} required onChange={(e) => setEndDate(e.target.value)} className={input} /></label>
                <label className="flex items-center gap-2 pt-6 text-sm font-medium text-ink"><input type="checkbox" name="all_day" value="true" checked={allDay} onChange={(e) => { setAllDay(e.target.checked); setTimeError('') }} /> Dia inteiro</label>
              </div>
              {allDay && <><input type="hidden" name="start_time" value={startTime} /><input type="hidden" name="end_time" value={endTime} /></>}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">Hora inicial<input type="time" name={allDay ? undefined : 'start_time'} value={startTime} onChange={(e) => changeStart(e.target.value)} disabled={allDay} required={!allDay} className={input} /></label>
                <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">Hora final<input type="time" name={allDay ? undefined : 'end_time'} value={endTime} onChange={(e) => changeEnd(e.target.value)} disabled={allDay} required={!allDay} className={input} /></label>
              </div>
              {timeError && <p className="text-sm text-red-700">{timeError}</p>}
              <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">Descrição / observações<textarea name="description" rows={3} defaultValue={editing?.description ?? ''} className={input} /></label>
                </div>
              </section>
              <section className={styles.formSection}>
                <div className={styles.formSectionHeader}><div><h3 className={styles.formSectionTitle}>Vínculos e acompanhamento</h3><p className={styles.formSectionDescription}>Associe contato, serviço, responsável e status.</p></div></div>
                <div className="grid gap-2.5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className={`${styles.choiceCard} rounded-lg border border-[var(--border)] p-3`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-ink">Cliente / contato</span>
                    <div role="group" aria-label="Tipo de contato" className={styles.segmented}>
                      <button type="button" aria-pressed={contactMode === 'registered'} onClick={() => setContactMode('registered')} className={contactMode === 'registered' ? btnViewActive : btnViewInactive}>Cadastrado</button>
                      <button type="button" aria-pressed={contactMode === 'manual'} onClick={() => setContactMode('manual')} className={contactMode === 'manual' ? btnViewActive : btnViewInactive}>Avulso</button>
                    </div>
                  </div>
                  {contactMode === 'registered' ? (
                    <label className={`${styles.field} mt-2`}>Selecionar cliente
                      <select name="contact_id" defaultValue={editing?.contact_id ?? ''} className={input}>
                        <option value="">Sem cliente vinculado</option>
                        {contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}
                      </select>
                    </label>
                  ) : (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <input type="hidden" name="contact_id" value="" />
                      <input name="contact_name_manual" value={manualContactName} onChange={(event) => setManualContactName(event.target.value)} placeholder="Nome do contato" aria-label="Nome do contato avulso" className={input} />
                      <input name="contact_phone_manual" value={manualContactPhone} onChange={(event) => setManualContactPhone(event.target.value)} placeholder="Telefone" aria-label="Telefone do contato avulso" className={input} />
                    </div>
                  )}
                </div>
                <div className={`${styles.choiceCard} rounded-lg border border-[var(--border)] p-3`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-ink">Serviço</span>
                    <div role="group" aria-label="Tipo de serviço" className={styles.segmented}>
                      <button type="button" aria-pressed={serviceMode === 'registered'} onClick={() => setServiceMode('registered')} className={serviceMode === 'registered' ? btnViewActive : btnViewInactive}>Catálogo</button>
                      <button type="button" aria-pressed={serviceMode === 'manual'} onClick={() => setServiceMode('manual')} className={serviceMode === 'manual' ? btnViewActive : btnViewInactive}>Avulso</button>
                    </div>
                  </div>
                  {serviceMode === 'registered' ? (
                    <label className={`${styles.field} mt-2`}>Selecionar serviço
                      <select name="service_id" defaultValue={editing?.service_id ?? ''} className={input}>
                        <option value="">Sem serviço vinculado</option>
                        {services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
                      </select>
                    </label>
                  ) : (
                    <div className="mt-2 grid gap-2">
                      <input type="hidden" name="service_id" value="" />
                      <input name="service_name_manual" value={manualServiceName} onChange={(event) => setManualServiceName(event.target.value)} placeholder="Nome do serviço" aria-label="Nome do serviço avulso" className={input} />
                      <input name="service_description_manual" value={manualServiceDescription} onChange={(event) => setManualServiceDescription(event.target.value)} placeholder="Descrição do serviço" aria-label="Descrição do serviço avulso" className={input} />
                    </div>
                  )}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">Responsável<select name="assigned_user_id" value={isAdminOrOwner ? assignedUserId : userId} onChange={(e) => setAssignedUserId(e.target.value)} disabled={!isAdminOrOwner} className={input}><option value="">Não definido</option>{members.map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name || m.email || m.user_id}</option>)}</select></label>
                <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">Status<select name="status" value={status} onChange={(e) => setStatus(e.target.value)} className={input}><option value="scheduled">Agendado</option><option value="completed">Concluído</option><option value="cancelled">Cancelado</option></select></label>
                <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">Cor<input type="hidden" name="color" value={selectedColor} /><div className="mt-1 flex flex-wrap gap-1.5">{COLORS.map((c) => (<button key={c.value} type="button" onClick={() => setSelectedColor(c.value)} aria-label={c.label} title={c.label} className={`h-7 w-7 rounded-full border-2 transition ${selectedColor === c.value ? 'border-slate-700 ring-2 ring-blue/30' : 'border-transparent hover:scale-105'}`} style={{ backgroundColor: c.value }} />))}</div></label>
              </div>
                </div>
              </section>
              </div>
              <div className={`${styles.modalFooter} flex shrink-0 flex-wrap justify-end gap-2 border-t px-3 py-3 sm:px-5`}>
                <button type="button" onClick={closeForm} className={btnSecondary}>Cancelar</button>
                <button type="submit" className={btnPrimary}>{editing ? 'Salvar' : 'Salvar agendamento'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 sm:items-center sm:p-4">
          <div className="w-full max-w-lg rounded-t-2xl bg-white p-6 shadow-2xl sm:rounded-2xl">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-[10px] font-bold uppercase tracking-[.14em] text-blue">{typeLabel[detail.event_type] ?? detail.event_type}</p><h2 className="mt-1 text-xl font-bold text-ink">{detail.title}</h2></div>
              <button type="button" onClick={() => setDetail(null)} className="rounded-lg px-3 py-2 text-lg text-slate-600 hover:bg-slate-100">×</button>
            </div>
            <dl className="mt-5 grid gap-3 text-sm">
              <div><dt className="text-xs font-medium text-slate-500">Data e horário</dt><dd className="font-semibold text-ink">{dateKey(detail.starts_at)} {detail.all_day ? '· Dia inteiro' : `· ${clock(detail.starts_at)}–${clock(detail.ends_at)}`}{dateKey(detail.starts_at) !== dateKey(detail.ends_at) && <span className="block text-slate-600">até {dateKey(detail.ends_at)} {clock(detail.ends_at)}</span>}</dd></div>
              <div><dt className="text-xs font-medium text-slate-500">Status</dt><dd className="font-semibold text-ink">{statusLabel[detail.status] ?? detail.status}</dd></div>
              {(detail.contact_name_manual || contactFor(detail)) && <div><dt className="text-xs font-medium text-slate-500">Contato</dt><dd className="font-semibold text-ink">{detail.contact_name_manual ?? contactFor(detail)?.name}<span className="mt-1 block font-normal text-slate-500">{detail.contact_phone_manual ?? contactFor(detail)?.phone ?? ''}</span></dd></div>}
              {(detail.service_name_manual || serviceFor(detail)) && <div><dt className="text-xs font-medium text-slate-500">Serviço</dt><dd className="font-semibold text-ink">{detail.service_name_manual ?? serviceFor(detail)?.name}{detail.service_description_manual && <span className="mt-1 block whitespace-pre-wrap font-normal text-slate-500">{detail.service_description_manual}</span>}</dd></div>}
              {detail.description && <div><dt className="text-xs font-medium text-slate-500">Observações</dt><dd className="whitespace-pre-wrap text-sm text-slate-700">{detail.description}</dd></div>}
            </dl>
            <div className="mt-6 flex flex-wrap gap-2">
              {canEditEvent(detail) && <>
                <button type="button" onClick={() => openEdit(detail)} className={btnSecondary}>Editar</button>
                {detail.status === 'scheduled' && <><form action={async (fd) => { await setAgendaEventStatus(fd) }} onSubmit={() => setDetail(null)}><input type="hidden" name="event_id" value={detail.id} /><input type="hidden" name="new_status" value="completed" /><button type="submit" className={btnSecondary}>Concluir</button></form><form action={async (fd) => { await setAgendaEventStatus(fd) }} onSubmit={() => setDetail(null)}><input type="hidden" name="event_id" value={detail.id} /><input type="hidden" name="new_status" value="cancelled" /><button type="submit" className={btnSecondary}>Cancelar</button></form></>}
                {(detail.status === 'completed' || detail.status === 'cancelled') && <form action={async (fd) => { await setAgendaEventStatus(fd) }} onSubmit={() => setDetail(null)}><input type="hidden" name="event_id" value={detail.id} /><input type="hidden" name="new_status" value="scheduled" /><button type="submit" className={btnSecondary}>Reabrir</button></form>}
              </>}
              {canDeleteEvent(detail) && <form action={async (fd) => { await deleteAgendaEvent(fd) }} onSubmit={(e) => { if (!window.confirm('Deseja realmente excluir este compromisso?')) e.preventDefault(); else setDetail(null) }}><input type="hidden" name="event_id" value={detail.id} /><button type="submit" className={btnDanger}>Excluir</button></form>}
              <button type="button" onClick={() => setDetail(null)} className={btnPrimary}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
