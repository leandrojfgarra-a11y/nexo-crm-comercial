import test from 'node:test'
import assert from 'node:assert/strict'
import { CUSTOMER_PAGE_SIZE, getCustomerPagination, parseCustomerPage } from '../lib/customer-pagination.ts'

test('usa 25 registros por página e cobre totais acima do antigo limite de 500', () => {
  assert.equal(CUSTOMER_PAGE_SIZE, 25)
  assert.deepEqual(getCustomerPagination(49, 1207), {
    page: 49,
    pageSize: 25,
    totalCount: 1207,
    totalPages: 49,
    from: 1200,
    to: 1224,
    firstRecord: 1201,
    lastRecord: 1207,
  })
})

test('normaliza páginas inválidas e limita páginas além do total', () => {
  assert.equal(parseCustomerPage(undefined), 1)
  assert.equal(parseCustomerPage('0'), 1)
  assert.equal(parseCustomerPage('2oops'), 1)
  assert.equal(parseCustomerPage(['3', '4']), 3)
  assert.equal(getCustomerPagination(30, 51).page, 3)
})

test('representa corretamente a lista vazia', () => {
  assert.deepEqual(getCustomerPagination(1, 0), {
    page: 1,
    pageSize: 25,
    totalCount: 0,
    totalPages: 1,
    from: 0,
    to: 24,
    firstRecord: 0,
    lastRecord: 0,
  })
})
