export const CUSTOMER_PAGE_SIZE = 25

export type CustomerProductScope = {
  companyId: string
  productId: string
}

/** Reusable tenant-scoped product filter for customer-rooted PostgREST queries. */
export function getCustomerProductScope(companyId: string, productId: string): CustomerProductScope | null {
  return productId ? { companyId, productId } : null
}

type CustomerFilterQuery = {
  eq: (column: string, value: string) => CustomerFilterQuery
  or: (filters: string, options: { referencedTable: string }) => CustomerFilterQuery
}

export function applyCustomerProductFilter<Query>(query: Query, scope: CustomerProductScope | null): Query {
  if (!scope) return query
  const filterableQuery = query as unknown as CustomerFilterQuery
  return filterableQuery
    .eq('customer_products.company_id', scope.companyId)
    .eq('customer_products.product_id', scope.productId) as unknown as Query
}

export type CustomerListFilters = {
  companyId: string
  status: string
  searchFilter: string | null
  productScope: CustomerProductScope | null
}

/** Apply identical tenant and user filters to count, page, and future report queries. */
export function applyCustomerListFilters<Query>(query: Query, filters: CustomerListFilters): Query {
  const filterableQuery = query as unknown as CustomerFilterQuery
  let filteredQuery = filterableQuery.eq('company_id', filters.companyId)
  if (filters.status !== 'all') filteredQuery = filteredQuery.eq('status', filters.status)
  if (filters.searchFilter) filteredQuery = filteredQuery.or(filters.searchFilter, { referencedTable: 'people' })
  return applyCustomerProductFilter(filteredQuery, filters.productScope) as unknown as Query
}

export function customerPageHref(page: number, filters: { term: string; status: string; productCode: string }) {
  const params = new URLSearchParams()
  if (filters.term) params.set('q', filters.term)
  if (filters.status !== 'all') params.set('status', filters.status)
  if (filters.productCode) params.set('product', filters.productCode)
  params.set('page', String(page))
  return `/clientes?${params.toString()}`
}

export function parseCustomerPage(value?: string | string[]) {
  const raw = Array.isArray(value) ? value[0] : value
  if (!raw || !/^\d+$/.test(raw)) return 1
  const page = Number(raw)
  return Number.isSafeInteger(page) && page > 0 ? page : 1
}

export function getCustomerPagination(requestedPage: number, totalCount: number) {
  const totalPages = Math.max(1, Math.ceil(totalCount / CUSTOMER_PAGE_SIZE))
  const page = Math.min(Math.max(1, requestedPage), totalPages)
  const from = (page - 1) * CUSTOMER_PAGE_SIZE
  return {
    page,
    pageSize: CUSTOMER_PAGE_SIZE,
    totalCount,
    totalPages,
    from,
    to: from + CUSTOMER_PAGE_SIZE - 1,
    firstRecord: totalCount === 0 ? 0 : from + 1,
    lastRecord: Math.min(from + CUSTOMER_PAGE_SIZE, totalCount),
  }
}
