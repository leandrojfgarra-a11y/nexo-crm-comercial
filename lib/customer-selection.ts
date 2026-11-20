import type { CustomerExportFilters } from '@/lib/customer-export-types'

export function updatePageSelection(currentIds: string[], pageIds: string[], selected: boolean) {
  const next = new Set(currentIds)
  for (const id of pageIds) {
    if (selected) next.add(id)
    else next.delete(id)
  }
  return [...next]
}

export function customerSelectionStorageKey(companyId: string, filters: Pick<CustomerExportFilters, 'searchTerm' | 'status' | 'productCode'>) {
  return `nexo-customer-selection:${companyId}:${JSON.stringify([filters.searchTerm, filters.status, filters.productCode])}`
}
