import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { safeSearchTerm } from '@/lib/crm-validation'
import { applyCustomerListFilters, collectPagedRows, getCustomerProductScope, type CustomerListFilters } from '@/lib/customer-pagination'
import { CUSTOMER_PRODUCT_OPTIONS, matchCustomerProduct, type CustomerProductCatalogItem } from '@/lib/customer-products'
import type { CustomerExportRecord } from '@/lib/customer-export-types'

const EXPORT_PAGE_SIZE = 500
const CUSTOMER_ID_BATCH_SIZE = 250

export type CustomerSearchFilters = {
  searchTerm: string
  status: 'all' | 'active' | 'inactive'
  productCode: string | null
}

type DbPerson = {
  name: string
  trade_name: string | null
  tax_id: string | null
  phone: string | null
  whatsapp: string | null
  email: string | null
}

type DbCustomer = {
  id: string
  status: string
  monthly_fee?: number | string | null
  billing_day?: number | null
  people: DbPerson | DbPerson[] | null
}

type DbCustomerProduct = {
  customer_id: string
  products: { name: string; company_id: string } | Array<{ name: string; company_id: string }> | null
}

export class CustomerExportDataError extends Error {
  constructor(message: string, readonly status = 500) {
    super(message)
    this.name = 'CustomerExportDataError'
  }
}

export function normalizeCustomerSearchFilters(input: { searchTerm?: unknown; status?: unknown; productCode?: unknown }): CustomerSearchFilters {
  const status = input.status ?? 'all'
  if (status !== 'all' && status !== 'active' && status !== 'inactive') {
    throw new CustomerExportDataError('Situação inválida.', 400)
  }
  if (input.searchTerm != null && typeof input.searchTerm !== 'string') {
    throw new CustomerExportDataError('Pesquisa textual inválida.', 400)
  }
  const requestedProduct = input.productCode ?? ''
  if (typeof requestedProduct !== 'string') throw new CustomerExportDataError('Produto contratado inválido.', 400)
  if (requestedProduct && !CUSTOMER_PRODUCT_OPTIONS.some(option => option.code === requestedProduct)) {
    throw new CustomerExportDataError('Produto contratado inválido.', 400)
  }
  return {
    searchTerm: safeSearchTerm(input.searchTerm ?? ''),
    status,
    productCode: requestedProduct || null,
  }
}

async function loadProductCatalog(supabase: SupabaseClient, companyId: string) {
  const products: CustomerProductCatalogItem[] = []
  for (let from = 0; ; from += EXPORT_PAGE_SIZE) {
    const { data, error } = await supabase.from('products')
      .select('id,name,internal_code,active')
      .eq('company_id', companyId)
      .order('id')
      .range(from, from + EXPORT_PAGE_SIZE - 1)
    if (error) throw new CustomerExportDataError('Não foi possível consultar o catálogo de produtos da empresa.')
    const page = (data ?? []) as CustomerProductCatalogItem[]
    products.push(...page)
    if (page.length < EXPORT_PAGE_SIZE) return products
  }
}

function buildListFilters(companyId: string, searchFilters: CustomerSearchFilters, productId: string | null): CustomerListFilters {
  const term = searchFilters.searchTerm
  const searchFilter = term
    ? `name.ilike.%${term}%,trade_name.ilike.%${term}%,tax_id.ilike.%${term}%,phone.ilike.%${term}%,mobile_phone.ilike.%${term}%,whatsapp.ilike.%${term}%`
    : null
  return {
    companyId,
    status: searchFilters.status,
    searchFilter,
    productScope: getCustomerProductScope(companyId, productId ?? ''),
  }
}

function pageCustomerQuery(supabase: SupabaseClient, filters: CustomerListFilters, monthlyColumnsAvailable: boolean, ids: string[] | null) {
  const productJoin = filters.productScope ? ',customer_products!inner(product_id,company_id)' : ''
  const monthlyColumns = monthlyColumnsAvailable ? ',monthly_fee,billing_day' : ''
  let query = supabase.from('customers')
    .select(`id,status${monthlyColumns},people!inner(name,trade_name,tax_id,phone,whatsapp,email)${productJoin}`)
    .order('created_at', { ascending: false })
    .order('id', { ascending: true })
  query = applyCustomerListFilters(query, filters)
  if (ids) query = query.in('id', ids)
  return query
}

