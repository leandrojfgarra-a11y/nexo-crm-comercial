import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const page = await readFile(new URL('../app/clientes/page.tsx', import.meta.url), 'utf8')
const styles = await readFile(new URL('../app/clientes/customers.module.css', import.meta.url), 'utf8')

test('cartões usam os mesmos clientes carregados e mantêm campos opcionais seguros', () => {
  assert.match(page, /className=\{styles\.mobileCustomerCards\}/)
  assert.match(page, /customers\.map\(customer =>/)
  assert.match(page, /formatTaxId\(person\.tax_id\)/)
  assert.match(page, /\{displayPhone &&/)
  assert.match(page, /\{person\.email &&/)
  assert.match(styles, /\.mobileCustomerDetails dd[^\n]*overflow-wrap: anywhere/)
})

test('cartões mantêm ações da listagem e condicionam WhatsApp a telefone válido', () => {
  assert.match(page, /phoneForWhatsApp\(person\.whatsapp \|\| person\.mobile_phone \|\| person\.phone/)
  assert.match(page, /\{whatsappHref && <a href=\{whatsappHref\}/)
  assert.match(page, /href=\{`\/clientes\/\$\{customer\.id\}`} className=\{styles\.mobileCustomerName\}/)
  assert.match(page, /href=\{`\/clientes\/\$\{customer\.id\}\/editar`\}/)
  assert.match(page, /<SelectCustomerRow customerId=\{customer\.id\}/)
  assert.doesNotMatch(page, /customers\.map\(customer => \{[\s\S]{0,220}role="admin"/)
})

test('apresentação troca para a tabela exatamente a partir de 768 px', () => {
  assert.match(styles, /@media \(min-width: 768px\)\s*\{\s*\.mobileCustomerCards \{ display: none; \}\s*\.desktopCustomerTable \{ display: block; \}/)
  assert.match(styles, /\.desktopCustomerTable \{ display: none; \}/)
  assert.match(styles, /:global\(\.dark-theme\) \.mobileCustomerCard/)
  assert.match(styles, /\.mobileCustomerActions :global\(\.btn-base\) \{ min-height: 40px; \}/)
})
