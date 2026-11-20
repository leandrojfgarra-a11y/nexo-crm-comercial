import test from 'node:test'
import assert from 'node:assert/strict'
import { loadPeopleByIds, PEOPLE_LOOKUP_BATCH_SIZE, splitPeopleLookupIds } from '../lib/people-lookup.ts'

test('divide IDs de pessoas em lotes limitados e sem duplicatas', () => {
  const ids = Array.from({ length: 257 }, (_, index) => `person-${index}`)
  const batches = splitPeopleLookupIds([...ids, ids[0]])

  assert.equal(PEOPLE_LOOKUP_BATCH_SIZE, 100)
  assert.deepEqual(batches.map(batch => batch.length), [100, 100, 57])
  assert.equal(new Set(batches.flat()).size, 257)
})

test('consulta todos os lotes mantendo company_id em cada requisição', async () => {
  const calls = []
  const client = {
    from(table) {
      assert.equal(table, 'people')
      const call = { filters: [] }
      calls.push(call)
      return {
        select(columns) { call.columns = columns; return this },
        eq(column, value) { call.filters.push(['eq', column, value]); return this },
        async in(column, ids) {
          call.filter = [column, ids]
          return { data: ids.map(id => ({ id })), error: null }
        },
      }
    },
  }
  const ids = Array.from({ length: 257 }, (_, index) => `person-${index}`)

  const result = await loadPeopleByIds(client, 'company-123', ids, 'id,name')

  assert.equal(result.error, null)
  assert.equal(result.data.length, ids.length)
  assert.equal(calls.length, 3)
  assert.ok(calls.every(call => call.filters.some(([operator, column, value]) => operator === 'eq' && column === 'company_id' && value === 'company-123')))
  assert.ok(calls.every(call => call.columns === 'id,name' && call.filter[0] === 'id' && call.filter[1].length <= 100))
})

test('não faz consultas quando não há IDs', async () => {
  const client = { from() { assert.fail('Não deve consultar quando a lista está vazia') } }
  assert.deepEqual(await loadPeopleByIds(client, 'company-123', [], 'id,name'), { data: [], error: null })
})
