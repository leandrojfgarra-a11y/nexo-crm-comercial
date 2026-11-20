import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { updateAccountantForCompany } from '../lib/accountant-update.ts'

const actionSource = await readFile('app/contadores/actions.ts', 'utf8')
const pageSource = await readFile('app/contadores/page.tsx', 'utf8')

function fakeClient(result) {
  const calls = { table: null, payload: null, filters: [], selected: null, insertCount: 0 }
  const query = {
    eq(column, value) { calls.filters.push([column, value]); return this },
    select(columns) { calls.selected = columns; return this },
    async maybeSingle() { return result },
  }
  const client = {
    from(table) { calls.table = table; return { update(payload) { calls.payload = payload; return query }, insert() { calls.insertCount++; return query } } },
  }
  return { client, calls }
}

test('edição atualiza pelo ID e empresa ativa sem cair em INSERT', async () => {
  const { client, calls } = fakeClient({ data: { id: 'accountant-1' }, error: null })
  const payload = { name: 'Nome alterado', company_id: 'company-1' }
  const result = await updateAccountantForCompany(client, 'accountant-1', 'company-1', payload)
  assert.deepEqual(result, { status: 'updated' })
  assert.equal(calls.table, 'accountants')
  assert.deepEqual(calls.payload, payload)
  assert.deepEqual(calls.filters, [['id', 'accountant-1'], ['company_id', 'company-1']])
  assert.equal(calls.selected, 'id')
  assert.equal(calls.insertCount, 0)
})

test('edição sem linha afetada não declara sucesso', async () => {
  const { client } = fakeClient({ data: null, error: null })
  assert.deepEqual(await updateAccountantForCompany(client, 'missing', 'company-1', {}), { status: 'not-found' })
})

test('erros de persistência são distinguidos de sucesso e de duplicidade', async () => {
  const duplicate = fakeClient({ data: null, error: { code: '23505' } })
  const failure = fakeClient({ data: null, error: { code: '42501' } })
  assert.deepEqual(await updateAccountantForCompany(duplicate.client, 'id', 'company', {}), { status: 'duplicate' })
  assert.deepEqual(await updateAccountantForCompany(failure.client, 'id', 'company', {}), { status: 'error' })
})

test('Server Action mantém edição em UPDATE e a página só usa sucesso para created/updated', () => {
  assert.match(actionSource, /if \(id\) \{[\s\S]*updateAccountantForCompany\(supabase, id, tenant\.companyId, payload\)/)
  assert.match(actionSource, /revalidatePath\('\/contadores'\)[\s\S]*redirect\('\/contadores\?notice=updated'\)/)
  assert.match(pageSource, /noticeIsSuccess = params\.notice === 'created' \|\| params\.notice === 'updated'/)
  assert.match(pageSource, /role=\{noticeIsSuccess \? 'status' : 'alert'\}/)
  assert.match(pageSource, /noticeIsSuccess \? styles\.noticeSuccess : styles\.noticeDanger/)
})
