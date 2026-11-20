export type CustomerExportFilters = {
  searchTerm: string
  status: 'all' | 'active' | 'inactive'
  productCode: string | null
  productLabel: string | null
  scope: 'all' | 'selected'
}

export type CustomerExportRecord = {
  id: string
  name: string
  tradeName: string | null
  taxId: string | null
  phone: string | null
  whatsapp: string | null
  email: string | null
  status: 'active' | 'inactive' | string
  products: string[]
  monthlyFee: number | null
  billingDay: number | null
}
