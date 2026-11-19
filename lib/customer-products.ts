export const CUSTOMER_PRODUCT_OPTIONS = [
  { code: 'CT-E', label: 'CT-E', headers: ['CTE'], names: ['CTE'] },
  { code: 'APP', label: 'APP', headers: ['APP'], names: ['APP'] },
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

export type CustomerProductCatalogItem = { id: string; name: string; internal_code?: string | null }

export function matchCustomerProduct(optionCode: string, products: CustomerProductCatalogItem[]) {
  const option = CUSTOMER_PRODUCT_OPTIONS.find(item => item.code === optionCode)
  if (!option) return undefined
  const headerNames: readonly string[] = option.names
  const exact = products.filter(product => {
    const code = normalizeCustomerProduct(product.internal_code ?? '')
    const name = normalizeCustomerProduct(product.name)
    return headerNames.includes(code) || headerNames.includes(name)
      || (optionCode === 'LIMITADOR NOTA' && /^LIMITADORDENOTAS?$/.test(name))
  })
  if (exact.length === 1) return exact[0]
  if (exact.length > 1) return undefined
  const aliases: readonly string[] = option.names
  const partial = products.filter(product => {
    const name = normalizeCustomerProduct(product.name)
    return aliases.some(alias => alias.length >= 4 && name.includes(alias))
  })
  return partial.length === 1 ? partial[0] : undefined
}
