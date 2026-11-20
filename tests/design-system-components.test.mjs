import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import Module from 'node:module'
import path from 'node:path'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'

const componentPath = path.resolve('components/design-system/index.tsx')
const source = await readFile(componentPath, 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
  },
  fileName: componentPath,
}).outputText
const componentModule = new Module(componentPath)
componentModule.filename = componentPath
componentModule.paths = Module._nodeModulePaths(path.dirname(componentPath))
const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (parent?.filename === componentPath && request === './design-system.module.css') return { scope: 'ds-scope' }
  return originalLoad.call(this, request, parent, isMain)
}
componentModule._compile(compiled, componentPath)
Module._load = originalLoad
const ui = componentModule.exports

const render = element => renderToStaticMarkup(element)

test('exports the complete set of reusable design system components', () => {
  for (const name of ['FormField', 'FormSection', 'FormTabs', 'FormActions', 'AppButton', 'AppInput', 'AppSelect', 'AppTextarea', 'FilterBar', 'MetricCard', 'EmptyState']) {
    assert.equal(typeof ui[name], 'function', `${name} must be exported`)
  }
})

test('design system supplies local token scope and a dark theme override', async () => {
  const css = await readFile(path.resolve('components/design-system/design-system.module.css'), 'utf8')
  assert.match(css, /--surface: var\(--color-surface/)
  assert.match(css, /--primary: var\(--color-blue/)
  assert.match(css, /:global\(\.dark-theme\) \.scope/)
})

test('FormField links label, hint and validation message accessibly', () => {
  const html = render(React.createElement(ui.FormField, {
    label: 'E-mail', hint: 'Informe o e-mail comercial.', error: 'E-mail inválido.', required: true,
    control: React.createElement(ui.AppInput, { type: 'email', name: 'email' }),
  }))
  const input = html.match(/<input[^>]*>/)?.[0] ?? ''
  const id = input.match(/id="([^"]+)"/)?.[1]
  assert.ok(id)
  assert.match(html, new RegExp(`<label for="${id}"`))
  assert.match(input, /aria-invalid="true"/)
  assert.match(input, /aria-describedby="[^"]+-hint [^"]+-error"/)
  assert.match(html, /role="alert"/)
  assert.match(html, /aria-required="true"/)
})

test('AppButton exposes disabled and loading states', () => {
  const html = render(React.createElement(ui.AppButton, { loading: true, loadingText: 'Salvando' }, 'Salvar'))
  assert.match(html, /disabled=""/)
  assert.match(html, /aria-busy="true"/)
  assert.match(html, /Salvando/)
})

test('form primitives render responsive sections, tabs and action regions', () => {
  const html = render(React.createElement(ui.FormSection, { title: 'Dados básicos', description: 'Informações principais.' },
    React.createElement(ui.FormTabs, {
      tabs: [
        { value: 'general', label: 'Geral', content: React.createElement('p', null, 'Conteúdo geral') },
        { value: 'contact', label: 'Contato', content: React.createElement('p', null, 'Conteúdo contato') },
      ], value: 'general', onValueChange() {},
    }),
    React.createElement(ui.FormActions, null, React.createElement(ui.AppButton, null, 'Salvar')),
  ))
  assert.match(html, /Dados básicos/)
  assert.match(html, /role="tablist"/)
  assert.match(html, /role="tabpanel"/)
  assert.match(html, /Conteúdo geral/)
  assert.match(html, /Salvar/)
})

test('filters, metrics and empty states expose their content and semantics', () => {
  const html = render(React.createElement(React.Fragment, null,
    React.createElement(ui.FilterBar, { 'aria-label': 'Filtros de clientes' }, React.createElement(ui.AppInput, { name: 'query' })),
    React.createElement(ui.MetricCard, { label: 'Ativos', value: 12, detail: 'Na empresa atual' }),
    React.createElement(ui.EmptyState, { title: 'Nenhum registro', description: 'Ajuste os filtros.' }),
  ))
  assert.match(html, /aria-label="Filtros de clientes"/)
  assert.match(html, /role="search"/)
  assert.match(html, /Ativos/)
  assert.match(html, /12/)
  assert.match(html, /role="status"/)
  assert.match(html, /Nenhum registro/)
})

test('form tab keyboard navigation wraps and supports Home and End', () => {
  assert.equal(ui.nextFormTabIndex(0, 'ArrowLeft', 3), 2)
  assert.equal(ui.nextFormTabIndex(2, 'ArrowRight', 3), 0)
  assert.equal(ui.nextFormTabIndex(1, 'Home', 3), 0)
  assert.equal(ui.nextFormTabIndex(0, 'End', 3), 2)
  assert.equal(ui.nextFormTabIndex(0, 'Escape', 3), null)
  assert.equal(ui.nextFormTabIndex(0, 'ArrowRight', 0), null)
})
