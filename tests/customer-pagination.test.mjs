import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyCustomerListFilters,
  applyCustomerProductFilter,
  CUSTOMER_PAGE_SIZE,
  customerPageHref,
  getCustomerPagination,
  getCustomerProductScope,
  parseCustomerPage,
} from '../lib/customer-pagination.ts'

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

test('escopa o filtro pelo produto e pela empresa sem alterar queries sem produto', () => {
  const calls = []
  const query = { eq(column, value) { calls.push([column, value]); return this } }
  const scope = getCustomerProductScope('empresa-1', 'produto-inativo-2')

  assert.deepEqual(scope, { companyId: 'empresa-1', productId: 'produto-inativo-2' })
  assert.equal(applyCustomerProductFilter(query, scope), query)
  assert.deepEqual(calls, [
    ['customer_products.company_id', 'empresa-1'],
    ['customer_products.product_id', 'produto-inativo-2'],
  ])

  const unfiltered = { eq() { assert.fail('Não deve adicionar filtro sem produto selecionado') } }
  assert.equal(applyCustomerProductFilter(unfiltered, null), unfiltered)
  assert.equal(getCustomerProductScope('empresa-1', ''), null)
})

test('aplica os mesmos filtros combinados à contagem e à página', () => {
  const filters = {
    companyId: 'empresa-1',
    status: 'active',
    searchFilter: 'name.ilike.%Alfa%',
    productScope: getCustomerProductScope('empresa-1', 'produto-2'),
  }
  const makeQuery = () => {
    const calls = []
    return {
      calls,
      eq(column, value) { calls.push(['eq', column, value]); return this },
      or(value, options) { calls.push(['or', value, options]); return this },
    }
  }
  const countQuery = makeQuery()
  const pageQuery = makeQuery()

  applyCustomerListFilters(countQuery, filters)
  applyCustomerListFilters(pageQuery, filters)
  assert.deepEqual(countQuery.calls, pageQuery.calls)
  assert.deepEqual(countQuery.calls, [
    ['eq', 'company_id', 'empresa-1'],
    ['eq', 'status', 'active'],
    ['or', 'name.ilike.%Alfa%', { referencedTable: 'people' }],
    ['eq', 'customer_products.company_id', 'empresa-1'],
    ['eq', 'customer_products.product_id', 'produto-2'],
  ])
})

test('mantém pesquisa, situação e produto ao trocar de página', () => {
  assert.equal(
    customerPageHref(3, { term: 'Loja & Cia', status: 'active', productId: 'produto/42' }),
    '/clientes?q=Loja+%26+Cia&status=active&product=produto%2F42&page=3',
  )
})
