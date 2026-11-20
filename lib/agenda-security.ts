export type AgendaActor = {
  userId: string
  companyId: string
  companyRole: string | null
}

export type AgendaEventAccessShape = {
  company_id: string
  assigned_user_id: string | null
}

export function isAgendaAdministrator(actor: AgendaActor) {
  // Administrative scope is company-specific; the CRM claim alone must not
  // let a non-admin membership see another member's appointments.
  return actor.companyRole === 'owner' || actor.companyRole === 'admin'
}

export function canViewAgendaEvent(actor: AgendaActor, event: AgendaEventAccessShape) {
  return event.company_id === actor.companyId && (
    isAgendaAdministrator(actor) || event.assigned_user_id === actor.userId
  )
}

export function canManageAgendaEvent(actor: AgendaActor, event: AgendaEventAccessShape) {
  return canViewAgendaEvent(actor, event)
}

export function resolveAgendaAssignee(actor: AgendaActor, requestedUserId: string | null) {
  if (isAgendaAdministrator(actor)) return { allowed: true, userId: requestedUserId }
  if (requestedUserId && requestedUserId !== actor.userId) return { allowed: false, userId: null }
  return { allowed: true, userId: actor.userId }
}

export function isAllowedAgendaStatusTransition(current: string, next: string) {
  return (current === 'scheduled' && (next === 'completed' || next === 'cancelled')) ||
    ((current === 'completed' || current === 'cancelled') && next === 'scheduled')
}

export function isValidAgendaInterval(start: Date, end: Date) {
  return !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end > start
}

export function scopeAgendaEvents<Event extends AgendaEventAccessShape>(events: Event[], actor: AgendaActor) {
  return events.filter((event) => canViewAgendaEvent(actor, event))
}

type AgendaQuery = {
  eq: (column: string, value: string) => AgendaQuery
}

/** Adds the same company and assignment scope to event lists and exact counts. */
export function applyAgendaReadScope<Query>(query: Query, actor: AgendaActor): Query {
  const scoped = query as unknown as AgendaQuery
  let result = scoped.eq('company_id', actor.companyId)
  if (!isAgendaAdministrator(actor)) result = result.eq('assigned_user_id', actor.userId)
  return result as unknown as Query
}
