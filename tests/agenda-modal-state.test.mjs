import test from 'node:test'
import assert from 'node:assert/strict'
import { agendaCalendarInstanceKey } from '../lib/agenda-modal-state.ts'

test('a mudança de new=1 recria a instância do calendário para abrir o formulário', () => {
  const closedKey = agendaCalendarInstanceKey('month', '2026-11-20', false)
  const openKey = agendaCalendarInstanceKey('month', '2026-11-20', true)

  assert.notEqual(openKey, closedKey)
  assert.equal(agendaCalendarInstanceKey('month', '2026-11-20', true), openKey)
})

test('a chave continua isolando a instância por visualização e dia selecionado', () => {
  const original = agendaCalendarInstanceKey('month', '2026-11-20', false)

  assert.notEqual(agendaCalendarInstanceKey('week', '2026-11-20', false), original)
  assert.notEqual(agendaCalendarInstanceKey('month', '2026-11-21', false), original)
})
