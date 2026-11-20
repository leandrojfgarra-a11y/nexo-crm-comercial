export const CUSTOMER_PRODUCT_OPTIONS = [
  { code: 'CT-E', label: 'CT-E', headers: ['CTE'], names: ['CTE'] },
  { code: 'APP', label: 'APP PEDIDOS', headers: ['APP', 'APPPEDIDOS'], names: ['APPPEDIDOS', 'APP'] },
  { code: 'NFP-E', label: 'NFP-E', headers: ['NFPE', 'NFP'], names: ['NFPE', 'NFP'] },
  { code: 'BOLETO', label: 'BOLETO', headers: ['BOLETO'], names: ['BOLETO'] },
  { code: 'NFSE', label: 'NFSE', headers: ['NFSE'], names: ['NFSE'] },
  { code: 'MDF-E', label: 'MDF-E', headers: ['MDFE'], names: ['MDFE'] },
  { code: 'BACKUP', label: 'BACKUP', headers: ['BACKUP'], names: ['BACKUP'] },
  { code: 'LIMITADOR NOTA', label: 'LIMITADOR NOTA', headers: ['LIMITADORNOTA', 'LIMITADORNOTAS', 'LIMITADORDENOTA', 'LIMITADORDENOTAS'], names: ['LIMITADORNOTA', 'LIMITADORNOTAS', 'LIMITADORDENOTA', 'LIMITADORDENOTAS'] },
  { code: 'GARRAX', label: 'GARRAX', headers: ['GARRAX'], names: ['GARRAX'] },
  { code: 'NFCE', label: 'NFCE', headers: ['NFCE'], names: ['NFCE'] },
] as const

export function normalizeCustomerProduct(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export type CustomerProductCatalogItem = { id: string; name: string; internal_code?: string | null; active: boolean }

export function matchCustomerProduct(optionCode: string, products: CustomerProductCatalogItem[], includeInactive = false) {
  const option = CUSTOMER_PRODUCT_OPTIONS.find(item => item.code === optionCode)
  if (!option) return undefined
  const headerNames: readonly string[] = option.names
  const catalogProducts = includeInactive ? products : products.filter(product => product.active)
  const codeMatches = catalogProducts.filter(product => headerNames.includes(normalizeCustomerProduct(product.internal_code ?? '')))
  if (codeMatches.length === 1) return codeMatches[0]
  if (codeMatches.length > 1) {
    const canonicalName = normalizeCustomerProduct(option.label)
    const canonicalNameMatches = codeMatches.filter(product => normalizeCustomerProduct(product.name) === canonicalName)
    return canonicalNameMatches.length === 1 ? canonicalNameMatches[0] : undefined
  }

  const nameMatches = catalogProducts.filter(product => {
    const name = normalizeCustomerProduct(product.name)
    return headerNames.includes(name)
      || (optionCode === 'LIMITADOR NOTA' && /^LIMITADORDENOTAS?$/.test(name))
  })
  if (nameMatches.length === 1) return nameMatches[0]
  if (nameMatches.length > 1) return undefined

  const aliases: readonly string[] = option.names
  const partial = catalogProducts.filter(product => {
    const name = normalizeCustomerProduct(product.name)
    return aliases.some(alias => alias.length >= 4 && name.includes(alias))
  })
  return partial.length === 1 ? partial[0] : undefined
}

export function resolveCustomerProductOptions(products: CustomerProductCatalogItem[], includeInactive = false) {
  return CUSTOMER_PRODUCT_OPTIONS.map(option => ({
    ...option,
    product: matchCustomerProduct(option.code, products, includeInactive),
  }))
}
