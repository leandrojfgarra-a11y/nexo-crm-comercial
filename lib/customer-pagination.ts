export const CUSTOMER_PAGE_SIZE = 25

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
