import assert from 'node:assert/strict'
import Module from 'node:module'
import path from 'node:path'
import test from 'node:test'
import ts from 'typescript'
import { readFile } from 'node:fs/promises'

const helperPath = path.resolve('lib/mobile-menu-focus.ts')
const source = await readFile(helperPath, 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
  fileName: helperPath,
}).outputText
const helperModule = new Module(helperPath)
helperModule.filename = helperPath
helperModule.paths = Module._nodeModulePaths(path.dirname(helperPath))
helperModule._compile(compiled, helperPath)
const { getMobileMenuFocusTarget, shouldRestoreMobileMenuFocus } = helperModule.exports

const focusable = (...ids) => ids.map(id => ({ id }))

test('Tab advances normally inside the menu and wraps from the last control to the first', () => {
  const [first, middle, last] = focusable('first', 'middle', 'last')
  assert.equal(getMobileMenuFocusTarget([first, middle, last], middle, false), null)
  assert.equal(getMobileMenuFocusTarget([first, middle, last], last, false), 'first')
})

test('Shift+Tab advances normally inside the menu and wraps from the first control to the last', () => {
  const [first, middle, last] = focusable('first', 'middle', 'last')
  assert.equal(getMobileMenuFocusTarget([first, middle, last], middle, true), null)
  assert.equal(getMobileMenuFocusTarget([first, middle, last], first, true), 'last')
})

test('Tab and Shift+Tab return focus to the menu when it starts outside the dialog', () => {
  const [first, , last] = focusable('first', 'middle', 'last')
  const outside = { id: 'outside' }
  assert.equal(getMobileMenuFocusTarget([first, last], outside, false), 'first')
  assert.equal(getMobileMenuFocusTarget([first, last], outside, true), 'last')
})

test('an empty menu has no focus target so the dialog itself can receive focus', () => {
  assert.equal(getMobileMenuFocusTarget([], null, false), null)
})

test('focus returns to the opener only after dismissal on the same route', () => {
  assert.equal(shouldRestoreMobileMenuFocus({ closeReason: 'dismiss', currentPath: '/clientes', openedPath: '/clientes', triggerAvailable: true }), true)
  assert.equal(shouldRestoreMobileMenuFocus({ closeReason: 'dismiss', currentPath: '/clientes', openedPath: '/clientes', triggerAvailable: false }), false)
  assert.equal(shouldRestoreMobileMenuFocus({ closeReason: 'navigation', currentPath: '/clientes', openedPath: '/clientes', triggerAvailable: true }), false)
  assert.equal(shouldRestoreMobileMenuFocus({ closeReason: 'dismiss', currentPath: '/agenda', openedPath: '/clientes', triggerAvailable: true }), false)
})
