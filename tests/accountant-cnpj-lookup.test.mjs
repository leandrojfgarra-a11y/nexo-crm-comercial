import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import Module from 'node:module'
import path from 'node:path'
import ts from 'typescript'
import { formatAccountantDocument, normalizeAccountantDocument } from '../lib/accountant-documents.ts'

const lookupPath = path.resolve('lib/accountant-cnpj-lookup.ts')
const lookupSource = await readFile(lookupPath, 'utf8')
const lookupCompiled = ts.transpileModule(lookupSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  fileName: lookupPath,
}).outputText
const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (parent?.filename === lookupPath && request === './accountant-documents') return { formatAccountantDocument, normalizeAccountantDocument }
  return originalLoad.call(this, request, parent, isMain)
}
const lookupModule = new Module(lookupPath)
lookupModule.filename = lookupPath
lookupModule.paths = Module._nodeModulePaths(path.dirname(lookupPath))
lookupModule._compile(lookupCompiled, lookupPath)
Module._load = originalLoad
const { ACCOUNTANT_CNPJ_FIELD_NAMES, mapAccountantCnpjFields, hasAccountantCnpjConflicts, shouldApplyAccountantCnpjField } = lookupModule.exports

test('consulta CNPJ mapeia somente campos presentes no formulário', () => {
  const fields = mapAccountantCnpjFields({
    name: 'Empresa Alfa', trade_name: 'Alfa', tax_id: '12ABCD3456EF68', email: 'contato@alfa.test',
    phone: '1130000000', postal_code: '01001000', address_line: 'Rua A', address_number: '10',
    address_extra: 'Sala 2', district: 'Centro', city: 'São Paulo', state: 'SP',
    partner_data: 'não deve ir para o formulário',
  }, '12ABCD3456EF68')
  assert.deepEqual(Object.keys(fields), [...ACCOUNTANT_CNPJ_FIELD_NAMES])
  assert.equal(fields.tax_id, '12.ABC.D34/56EF-68')
  assert.equal(fields.name, 'Empresa Alfa')
  assert.equal('partner_data' in fields, false)
})

test('consulta não substitui campos preenchidos sem confirmação e permite preencher os vazios', () => {
  const fields = mapAccountantCnpjFields({ name: 'Nome retornado', email: 'novo@alfa.test', tax_id: '11222333000181' }, '11222333000181')
  const current = { name: 'Nome digitado', email: '', tax_id: '11.222.333/0001-81' }
  assert.equal(hasAccountantCnpjConflicts(current, fields), true)
  assert.equal(shouldApplyAccountantCnpjField(current.name, fields.name, false), false)
  assert.equal(shouldApplyAccountantCnpjField(current.email, fields.email, false), true)
  assert.equal(shouldApplyAccountantCnpjField(current.name, fields.name, true), true)
  assert.equal(hasAccountantCnpjConflicts({ tax_id: current.tax_id }, fields), false)
})
