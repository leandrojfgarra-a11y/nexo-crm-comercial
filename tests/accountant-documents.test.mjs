import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import Module from 'node:module'
import path from 'node:path'
import ts from 'typescript'
import { formatAccountantDocument, formatCnpj, formatCpf, normalizeAccountantDocument } from '../lib/accountant-documents.ts'
import { validCpf, validCnpj } from '../lib/crm-validation.ts'

const identityPath = path.resolve('lib/accountant-identity.ts')
const identitySource = await readFile(identityPath, 'utf8')
const identityCompiled = ts.transpileModule(identitySource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  fileName: identityPath,
}).outputText
const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (parent?.filename === identityPath && request === './accountant-documents') return { normalizeAccountantDocument }
  if (parent?.filename === identityPath && request === './crm-validation') return { validCpf, validCnpj }
  return originalLoad.call(this, request, parent, isMain)
}
const identityModule = new Module(identityPath)
identityModule.filename = identityPath
identityModule.paths = Module._nodeModulePaths(path.dirname(identityPath))
identityModule._compile(identityCompiled, identityPath)
Module._load = originalLoad
const { parseAccountantIdentity } = identityModule.exports

test('Pessoa Física aceita cadastro sem CPF e normaliza CPF opcional', () => {
  assert.deepEqual(parseAccountantIdentity('individual', 'Contador Silva', ''), {
    value: { kind: 'individual', name: 'Contador Silva', taxId: null },
  })
  assert.deepEqual(parseAccountantIdentity('individual', 'Contador Silva', '529.982.247-25'), {
    value: { kind: 'individual', name: 'Contador Silva', taxId: '52998224725' },
  })
  assert.deepEqual(parseAccountantIdentity('individual', 'Contador Silva', '111.111.111-11'), { error: 'tax-invalid' })
})

test('Pessoa Jurídica exige CNPJ válido e mantém CNPJ alfanumérico suportado pelo schema', () => {
  assert.deepEqual(parseAccountantIdentity('office', 'Escritório Alfa', ''), { error: 'tax-required' })
  assert.deepEqual(parseAccountantIdentity('office', 'Escritório Alfa', '11.222.333/0001-81'), {
    value: { kind: 'office', name: 'Escritório Alfa', taxId: '11222333000181' },
  })
  assert.deepEqual(parseAccountantIdentity('office', 'Escritório Alfa', '12.ABC.D34/56EF-68'), {
    value: { kind: 'office', name: 'Escritório Alfa', taxId: '12ABCD3456EF68' },
  })
})

test('máscaras de CPF e CNPJ funcionam para entrada parcial, edição e listagem', () => {
  assert.equal(formatCpf('52998224725'), '529.982.247-25')
  assert.equal(formatCpf('529'), '529')
  assert.equal(formatCnpj('11222333000181'), '11.222.333/0001-81')
  assert.equal(formatCnpj('12abcd3456ef68'), '12.ABC.D34/56EF-68')
  assert.equal(formatAccountantDocument('11222333000181', 'office'), '11.222.333/0001-81')
  assert.equal(normalizeAccountantDocument('12.ABC.D34/56EF-68', 'office'), '12ABCD3456EF68')
  assert.equal(normalizeAccountantDocument('529.982.247-25', 'individual'), '52998224725')
})
