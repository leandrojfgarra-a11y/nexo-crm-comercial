import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import Module from 'node:module'
import path from 'node:path'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'
import { formatAccountantDocument, normalizeAccountantDocument } from '../lib/accountant-documents.ts'
import { validCnpj } from '../lib/crm-validation.ts'

const formPath = path.resolve('components/accountant-form.tsx')
const formSource = await readFile(formPath, 'utf8')
const actionSource = await readFile(path.resolve('app/contadores/actions.ts'), 'utf8')
const pageSource = await readFile(path.resolve('app/contadores/page.tsx'), 'utf8')
const compiled = ts.transpileModule(formSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
  },
  fileName: formPath,
}).outputText
const designSystemPath = path.resolve('components/design-system/index.tsx')
const designSystemSource = await readFile(designSystemPath, 'utf8')
const designSystemCompiled = ts.transpileModule(designSystemSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
  },
  fileName: designSystemPath,
}).outputText
const designSystemModule = new Module(designSystemPath)
designSystemModule.filename = designSystemPath
designSystemModule.paths = Module._nodeModulePaths(path.dirname(designSystemPath))
const loadBeforeDesignSystem = Module._load
Module._load = function (request, parent, isMain) {
  if (parent?.filename === designSystemPath && request === './design-system.module.css') return { scope: 'ds-scope' }
  return loadBeforeDesignSystem.call(this, request, parent, isMain)
}
designSystemModule._compile(designSystemCompiled, designSystemPath)
Module._load = loadBeforeDesignSystem
const cnpjLookupPath = path.resolve('lib/accountant-cnpj-lookup.ts')
const cnpjLookupSource = await readFile(cnpjLookupPath, 'utf8')
const cnpjLookupCompiled = ts.transpileModule(cnpjLookupSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  fileName: cnpjLookupPath,
}).outputText
const cnpjLookupModule = new Module(cnpjLookupPath)
cnpjLookupModule.filename = cnpjLookupPath
cnpjLookupModule.paths = Module._nodeModulePaths(path.dirname(cnpjLookupPath))
const loadBeforeLookup = Module._load
Module._load = function (request, parent, isMain) {
  if (parent?.filename === cnpjLookupPath && request === './accountant-documents') return { formatAccountantDocument, normalizeAccountantDocument }
  return loadBeforeLookup.call(this, request, parent, isMain)
}
cnpjLookupModule._compile(cnpjLookupCompiled, cnpjLookupPath)
Module._load = loadBeforeLookup

let formPending = false
const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (parent?.filename === formPath && request === 'next/link') {
    return { __esModule: true, default: ({ href, children, ...props }) => React.createElement('a', { href, ...props }, children) }
  }
  if (parent?.filename === formPath && request === 'react-dom') return { useFormStatus: () => ({ pending: formPending }) }
  if (parent?.filename === formPath && request === '@/app/contadores/actions') {
    return { saveAccountant: '/mock-accountant-action' }
  }
  if (parent?.filename === formPath && request === '@/components/design-system') return designSystemModule.exports
  if (parent?.filename === formPath && request === '@/lib/accountant-documents') return { formatAccountantDocument, normalizeAccountantDocument }
  if (parent?.filename === formPath && request === '@/lib/crm-validation') return { validCnpj }
  if (parent?.filename === formPath && request === '@/lib/accountant-cnpj-lookup') return cnpjLookupModule.exports
  return originalLoad.call(this, request, parent, isMain)
}

const formModule = new Module(formPath)
formModule.filename = formPath
formModule.paths = Module._nodeModulePaths(path.dirname(formPath))
formModule._compile(compiled, formPath)
Module._load = originalLoad

const { AccountantForm } = formModule.exports
const render = props => renderToStaticMarkup(React.createElement(AccountantForm, props))
const fieldsIn = html => [...html.matchAll(/\bname="([^"]+)"/g)].map(match => match[1])
const fieldTag = (html, name) => html.match(new RegExp(`<input[^>]*name="${name}"[^>]*>|<select[^>]*name="${name}"[^>]*>`))?.[0] ?? ''

test('form renders all existing fields with names consumed by the Server Action', () => {
  const html = render({
    initial: { id: 'accountant-1', name: 'Escritório Alfa', relationship_type: 'partner', kind: 'office', tax_id: '11222333000181' },
    detailsReady: true,
    relationshipReady: true,
  })
  const names = fieldsIn(html)
  const expected = [
    'accountant_id', 'kind', 'name', 'trade_name', 'tax_id', 'relationship_type', 'contact_name',
    'phone', 'mobile_phone', 'whatsapp', 'email', 'postal_code', 'address_line', 'address_number',
    'address_extra', 'district', 'city', 'state', 'active', 'notes',
  ]
  assert.deepEqual(new Set(names), new Set(expected))
  for (const name of expected) {
    if (name === 'accountant_id') assert.match(actionSource, /formData\.get\('accountant_id'\)/)
    else assert.ok(actionSource.includes(`'${name}'`) || actionSource.includes(`get('${name}')`), `Server Action should handle ${name}`)
  }
  assert.match(html, /<form[^>]*action="\/mock-accountant-action"/)
  assert.match(html, /Salvar contabilidade/)
  assert.match(html, /Cancelar/)
  assert.match(fieldTag(html, 'tax_id'), /required=""/)
  assert.match(fieldTag(html, 'tax_id'), /value="11\.222\.333\/0001-81"/)
})

test('schema-gated controls and CEP feedback remain present', () => {
  const html = render({ initial: {}, detailsReady: false, relationshipReady: false })
  assert.match(fieldTag(html, 'trade_name'), /disabled=""/)
  assert.match(fieldTag(html, 'relationship_type'), /disabled=""/)
  assert.match(fieldTag(html, 'postal_code'), /disabled=""/)
  assert.doesNotMatch(fieldTag(html, 'tax_id'), /required=""/)
  assert.match(html, /Consultar CEP/)
  assert.match(html, /accountant_relationship_type\.sql/)
  assert.match(formSource, /onClick=\{lookupCep\}/)
  assert.match(formSource, /loading=\{pending\}/)
  assert.match(formSource, /aria-live="polite"/)
  assert.match(formSource, /onClick=\{lookupCnpj\}/)
  assert.match(formSource, /fetch\(`\/api\/lookups\/cnpj\?cnpj=/)
  assert.doesNotMatch(formSource, /useEffect\(/)
})

test('Contadores page does not rely on unpublished compact props or shared visual tokens', () => {
  assert.doesNotMatch(pageSource, /<PageHeader\s+compact/)
  assert.doesNotMatch(pageSource, /<Panel\b|\bPanel,\s*table,\s*th,\s*td/)
  assert.match(pageSource, /import styles from '\.\/accountants\.module\.css'/)
  assert.doesNotMatch(pageSource, /var\(--(?:surface|border|text|primary|text-muted)/)
})

test('submit action shows the saving state and disables repeat submission', () => {
  formPending = true
  const html = render({ initial: {}, detailsReady: true, relationshipReady: true })
  formPending = false
  assert.match(html, /aria-busy="true"/)
  assert.match(html, /disabled=""[^>]*class="[^"]*inline-flex/)
  assert.match(html, /Salvando/)
})
