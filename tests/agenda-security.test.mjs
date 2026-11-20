import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyAgendaReadScope,
  canManageAgendaEvent,
  canViewAgendaEvent,
  isAgendaAdministrator,
  isAllowedAgendaStatusTransition,
  isValidAgendaInterval,
  resolveAgendaAssignee,
  scopeAgendaEvents,
} from '../lib/agenda-security.ts'

const admin = { userId: 'admin-1', companyId: 'company-a', companyRole: 'admin' }
const seller = { userId: 'seller-1', companyId: 'company-a', companyRole: 'seller' }
const ownEvent = { id: 'event-own', company_id: 'company-a', assigned_user_id: 'seller-1', status: 'scheduled' }
const otherEvent = { id: 'event-other', company_id: 'company-a', assigned_user_id: 'seller-2', status: 'scheduled' }
const foreignEvent = { id: 'event-foreign', company_id: 'company-b', assigned_user_id: 'seller-1', status: 'scheduled' }

test('administrador vê os eventos da empresa e vendedor somente os próprios', () => {
  assert.equal(isAgendaAdministrator(admin), true)
  assert.equal(isAgendaAdministrator(seller), false)
  assert.equal(isAgendaAdministrator({ ...seller, globalAdmin: true }), false)
  assert.equal(canViewAgendaEvent(admin, otherEvent), true)
  assert.equal(canViewAgendaEvent(seller, ownEvent), true)
  assert.equal(canViewAgendaEvent(seller, otherEvent), false)
  assert.equal(canViewAgendaEvent(admin, foreignEvent), false)
  assert.deepEqual(scopeAgendaEvents([ownEvent, otherEvent, foreignEvent], seller), [ownEvent])
})

test('consulta de eventos sempre aplica company_id e limita vendedor ao responsável', () => {
  const makeQuery = () => ({ calls: [], eq(column, value) { this.calls.push([column, value]); return this } })
  const sellerQuery = makeQuery()
  const adminQuery = makeQuery()

  assert.equal(applyAgendaReadScope(sellerQuery, seller), sellerQuery)
  assert.deepEqual(sellerQuery.calls, [['company_id', 'company-a'], ['assigned_user_id', 'seller-1']])
  applyAgendaReadScope(adminQuery, admin)
  assert.deepEqual(adminQuery.calls, [['company_id', 'company-a']])
})

test('CRUD de vendedor fica restrito ao próprio evento e administrador pode atribuir na empresa', () => {
  assert.equal(canManageAgendaEvent(seller, ownEvent), true)
  assert.equal(canManageAgendaEvent(seller, otherEvent), false)
  assert.equal(canManageAgendaEvent(seller, foreignEvent), false)
  assert.deepEqual(resolveAgendaAssignee(seller, null), { allowed: true, userId: 'seller-1' })
  assert.deepEqual(resolveAgendaAssignee(seller, 'seller-2'), { allowed: false, userId: null })
  assert.deepEqual(resolveAgendaAssignee(admin, 'seller-2'), { allowed: true, userId: 'seller-2' })
})

test('transições de status e intervalos de horário seguem as regras existentes', () => {
  assert.equal(isAllowedAgendaStatusTransition('scheduled', 'completed'), true)
  assert.equal(isAllowedAgendaStatusTransition('scheduled', 'cancelled'), true)
  assert.equal(isAllowedAgendaStatusTransition('completed', 'scheduled'), true)
  assert.equal(isAllowedAgendaStatusTransition('cancelled', 'scheduled'), true)
  assert.equal(isAllowedAgendaStatusTransition('completed', 'cancelled'), false)
  assert.equal(isValidAgendaInterval(new Date('2026-11-19T10:00:00Z'), new Date('2026-11-19T11:00:00Z')), true)
  assert.equal(isValidAgendaInterval(new Date('invalid'), new Date('2026-11-19T11:00:00Z')), false)
  assert.equal(isValidAgendaInterval(new Date('2026-11-19T11:00:00Z'), new Date('2026-11-19T10:00:00Z')), false)
})
