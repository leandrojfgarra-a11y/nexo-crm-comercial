import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { safeSearchTerm } from '@/lib/crm-validation'
import { PageHeader, Panel, table, th, td } from '@/components/ui'
import { resolveTenantContext } from '@/lib/tenant/context'
import { applyCustomerListFilters, customerPageHref, getCustomerPagination, getCustomerProductScope, parseCustomerPage } from '@/lib/customer-pagination'
import { resolveCustomerProductOptions, type CustomerProductCatalogItem } from '@/lib/customer-products'
import { CustomerExportToolbar, CustomerSelectionProvider, SelectAllCustomersOnPage, SelectCustomerRow } from '@/components/customer-selection'
import styles from './customers.module.css'

type SearchParamValue = string | string[] | undefined
type SearchParams = Promise<{ q?: SearchParamValue; status?: SearchParamValue; product?: SearchParamValue; page?: SearchParamValue; notice?: SearchParamValue; customer?: SearchParamValue }>
type Person = { id: string; kind: string; name: string; trade_name: string | null; tax_id: string | null; email: string | null; phone: string | null; mobile_phone: string | null; whatsapp: string | null }
type CustomerRow = { id: string; person_id: string; status: string; since: string; people: Person | Person[] | null }
const firstSearchParam = (value: SearchParamValue) => Array.isArray(value) ? value[0] ?? '' : value ?? ''
const phoneForWhatsApp = (value: string) => {
  let digits = value.replace(/\D/g, '')
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`
  return digits.length >= 12 && digits.length <= 15 ? digits : ''
}
const statusLabels: Record<string, string> = { active: 'Ativo', inactive: 'Inativo' }
const statusColors: Record<string, string> = { active: 'bg-emerald-50 text-emerald-800', inactive: 'bg-slate-100 text-slate-700' }

export default async function CustomersPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const queryText = firstSearchParam(params.q)
  const statusParam = firstSearchParam(params.status)
  const requestedProductCode = firstSearchParam(params.product)
  const noticeParam = firstSearchParam(params.notice)
  const customerParam = firstSearchParam(params.customer)
  const term = safeSearchTerm(queryText)
  const status = ['active', 'inactive'].includes(statusParam) ? statusParam : 'all'
  const supabase = await createAdminClient()
  const { companyId } = await resolveTenantContext(supabase)
  const products: CustomerProductCatalogItem[] = []
  let productError: { message: string } | null = null
  for (let from = 0; ; from += 1000) {
    const result = await supabase.from('products')
      .select('id,name,internal_code,active').eq('company_id', companyId).order('id').range(from, from + 999)
    if (result.error) {
      productError = result.error
      break
    }
    const rows = (result.data ?? []) as CustomerProductCatalogItem[]
    products.push(...rows)
    if (rows.length < 1000) break
  }
  const productOptions = resolveCustomerProductOptions(products, true)
  const selectedOption = productOptions.find(option => option.code === requestedProductCode)
  const selectedProduct = selectedOption?.product
  const productId = selectedProduct?.id ?? ''
  const productCode = selectedProduct?.id ? selectedOption?.code ?? '' : ''
  const invalidProduct = Boolean(requestedProductCode && !selectedProduct)
  const productScope = getCustomerProductScope(companyId, productId)

  const searchFilter = term
    ? `name.ilike.%${term}%,trade_name.ilike.%${term}%,tax_id.ilike.%${term}%,phone.ilike.%${term}%,mobile_phone.ilike.%${term}%,whatsapp.ilike.%${term}%`
    : null
  const listFilters = { companyId, status, searchFilter, productScope }
  const productRelation = productScope ? ',customer_products!inner(product_id,company_id)' : ''
  let countQuery = supabase.from('customers').select(`id,people!inner(id)${productRelation}`, { count: 'exact', head: true })
  countQuery = applyCustomerListFilters(countQuery, listFilters)
  const countResult = productError || invalidProduct
    ? { count: 0, error: productError }
    : await countQuery
  const { count, error: countError } = countResult

  const totalCount = countError ? 0 : count ?? 0
  const pagination = getCustomerPagination(parseCustomerPage(params.page), totalCount)
  let customerQuery = supabase.from('customers')
    .select(`id,person_id,status,since,people!inner(id,kind,name,trade_name,tax_id,email,phone,mobile_phone,whatsapp)${productRelation}`)
    .order('created_at', { ascending: false })
  customerQuery = applyCustomerListFilters(customerQuery, listFilters)
  const customerResult = countError
    ? { data: null, error: countError }
    : productError || invalidProduct
      ? { data: [], error: productError }
      : await customerQuery.range(pagination.from, pagination.to)
  const { data: customerData, error: queryError } = customerResult
  const customerError = Boolean(productError || countError || queryError)
  const customers = (customerData ?? []) as unknown as CustomerRow[]
  const noticeText: Record<string, string> = {
    'customer-created': 'Cliente cadastrado. Confira a ficha 360°.',
    'customer-updated': 'Cadastro atualizado.',
    'customer-created-schema-pending': 'Cliente salvo com os campos atuais. Os dados fiscais e vínculos estão pendentes da migration complementar.',
    'customer-updated-schema-pending': 'Cadastro atualizado com os campos disponíveis. Dados fiscais e vínculos seguem pendentes da migration complementar.',
    'lead-converted': 'Lead convertido em cliente.',
  }
  const notice = noticeParam ? noticeText[noticeParam] ?? noticeParam : null
  const noticeIsSuccess = ['customer-created', 'customer-updated', 'customer-created-schema-pending', 'customer-updated-schema-pending', 'lead-converted'].includes(noticeParam)
  const exportFilters = { searchTerm: term, status: status as 'all' | 'active' | 'inactive', productCode: productCode || null }
  const visibleCustomerIds = customers.map(customer => customer.id)

  return (
    <CustomerSelectionProvider companyId={companyId} filters={exportFilters}>
    <div className={styles.customerList}>
      <PageHeader eyebrow="Relacionamento" title="Clientes" subtitle="Pesquise e acompanhe os cadastros comerciais de pessoas físicas e jurídicas." action="Novo cliente" href="/clientes/novo" />
      <div className="-mt-3 mb-5 flex justify-end"><Link href="/clientes/importar" className="btn-base btn-secondary btn-sm">Importar clientes históricos</Link></div>
      {notice && <p role={noticeIsSuccess ? 'status' : 'alert'} className={`msg-base mt-4 ${noticeIsSuccess ? 'msg-success' : 'msg-danger'}`}>{notice}{customerParam && <Link className="ml-2 font-semibold underline" href={`/clientes/${customerParam}`}>Abrir ficha 360°</Link>}</p>}
      <Panel title="Clientes cadastrados" aside={countError ? 'Total indisponível' : `${totalCount} registros`}>
        <CustomerExportToolbar filters={exportFilters} totalCount={totalCount} />
        <form method="get" className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <label className="flex flex-col gap-1 text-sm font-medium text-ink sm:col-span-2 lg:col-span-2">
            Nome, CPF/CNPJ, telefone ou WhatsApp
            <input name="q" defaultValue={queryText} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-blue focus:ring-2 focus:ring-blue/15" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-ink sm:col-span-1 lg:col-span-1">
            Situação
            <select name="status" defaultValue={status} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-blue focus:ring-2 focus:ring-blue/15">
              <option value="all">Todos</option>
              <option value="active">Ativos</option>
              <option value="inactive">Inativos</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-ink sm:col-span-1 lg:col-span-1">
            Produto contratado
            <select name="product" defaultValue={requestedProductCode} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-blue focus:ring-2 focus:ring-blue/15">
              <option value="">Todos os produtos</option>
              {productOptions.map(option => <option key={option.code} value={option.code} disabled={!option.product}>{option.label}{option.product ? '' : ' (indisponível)'}</option>)}
              {invalidProduct && !selectedOption && <option value={requestedProductCode} disabled>Produto indisponível</option>}
            </select>
          </label>
          <button className="self-end btn-base btn-primary btn-md">Pesquisar</button>
        </form>
        {customerError ? (
          <p role="alert" className="msg-base mt-4 msg-danger">Não foi possível carregar os clientes. Verifique a sessão administrativa e o schema.</p>
        ) : !customers.length ? (
          <p className="p-6 text-center text-sm text-muted">Nenhum cliente encontrado. Ajuste os filtros ou cadastre um novo cliente.</p>
        ) : (
          <>
          <div className={styles.mobileCustomerCards} aria-label="Clientes">
            {customers.map(customer => {
              const person = Array.isArray(customer.people) ? customer.people[0] : customer.people
              if (!person) return null
              const phone = phoneForWhatsApp(person.whatsapp || person.mobile_phone || person.phone || '')
              const displayPhone = person.phone || person.mobile_phone || person.whatsapp
              const whatsappHref = phone ? `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(`Olá, ${person.trade_name || person.name}! Aqui é da Garra Automação. Podemos conversar?`)}` : null
              return (
                <article key={customer.id} className={styles.mobileCustomerCard}>
                  <div className={styles.mobileCustomerHeading}>
                    <SelectCustomerRow customerId={customer.id} customerName={person.trade_name || person.name} />
                    <div className={styles.mobileCustomerIdentity}>
                      <Link href={`/clientes/${customer.id}`} className={styles.mobileCustomerName}>{person.name}</Link>
                      {person.trade_name && <p className={styles.mobileCustomerTradeName}>{person.trade_name}</p>}
                    </div>
                    <span className={`${styles.mobileCustomerStatus} ${statusColors[customer.status] ?? statusColors.active}`}>{statusLabels[customer.status] ?? customer.status}</span>
                  </div>
                  <dl className={styles.mobileCustomerDetails}>
                    <div><dt>CPF/CNPJ</dt><dd>{formatTaxId(person.tax_id) || '—'}</dd></div>
                    <div><dt>Tipo</dt><dd>{person.kind === 'individual' ? 'Pessoa física' : 'Pessoa jurídica'}</dd></div>
                    {displayPhone && <div><dt>Telefone</dt><dd><a href={`tel:${displayPhone.replace(/[^\d+]/g, '')}`}>{displayPhone}</a></dd></div>}
                    {person.email && <div><dt>E-mail</dt><dd><a href={`mailto:${person.email}`}>{person.email}</a></dd></div>}
                  </dl>
                  <div className={styles.mobileCustomerActions}>
                    <Link href={`/clientes/${customer.id}`} className="btn-base btn-secondary btn-sm">Ficha 360°</Link>
                    <Link href={`/clientes/${customer.id}/editar`} className="btn-base btn-secondary btn-sm">Editar</Link>
                    {whatsappHref && <a href={whatsappHref} target="_blank" rel="noopener noreferrer" data-nexo-whatsapp-link="true" className="btn-base btn-success btn-sm">WhatsApp</a>}
                  </div>
                </article>
              )
            })}
          </div>
          <div className={styles.desktopCustomerTable}>
          <div className="overflow-x-auto">
            <table className={`${table} w-full min-w-[900px]`}>
              <thead>
                <tr>
                  <th className={th}>
                    <div className="flex items-center gap-2">
                      <SelectAllCustomersOnPage customerIds={visibleCustomerIds} />
                      <span>Cliente</span>
                    </div>
                  </th>
                  {['Tipo', 'CPF/CNPJ', 'Contato', 'Situação', 'Ações'].map(col => <th key={col} className={th}>{col}</th>)}
                </tr>
              </thead>
              <tbody>
                {customers.map(customer => {
                  const person = Array.isArray(customer.people) ? customer.people[0] : customer.people
                  if (!person) return null
                  const phone = phoneForWhatsApp(person.whatsapp || person.mobile_phone || person.phone || '')
                  const whatsappHref = phone ? `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(`Olá, ${person.trade_name || person.name}! Aqui é da Garra Automação. Podemos conversar?`)}` : null
                  return (
                    <tr key={customer.id} className="border-t border-slate-100 hover:bg-slate-50/50 transition-colors">
                      <td className={`${td} font-semibold`}>
                        <SelectCustomerRow customerId={customer.id} customerName={person.trade_name || person.name} />
                        <Link href={`/clientes/${customer.id}`} className="font-semibold text-blue hover:underline">{person.name}</Link>
                        {person.trade_name && <span className="block text-xs font-normal text-muted">{person.trade_name}</span>}
                      </td>
                      <td className={td}>{person.kind === 'individual' ? 'Pessoa física' : 'Pessoa jurídica'}</td>
                      <td className={`${td} font-mono text-xs`}>{formatTaxId(person.tax_id) || '—'}</td>
                      <td className={td}>{[person.phone, person.whatsapp, person.email].filter(Boolean).join(' · ') || '—'}</td>
                      <td className={td}>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusColors[customer.status] ?? statusColors.active}`}>{customer.status === 'active' ? 'Ativo' : 'Inativo'}</span>
                      </td>
                      <td className={`${td} crm-action-group`}>
                        <Link href={`/clientes/${customer.id}`} className="btn-base btn-secondary btn-sm">Visualizar</Link>
                        <Link href={`/clientes/${customer.id}/editar`} className="btn-base btn-secondary btn-sm">Editar</Link>
                        {whatsappHref ? (
                          <a href={whatsappHref} target="_blank" rel="noopener noreferrer" data-nexo-whatsapp-link="true" className="btn-base btn-success btn-sm">WhatsApp</a>
                        ) : (
                          <span className="text-xs text-muted" title="Cadastre um telefone com DDD">Sem telefone válido</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          </div>
          </>
        )}
        {!customerError && totalCount > 0 && (
          <nav aria-label="Paginação de clientes" className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 p-4 text-sm">
            {pagination.page > 1 ? (
              <Link href={customerPageHref(pagination.page - 1, { term, status, productCode })} className="btn-base btn-secondary btn-sm">Anterior</Link>
            ) : <span aria-disabled="true" className="btn-base btn-secondary btn-sm opacity-50">Anterior</span>}
            <span className="text-center text-muted">Página {pagination.page} de {pagination.totalPages} · {pagination.firstRecord}–{pagination.lastRecord} de {totalCount}</span>
            {pagination.page < pagination.totalPages ? (
              <Link href={customerPageHref(pagination.page + 1, { term, status, productCode })} className="btn-base btn-secondary btn-sm">Próxima</Link>
            ) : <span aria-disabled="true" className="btn-base btn-secondary btn-sm opacity-50">Próxima</span>}
          </nav>
        )}
      </Panel>
    </div>
    </CustomerSelectionProvider>
  )
}

function formatTaxId(value: string | null | undefined) {
  const digits = (value ?? '').replace(/\D/g, '')
  if (digits.length === 11) return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  if (digits.length === 14) return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  return value ?? ''
}
