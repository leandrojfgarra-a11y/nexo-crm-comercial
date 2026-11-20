import test from 'node:test'
import assert from 'node:assert/strict'
import XLSX from 'xlsx-js-style'
import { buildCustomerPdf, buildCustomerWorkbook, validateSelectedCustomerIds } from '../lib/customer-export.ts'
import { customerSelectionStorageKey, updatePageSelection } from '../lib/customer-selection.ts'
import { collectPagedRows } from '../lib/customer-pagination.ts'

const filters = { searchTerm: '', status: 'all', productCode: null, productLabel: null, scope: 'all' }

function record(overrides = {}) {
  return {
    id: '1', name: 'Cliente', tradeName: null, taxId: '00123456789012', phone: null,
    whatsapp: null, email: null, status: 'active', products: ['BOLETO', 'APP PEDIDOS'],
    monthlyFee: 125.5, billingDay: 10, ...overrides,
  }
}

test('gera planilha com cabeçalho, metadados, uma linha por cliente e células textuais seguras', () => {
  const data = [record({ name: '=HYPERLINK("https://evil.invalid")' }), record({ id: '2', name: 'Sem mensalidade', monthlyFee: null, billingDay: null })]
  const buffer = buildCustomerWorkbook(data, { ...filters, productCode: 'BOLETO', productLabel: 'BOLETO' }, new Date('2026-11-19T12:00:00Z'))
  const workbook = XLSX.read(buffer, { type: 'buffer', cellStyles: true })
  const sheet = workbook.Sheets.Clientes
  assert.equal(sheet.A1.v, 'Relatório de Clientes — Nexo CRM')
  assert.equal(sheet.B4.v, 2)
  assert.equal(sheet.C7.v, '00123456789012')
  assert.equal(sheet.C7.t, 's')
  assert.equal(sheet.A7.v, "'=HYPERLINK(\"https://evil.invalid\")")
  assert.equal(sheet.H7.v, 'BOLETO, APP PEDIDOS')
  assert.equal(sheet.I7.v, 125.5)
  assert.equal(sheet.I8.v, '')
  assert.equal(sheet.J8.v, '')
  assert.equal(sheet['!cols'][0].wch, 30)
  assert.equal(sheet['!autofilter'].ref, 'A6:J8')
  assert.equal(sheet['!ref'], 'A1:J8')
})

test('gera PDF paisagem com título, filtros e várias páginas para muitos registros', async () => {
  const data = Array.from({ length: 350 }, (_, index) => record({
    id: String(index), name: `Cliente ${index} ${'com nome longo '.repeat(6)}`,
    email: `cliente${index}@exemplo.com`, products: ['BOLETO', 'APP PEDIDOS', 'NFSE'],
  }))
  const pdf = await buildCustomerPdf(data, { ...filters, productCode: 'APP', productLabel: 'APP PEDIDOS' }, new Date('2026-11-19T12:00:00Z'))
  const source = pdf.toString('latin1')
  assert.ok(pdf.byteLength > 10_000)
  assert.match(source, /\/MediaBox \[0 0 841\.89 595\.28\]/)
  assert.match(source, /\/Type \/Page\b/)
  assert.match(source, /\/Count [2-9][0-9]*/)
})

test('mantém seleção entre páginas, permite limpar uma página sem perder as demais e separa empresa/filtros', () => {
  let selected = updatePageSelection([], ['cliente-1', 'cliente-2'], true)
  selected = updatePageSelection(selected, ['cliente-26'], true)
  selected = updatePageSelection(selected, ['cliente-2'], false)
  assert.deepEqual(selected.sort(), ['cliente-1', 'cliente-26'])
  assert.notEqual(
    customerSelectionStorageKey('empresa-1', { searchTerm: '', status: 'all', productCode: null }),
    customerSelectionStorageKey('empresa-2', { searchTerm: '', status: 'all', productCode: null }),
  )
  assert.notEqual(
    customerSelectionStorageKey('empresa-1', { searchTerm: '', status: 'all', productCode: null }),
    customerSelectionStorageKey('empresa-1', { searchTerm: '', status: 'all', productCode: 'BOLETO' }),
  )
})

test('busca todos os lotes além do limite de retorno e valida IDs únicos', async () => {
  const pageCalls = []
  const rows = await collectPagedRows(async (from, to) => {
    pageCalls.push([from, to])
    return Array.from({ length: Math.max(0, Math.min(500, 1207 - from)) }, (_, index) => from + index)
  })
  assert.equal(rows.length, 1207)
  assert.deepEqual(pageCalls, [[0, 499], [500, 999], [1000, 1499]])
  assert.equal(validateSelectedCustomerIds(['123e4567-e89b-12d3-a456-426614174000']), true)
  assert.equal(validateSelectedCustomerIds(['123e4567-e89b-12d3-a456-426614174000', '123e4567-e89b-12d3-a456-426614174000']), false)
})
