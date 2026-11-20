import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyCnpjLookupFailure } from '../lib/cnpj-lookup-failure.ts'

test('retorna não encontrado somente quando todas as fontes públicas retornam 404', () => {
  assert.deepEqual(classifyCnpjLookupFailure([
    { provider: 'BrasilAPI', status: 404 },
    { provider: 'Minha Receita', status: 404 },
    { provider: 'CNPJ.ws', status: 404 },
  ]), { status: 404, error: 'CNPJ não encontrado nas fontes públicas consultadas.' })
})

test('mantém indisponibilidade distinta de timeout e mistura de respostas', () => {
  const failure = classifyCnpjLookupFailure([
    { provider: 'BrasilAPI', status: null, error: 'timeout' },
    { provider: 'Minha Receita', status: 503, error: 'HTTP 503' },
  ])
  assert.equal(failure.status, 503)
  assert.match(failure.error, /timeout/)
  assert.match(failure.error, /HTTP 503/)
})