async function loadCustomers(supabase: SupabaseClient, filters: CustomerListFilters, monthlyColumnsAvailable: boolean, selectedIds: string[] | null) {
  const loadPage = (ids: string[] | null) => collectPagedRows(async (from, to) => {
    const { data, error } = await pageCustomerQuery(supabase, filters, monthlyColumnsAvailable, ids).range(from, to)
    if (error) throw new CustomerExportDataError('Não foi possível carregar os clientes para exportação.')
    return (data ?? []) as unknown as DbCustomer[]
  }, EXPORT_PAGE_SIZE)

  if (!selectedIds) return loadPage(null)
  const customers: DbCustomer[] = []
  for (let from = 0; from < selectedIds.length; from += CUSTOMER_ID_BATCH_SIZE) {
    customers.push(...await loadPage(selectedIds.slice(from, from + CUSTOMER_ID_BATCH_SIZE)))
  }
  const found = new Set(customers.map(customer => customer.id))
  if (found.size !== selectedIds.length || selectedIds.some(id => !found.has(id))) {
    throw new CustomerExportDataError('A seleção contém clientes indisponíveis ou fora dos filtros atuais. Atualize a lista e selecione novamente.', 400)
  }
  return customers
}

async function loadCustomerProductNames(supabase: SupabaseClient, companyId: string, customerIds: string[]) {
  const productNames = new Map<string, Set<string>>()
  for (let start = 0; start < customerIds.length; start += CUSTOMER_ID_BATCH_SIZE) {
    const ids = customerIds.slice(start, start + CUSTOMER_ID_BATCH_SIZE)
    for (let from = 0; ; from += EXPORT_PAGE_SIZE) {
      const { data, error } = await supabase.from('customer_products')
        .select('customer_id,products!inner(name,company_id)')
        .eq('company_id', companyId)
        .eq('products.company_id', companyId)
        .in('customer_id', ids)
        .order('customer_id')
        .order('product_id')
        .range(from, from + EXPORT_PAGE_SIZE - 1)
      if (error) throw new CustomerExportDataError('Não foi possível carregar os vínculos de produtos dos clientes.')
      const links = (data ?? []) as unknown as DbCustomerProduct[]
      for (const link of links) {
        const relatedProducts = Array.isArray(link.products) ? link.products : link.products ? [link.products] : []
        for (const product of relatedProducts) {
          if (!product.company_id || product.company_id !== companyId) continue
          const names = productNames.get(link.customer_id) ?? new Set<string>()
          names.add(product.name)
          productNames.set(link.customer_id, names)
        }
      }
      if (links.length < EXPORT_PAGE_SIZE) break
    }
  }
  return productNames
}

export async function loadCustomerExportRecords(
  supabase: SupabaseClient,
  companyId: string,
  inputFilters: CustomerSearchFilters,
  selectedIds: string[] | null,
) {
  const [{ error: monthlySchemaError }, { error: productLinkSchemaError }] = await Promise.all([
    supabase.from('customers').select('monthly_fee,billing_day').limit(0),
    supabase.from('customer_products').select('company_id,customer_id,product_id').limit(0),
  ])
  if (productLinkSchemaError) throw new CustomerExportDataError('Os vínculos de produtos não estão disponíveis para exportação.')

  let productId: string | null = null
  let productLabel: string | null = null
  if (inputFilters.productCode) {
    const catalog = await loadProductCatalog(supabase, companyId)
    const option = CUSTOMER_PRODUCT_OPTIONS.find(item => item.code === inputFilters.productCode)
    const match = matchCustomerProduct(inputFilters.productCode, catalog, true)
    if (!match || !option) throw new CustomerExportDataError('Este produto não tem uma correspondência válida no catálogo da empresa.', 400)
    productId = match.id
    productLabel = option.label
  }

  const listFilters = buildListFilters(companyId, inputFilters, productId)
  const customers = await loadCustomers(supabase, listFilters, !monthlySchemaError, selectedIds)
  const namesByCustomer = await loadCustomerProductNames(supabase, companyId, customers.map(customer => customer.id))
  const records: CustomerExportRecord[] = customers.map(customer => {
    const person = Array.isArray(customer.people) ? customer.people[0] : customer.people
    return {
      id: customer.id,
      name: person?.name ?? '',
      tradeName: person?.trade_name ?? null,
      taxId: person?.tax_id ?? null,
      phone: person?.phone ?? null,
      whatsapp: person?.whatsapp ?? null,
      email: person?.email ?? null,
      status: customer.status,
      products: [...(namesByCustomer.get(customer.id) ?? [])].sort((left, right) => left.localeCompare(right, 'pt-BR')),
      monthlyFee: monthlySchemaError || customer.monthly_fee == null ? null : Number(customer.monthly_fee),
      billingDay: monthlySchemaError ? null : customer.billing_day ?? null,
    }
  })
  return { records, productLabel, monthlyColumnsAvailable: !monthlySchemaError }
}
