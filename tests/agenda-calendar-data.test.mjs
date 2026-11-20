import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AGENDA_EVENT_SELECT_COLUMNS,
  agendaCalendarDays,
  agendaDateKey,
  agendaDateTimeToIso,
  agendaPeriodBounds,
  agendaWeekDays,
  buildAgendaEventPayload,
  filterAgendaEvents,
} from '../lib/agenda-calendar-data.ts'
import { scopeAgendaEvents } from '../lib/agenda-security.ts'

const admin = { userId: 'admin-a', companyId: 'company-a', companyRole: 'admin' }
const seller = { userId: 'seller-a', companyId: 'company-a', companyRole: 'seller' }

const event = (overrides = {}) => ({
  id: 'event-a',
  title: 'Reunião comercial',
  description: null,
  event_type: 'appointment',
  starts_at: '2026-11-20T12:30:00.000Z',
  ends_at: '2026-11-20T13:30:00.000Z',
  all_day: false,
  contact_id: 'contact-a',
  contact_name_manual: null,
  contact_phone_manual: null,
  service_id: 'service-a',
  service_name_manual: null,
  service_description_manual: null,
  assigned_user_id: 'seller-a',
  status: 'scheduled',
  color: null,
  company_id: 'company-a',
  ...overrides,
})

test('a criação gera os campos lidos e mantém empresa/responsável no escopo', () => {
  const created = buildAgendaEventPayload(event({ starts_at: agendaDateTimeToIso('2026-11-20', '09:30') }))
  assert.equal(created.company_id, 'company-a')
  assert.equal(created.assigned_user_id, 'seller-a')
  assert.equal(created.starts_at, '2026-11-20T12:30:00.000Z')
  assert.deepEqual(scopeAgendaEvents([created], seller), [created])
  assert.deepEqual(scopeAgendaEvents([created], { ...seller, userId: 'seller-b' }), [])
})

test('a projeção dos eventos inclui company_id exigido pela leitura com escopo local', () => {
  assert.ok(AGENDA_EVENT_SELECT_COLUMNS.split(',').includes('company_id'))
  const projectedRows = [event(), event({ id: 'foreign', company_id: 'company-b' })]
  assert.deepEqual(scopeAgendaEvents(projectedRows, admin), [projectedRows[0]])
})

test('os limites de mês, semana e dia usam o mesmo período local exibido', () => {
  const month = agendaPeriodBounds('month', '2026-11', '2026-11-19')
  assert.deepEqual([month.startDay, month.endDay], ['2026-11-01', '2026-12-05'])
  assert.equal(month.from, '2026-11-01T03:00:00.000Z')
  assert.equal(month.to, '2026-12-06T02:59:59.999Z')
  assert.deepEqual(agendaCalendarDays('2026-11'), month.days)

  const week = agendaPeriodBounds('week', '2026-11', '2026-11-19')
  assert.deepEqual(week.weekDays, ['2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21'])
  assert.deepEqual([week.startDay, week.endDay], ['2026-11-15', '2026-11-21'])

  const day = agendaPeriodBounds('day', '2026-11', '2026-11-19')
  assert.deepEqual([day.startDay, day.endDay], ['2026-11-19', '2026-11-19'])
  assert.equal(day.from, '2026-11-19T03:00:00.000Z')
  assert.equal(day.to, '2026-11-20T02:59:59.999Z')
})

test('eventos são agrupados no dia de Brasília mesmo perto da virada UTC', () => {
  assert.equal(agendaDateKey('2026-11-20T02:59:59.999Z'), '2026-11-19')
  assert.equal(agendaDateKey('2026-11-20T03:00:00.000Z'), '2026-11-20')
  assert.deepEqual(agendaWeekDays('2026-11-19').slice(0, 2), ['2026-11-15', '2026-11-16'])
})

test('datas e horários do formulário são convertidos de Brasília para UTC e datas inválidas são rejeitadas', () => {
  assert.equal(agendaDateTimeToIso('2026-11-20', '09:30'), '2026-11-20T12:30:00.000Z')
  assert.throws(() => agendaDateTimeToIso('2026-02-30', '09:30'), /Data ou horário inválido/)
  assert.throws(() => agendaDateTimeToIso('2026-11-20', '25:00'), /Data ou horário inválido/)
})

test('filtros de status, responsável, contato e pesquisa são combinados sem vazar outra empresa', () => {
  const events = [
    event(),
    event({ id: 'completed', status: 'completed' }),
    event({ id: 'other-seller', assigned_user_id: 'seller-b' }),
    event({ id: 'no-assignee', assigned_user_id: null, contact_id: null }),
    event({ id: 'foreign', company_id: 'company-b' }),
  ]
  const visible = scopeAgendaEvents(events, admin)
  assert.deepEqual(filterAgendaEvents(visible, {
    status: 'scheduled', assignedUserId: 'seller-a', contactId: 'contact-a', search: 'REUNIÃO',
  }, [{ id: 'contact-a', name: 'Cliente A' }], [{ id: 'service-a', name: 'Plano A' }]).map((row) => row.id), ['event-a'])
  assert.deepEqual(filterAgendaEvents(scopeAgendaEvents(events, seller), {
    status: 'all', assignedUserId: 'all', contactId: 'all', search: '',
  }, [], []).map((row) => row.id), ['event-a', 'completed'])
  assert.deepEqual(filterAgendaEvents(visible, {
    status: 'all', assignedUserId: 'unassigned', contactId: 'all', search: '',
  }, [], []).map((row) => row.id), ['no-assignee'])
})
