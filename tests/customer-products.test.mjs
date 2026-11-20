import test from 'node:test'
import assert from 'node:assert/strict'
import { CUSTOMER_PRODUCT_OPTIONS, matchCustomerProduct, normalizeCustomerProduct, resolveCustomerProductOptions } from '../lib/customer-products.ts'

test('mantém os dez produtos contratados esperados e normaliza seus cabeçalhos', () => {
  assert.deepEqual(CUSTOMER_PRODUCT_OPTIONS.map(item => item.label), [
    'CT-E', 'APP PEDIDOS', 'NFP-E', 'BOLETO', 'NFSE', 'MDF-E', 'BACKUP', 'LIMITADOR NOTA', 'GARRAX', 'NFCE',
  ])
  assert.equal(normalizeCustomerProduct('Limitador de Notas'), 'LIMITADORDENOTAS')
})

test('associa cada código ao produto único existente no catálogo', () => {
  const catalog = CUSTOMER_PRODUCT_OPTIONS.map((item, index) => ({ id: `product-${index}`, name: item.label, internal_code: item.code, active: true }))
  assert.deepEqual(CUSTOMER_PRODUCT_OPTIONS.map(item => matchCustomerProduct(item.code, catalog)?.id), catalog.map(item => item.id))
  const resolved = resolveCustomerProductOptions(catalog)
  assert.deepEqual(resolved.map(item => item.label), CUSTOMER_PRODUCT_OPTIONS.map(item => item.label))
  assert.deepEqual(resolved.map(item => item.product?.id), catalog.map(item => item.id))
})

test('prioriza o código APP exato sobre uma coincidência de nome', () => {
  const catalog = [
    { id: 'app-canonico', name: 'APP PEDIDOS', internal_code: 'APP', active: true },
    { id: 'app-nome', name: 'APP', internal_code: 'OUTRO', active: true },
  ]
  assert.equal(matchCustomerProduct('APP', catalog)?.id, 'app-canonico')
})

test('desempata códigos internos duplicados usando un único nome canônico', () => {
  const catalog = [
    { id: 'app-codigo', name: 'Aplicativo Garra', internal_code: 'APP', active: true },
    { id: 'app-canonico', name: 'APP PEDIDOS', internal_code: 'APP', active: true },
  ]
  assert.equal(matchCustomerProduct('APP', catalog)?.id, 'app-canonico')
  assert.equal(matchCustomerProduct('APP', catalog.map(item => ({ ...item, name: 'Aplicativo' }))), undefined)
})

test('mantém a coluna histórica APP e associa o internal_code APP ao rótulo APP PEDIDOS', () => {
  const option = CUSTOMER_PRODUCT_OPTIONS.find(item => item.code === 'APP')
  assert.equal(option?.label, 'APP PEDIDOS')
  assert.equal(option?.headers.includes('APP'), true)
  const catalog = [{ id: 'app-pedidos', name: 'APP PEDIDOS', internal_code: 'APP', active: true }]
  assert.equal(matchCustomerProduct('APP', catalog)?.id, 'app-pedidos')
})

test('usa o nome APP quando não há código correspondente e ignora produtos inativos', () => {
  const catalog = [
    { id: 'app-inativo', name: 'APP', internal_code: 'APP', active: false },
    { id: 'app-ativo', name: 'APP', internal_code: null, active: true },
  ]
  assert.equal(matchCustomerProduct('APP', catalog)?.id, 'app-ativo')
  assert.equal(matchCustomerProduct('APP', [catalog[0]]), undefined)
})

test('permite resolver produtos inativos quando existem vínculos que precisam ser filtrados', () => {
  const catalog = [{ id: 'app-inativo', name: 'Aplicativo Garra', internal_code: 'APP', active: false }]
  assert.equal(matchCustomerProduct('APP', catalog), undefined)
  assert.equal(matchCustomerProduct('APP', catalog, true)?.id, 'app-inativo')
  assert.equal(resolveCustomerProductOptions(catalog, true).find(option => option.code === 'APP')?.product?.id, 'app-inativo')
})

test('não escolhe um produto automaticamente quando o catálogo tem correspondência ambígua', () => {
  const matches = [
    { id: 'ct-e-1', name: 'CT-E', active: true },
    { id: 'ct-e-2', name: 'CT-E', active: true },
  ]
  assert.equal(matchCustomerProduct('CT-E', matches), undefined)
})
