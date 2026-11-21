import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'

const shell = await readFile(new URL('../components/app-shell.tsx', import.meta.url), 'utf8')
const shellStyles = await readFile(new URL('../components/app-shell.module.css', import.meta.url), 'utf8')

function routesFrom(source) {
  const navigation = source.match(/const nav = \[([\s\S]*?)\n\]/)?.[1]
  assert.ok(navigation, 'navigation groups should be declared')
  return [...navigation.matchAll(/\['[^']+',\s*'([^']+)'\]/g)].map(([, route]) => route)
}

test('preserves the published route list and has a small SVG for every destination', () => {
  const published = execFileSync('git', ['show', 'HEAD:components/app-shell.tsx'], { encoding: 'utf8' })
  const routes = routesFrom(shell)
  assert.deepEqual(routes, routesFrom(published))

  const icons = shell.match(/const navIconPaths: Record<string, string> = \{([\s\S]*?)\n\}/)?.[1]
  assert.ok(icons, 'inline icon paths should be declared')
  assert.deepEqual([...icons.matchAll(/^\s*'([^']+)':/gm)].map(([, route]) => route).sort(), [...new Set(routes)].sort())
  assert.match(shell, /<svg aria-hidden="true" focusable="false"/)
})

test('preserves active-route semantics and marks the current link accessibly', () => {
  assert.match(shell, /pathname === href \|\| \(href !== '\/' && pathname\.startsWith\(href\)\)/)
  assert.match(shell, /aria-current=\{active \? 'page' : undefined\}/)
  assert.match(shell, /focus-visible:ring-2/)
})

test('keeps mobile navigation labelled, scrollable and closable', () => {
  assert.match(shell, /aria-controls="nexo-mobile-navigation"/)
  assert.match(shell, /aria-expanded=\{mobileNavOpen\}/)
  assert.match(shell, /role="dialog" aria-modal="true" aria-label="Menu principal"/)
  assert.match(shell, /overflow-y-auto/)
  assert.match(shell, /event\.key === 'Escape'/)
  assert.match(shell, /aria-label="Fechar menu"/)
  assert.match(shell, /mobileNavCloseRef\.current.*\.focus\(\)/)
  assert.match(shell, /onKeyDown=\{handleMobileMenuKeyDown\}/)
  assert.match(shell, /closeMobileMenu\('navigation'\)/)
  assert.match(shell, /mobileNavTriggerRef\.current\?\.focus\(\)/)
})

test('keeps topbar theme colors inside its CSS Module', () => {
  assert.match(shell, /shellStyles\.topbar/)
  assert.doesNotMatch(shell, /className="app-topbar/)
  assert.doesNotMatch(shellStyles, /--topbar-|var\(--border\)/)
  assert.match(shellStyles, /:global\(\.dark-theme\) \.topbar/)
})
