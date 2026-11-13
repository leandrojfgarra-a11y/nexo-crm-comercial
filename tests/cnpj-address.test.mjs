import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeCnpj, normalizeCnpjWs, mergeMissingAddress, mergeMissingFields } from '../lib/cnpj-normalization.ts'
import { applyLookupValues } from '../lib/apply-lookup-values.ts'

function fakeForm(initialValues = {}) {
  const fields = new Map(Object.entries(initialValues).map(([name, value]) => [name, {
    value,
    disabled: false,
    events: [],
    dispatchEvent(event) { this.events.push(event.type); return true },
  }]))
  return {
    fields,
    elements: { namedItem(name) { return fields.get(name) ?? null } },
  }
}

test('normaliza número e logradouro e ignora complemento mascarado', () => {
  const normalized = normalizeCnpj({ numero: 153, logradouro: 'R JOSE DOS ANJOS', complemento: '********' }, '45250114000128')
  assert.equal(normalized.address_number, '153')
  assert.equal(normalized.address_line, 'R JOSE DOS ANJOS')
  assert.equal(normalized.address_extra, null)
})

test('completa campos de endereço ausentes com fallback sem substituir dados existentes', () => {
  const primary = normalizeCnpj({ cep: '36091205', bairro: 'CACHOEIRA', municipio: 'JUIZ DE FORA', uf: 'MG' }, '45250114000128')
  const fallback = normalizeCnpj({ numero: '153', logradouro: 'R JOSE DOS ANJOS', complemento: '********' }, '45250114000128')
  const merged = mergeMissingAddress(primary, fallback)
  assert.equal(merged.address_number, '153')
  assert.equal(merged.address_line, 'R JOSE DOS ANJOS')
  assert.equal(merged.address_extra, null)

  const form = fakeForm({ address_line: '', address_number: '', address_extra: 'Complemento digitado', postal_code: '36091205' })
  const filled = applyLookupValues(form, merged, false)
  assert.equal(form.fields.get('address_line').value, 'R JOSE DOS ANJOS')
  assert.equal(form.fields.get('address_number').value, '153')
  assert.equal(form.fields.get('address_extra').value, 'Complemento digitado')
  assert.equal(form.fields.get('address_line').events.join(','), 'input,change')
  assert.ok(filled >= 2)
})

test('consulta de CEP não apaga número ou complemento ausentes na resposta', () => {
  const form = fakeForm({ address_line: 'R JOSE DOS ANJOS', address_number: '153', address_extra: 'Fundos', postal_code: '36091205' })
  applyLookupValues(form, { postal_code: '36091205', address_line: null, address_number: null, address_extra: null }, true)
  assert.equal(form.fields.get('address_number').value, '153')
  assert.equal(form.fields.get('address_extra').value, 'Fundos')
  assert.equal(form.fields.get('address_line').value, 'R JOSE DOS ANJOS')
})

test('integra o fixture conhecido do CNPJ e aplica os campos ao formulário', () => {
  const cnpj = '45250114000128'
  const primary = normalizeCnpj({ razao_social: 'PATRICIA APARECIDA DE ASSIS PEREIRA 03688102673', cep: '36091205', bairro: 'CACHOEIRA', municipio: 'JUIZ DE FORA', uf: 'MG' }, cnpj)
  const secondary = normalizeCnpjWs({
    razao_social: 'PATRICIA APARECIDA DE ASSIS PEREIRA 03688102673',
    estabelecimento: {
      cnpj, nome_fantasia: 'CASA DE CARNE BORGES', telefone1: '98211964', ddd1: '32',
      email: 'PATRICIAJF31@GMAIL.COM', cep: '36091205', tipo_logradouro: 'R',
      logradouro: 'R JOSE DOS ANJOS', numero: 153, complemento: '********',
      bairro: 'CACHOEIRA', cidade: { nome: 'JUIZ DE FORA' }, estado: { sigla: 'MG' },
      situacao_cadastral: 'ATIVA', data_inicio_atividade: '2020-01-01',
      atividade_principal: { id: '4781-4/00', descricao: 'Comércio varejista de carnes' },
    },
  }, cnpj)
  const normalized = mergeMissingFields(primary, secondary.fields)
  assert.equal(normalized.name, 'PATRICIA APARECIDA DE ASSIS PEREIRA 03688102673')
  assert.equal(normalized.trade_name, 'CASA DE CARNE BORGES')
  assert.equal(normalized.tax_id, cnpj)
  assert.equal(normalized.phone, '3298211964')
  assert.equal(normalized.email, 'PATRICIAJF31@GMAIL.COM')
  assert.equal(normalized.address_line, 'R JOSE DOS ANJOS')
  assert.equal(normalized.address_number, '153')
  assert.equal(normalized.address_extra, null)
  assert.equal(normalized.postal_code, '36091205')
  assert.equal(normalized.district, 'CACHOEIRA')
  assert.equal(normalized.city, 'JUIZ DE FORA')
  assert.equal(normalized.state, 'MG')

  const form = fakeForm(Object.fromEntries(['name','trade_name','tax_id','phone','email','postal_code','address_line','address_number','address_extra','district','city','state'].map(key => [key, ''])))
  applyLookupValues(form, normalized, false)
  for (const key of ['name','trade_name','tax_id','phone','email','postal_code','address_line','address_number','district','city','state']) assert.equal(form.fields.get(key).value, normalized[key])
  assert.equal(form.fields.get('address_extra').value, '')
  assert.ok(secondary.inscriptions.length === 0)
})
