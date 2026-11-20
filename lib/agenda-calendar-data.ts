export const AGENDA_TIME_ZONE = 'America/Sao_Paulo'

export const AGENDA_EVENT_SELECT_COLUMNS = [
  'id',
  'title',
  'description',
  'event_type',
  'starts_at',
  'ends_at',
  'all_day',
  'contact_id',
  'contact_name_manual',
  'contact_phone_manual',
  'service_id',
  'service_name_manual',
  'service_description_manual',
  'assigned_user_id',
  'status',
  'color',
  'company_id',
].join(',')

export type AgendaCalendarEvent = {
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
  company_id: string
}

export type AgendaView = 'month' | 'week' | 'day'

const localDateTimeParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: AGENDA_TIME_ZONE,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

const dateKeyFromUtc = (date: Date) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`

const addDate = (date: string, days: number) => {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return dateKeyFromUtc(value)
}

const getPart = (parts: Intl.DateTimeFormatPart[], type: string) => parts.find((part) => part.type === type)?.value ?? ''

export function agendaDateKey(value: string | Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: AGENDA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value))
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

export function agendaCalendarDays(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  if (!year || !monthNumber || monthNumber < 1 || monthNumber > 12) return []
  const first = new Date(Date.UTC(year, monthNumber - 1, 1, 12))
  const last = new Date(Date.UTC(year, monthNumber, 0, 12))
  const offset = first.getUTCDay()
  const total = Math.ceil((offset + last.getUTCDate()) / 7) * 7
  return Array.from({ length: total }, (_, index) => {
    const date = new Date(first)
    date.setUTCDate(date.getUTCDate() + index - offset)
    return dateKeyFromUtc(date)
  })
}

export function agendaWeekDays(selectedDay: string) {
  const selected = new Date(`${selectedDay}T12:00:00Z`)
  const start = new Date(selected)
  start.setUTCDate(start.getUTCDate() - start.getUTCDay())
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start)
    date.setUTCDate(date.getUTCDate() + index)
    return dateKeyFromUtc(date)
  })
}

export function agendaPeriodBounds(view: AgendaView, month: string, selectedDay: string) {
  const days = agendaCalendarDays(month)
  const weekDays = agendaWeekDays(selectedDay)
  const startDay = view === 'day' ? selectedDay : view === 'week' ? weekDays[0] : days[0]
  const endDay = view === 'day' ? selectedDay : view === 'week' ? weekDays[6] : days[days.length - 1]
  return {
    days,
    weekDays,
    startDay,
    endDay,
    from: agendaDateTimeToIso(startDay, '00:00'),
    to: new Date(new Date(agendaDateTimeToIso(addDate(endDay, 1), '00:00')).getTime() - 1).toISOString(),
  }
}

export function agendaDateTimeToIso(date: string, time: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) throw new Error('Data ou horário inválido.')
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const targetWallTime = Date.UTC(year, month - 1, day, hour, minute)
  if (new Date(targetWallTime).toISOString().slice(0, 16) !== `${date}T${time}`) throw new Error('Data ou horário inválido.')

  let instant = targetWallTime
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = localDateTimeParts.formatToParts(new Date(instant))
    const representedAsUtc = Date.UTC(
      Number(getPart(parts, 'year')),
      Number(getPart(parts, 'month')) - 1,
      Number(getPart(parts, 'day')),
      Number(getPart(parts, 'hour')),
      Number(getPart(parts, 'minute')),
    )
    const difference = targetWallTime - representedAsUtc
    if (difference === 0) break
    instant += difference
  }

  const value = new Date(instant)
  const local = localDateTimeParts.formatToParts(value)
  if (`${getPart(local, 'year')}-${getPart(local, 'month')}-${getPart(local, 'day')}` !== date || `${getPart(local, 'hour')}:${getPart(local, 'minute')}` !== time) {
    throw new Error('Data ou horário inválido.')
  }
  return value.toISOString()
}

export type AgendaEventFilters = {
  status: string
  assignedUserId: string
  contactId: string
  search: string
}

export function filterAgendaEvents<Event extends AgendaCalendarEvent>(
  events: Event[],
  filters: AgendaEventFilters,
  contacts: Array<{ id: string; name: string; phone?: string | null }>,
  services: Array<{ id: string; name: string }>,
) {
  const normalizedSearch = filters.search.trim().toLocaleLowerCase('pt-BR')
  return events.filter((event) =>
    (filters.status === 'all' || event.status === filters.status) &&
    (filters.assignedUserId === 'all' || (filters.assignedUserId === 'unassigned' ? !event.assigned_user_id : event.assigned_user_id === filters.assignedUserId)) &&
    (filters.contactId === 'all' || event.contact_id === filters.contactId) &&
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
  )
}

export type AgendaEventPayloadInput = Omit<AgendaCalendarEvent, 'id' | 'company_id'> & { company_id: string }

export function buildAgendaEventPayload(input: AgendaEventPayloadInput) {
  return { ...input }
}
