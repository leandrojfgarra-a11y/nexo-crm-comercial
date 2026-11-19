import test from 'node:test'
import assert from 'node:assert/strict'
import { CUSTOMER_PRODUCT_OPTIONS, matchCustomerProduct, normalizeCustomerProduct } from '../lib/customer-products.ts'

test('mantém os dez produtos contratados esperados e normaliza seus cabeçalhos', () => {
  assert.deepEqual(CUSTOMER_PRODUCT_OPTIONS.map(item => item.label), [
    'CT-E', 'APP', 'NFP-E', 'BOLETO', 'NFSE', 'MDF-E', 'BACKUP', 'LIMITADOR NOTA', 'GARRAX', 'NFCE',
  ])
  assert.equal(normalizeCustomerProduct('Limitador de Notas'), 'LIMITADORDENOTAS')
})

test('associa cada código ao produto único existente no catálogo', () => {
  const catalog = CUSTOMER_PRODUCT_OPTIONS.map((item, index) => ({ id: `product-${index}`, name: item.label }))
  assert.deepEqual(CUSTOMER_PRODUCT_OPTIONS.map(item => matchCustomerProduct(item.code, catalog)?.id), catalog.map(item => item.id))
})

test('não escolhe um produto automaticamente quando o catálogo tem correspondência ambígua', () => {
  const matches = [
    { id: 'ct-e-1', name: 'CT-E' },
    { id: 'ct-e-2', name: 'CT-E' },
  ]
  assert.equal(matchCustomerProduct('CT-E', matches), undefined)
})
