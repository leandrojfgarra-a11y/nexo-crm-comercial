'use client'

import { useMemo, useState, useTransition, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { saveProduct, setProductActive } from '@/app/produtos/actions'
import { table, th, td } from '@/components/ui'

export type ProductCatalogItem = {
  id: string; name: string; internal_code?: string | null; kind: 'product'|'service'|'certificate'
  commercial_category?: string | null; description: string | null; default_installation_value?: number | string | null
  default_monthly_value?: number | string | null; reference_price: number | string | null
  standard_cost?: number | string | null; billing_mode?: 'single'|'monthly'|'custom'; active: boolean
}

const kindLabels = { product: 'Produto', service: 'Serviço', certificate: 'Certificado digital' }
const money = (value: number | string | null | undefined) => value == null || value === ''
  ? '—'
  : Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const statusColors: Record<string, string> = { active: 'bg-emerald-50 text-emerald-800', inactive: 'bg-slate-100 text-slate-700' }

// ============================================================
// Listagem de produtos
// ============================================================
export function ProductCatalog({ products, schemaReady, loadError }: { products: ProductCatalogItem[]; schemaReady: boolean; loadError: string | null }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState('')
  const [messageOk, setMessageOk] = useState<boolean | null>(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const visible = useMemo(() => products.filter(product => {
    const text = [product.name,product.internal_code,product.commercial_category,product.description].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR')
    return (!search || text.includes(search.toLocaleLowerCase('pt-BR'))) &&
      (typeFilter === 'all' || product.kind === typeFilter) &&
      (statusFilter === 'all' || String(product.active) === statusFilter)
  }), [products, search, typeFilter, statusFilter])

  function toggle(item: ProductCatalogItem) {
    setMessage(''); setMessageOk(null)
    startTransition(async () => {
      const result = await setProductActive(item.id, item.active)
      setMessage(result.message); setMessageOk(result.ok)
      if (result.ok) router.refresh()
    })
  }

  const input = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-blue focus:ring-2 focus:ring-blue/15'
  const label = 'flex flex-col gap-1 text-sm font-medium text-ink'
  const section = 'card-base p-5'

  return (
    <div className="space-y-5">
      {loadError && <p role="alert" className="msg-base msg-danger">{loadError}</p>}
      {message && <p role={messageOk ? 'status' : 'alert'} className={`msg-base ${messageOk ? 'msg-success' : 'msg-danger'}`}>{message}</p>}

      {/* Listagem */}
      <section className={section}>
        <div className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          <div className={label + ' sm:col-span-2 lg:col-span-2 xl:col-span-4'}>
            <label>Pesquisar</label>
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Nome, código, categoria ou descrição" className={input} />
          </div>
          <div className={label + ' sm:col-span-1 lg:col-span-1 xl:col-span-1'}>
            <label>Tipo</label>
            <select value={typeFilter} onChange={event => setTypeFilter(event.target.value)} className={input}>
              <option value="all">Todos</option>
              <option value="product">Produto</option>
              <option value="service">Serviço</option>
              <option value="certificate">Certificado digital</option>
            </select>
          </div>
          <div className={label + ' sm:col-span-1 lg:col-span-1 xl:col-span-1'}>
            <label>Status</label>
            <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className={input}>
              <option value="all">Todos</option>
              <option value="true">Ativos</option>
              <option value="false">Inativos</option>
            </select>
          </div>
          <div className="flex items-end gap-2 sm:col-span-1 lg:col-span-1 xl:col-span-2">
            <button type="button" className="btn-base btn-secondary btn-sm">Limpar</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className={`${table} w-full min-w-[900px]`}>
            <thead>
              <tr>{['Nome / código','Tipo / categoria','Instalação','Mensalidade','Preço avulso','Custo padrão','Status','Ações'].map(label => <th key={label} className={th}>{label}</th>)}</tr>
            </thead>
            <tbody>
              {visible.length ? visible.map(item => (
                <tr key={item.id} className="border-t border-slate-100 hover:bg-slate-50/50 transition-colors">
                  <td className={`${td} font-semibold`}>
                    <p className="font-semibold line-clamp-1">{item.name}</p>
                    <p className="text-xs text-muted line-clamp-1">{item.internal_code || 'Sem código'}</p>
                  </td>
                  <td className={td}>
                    <p className="text-sm font-medium">{kindLabels[item.kind]}</p>
                    <p className="text-xs text-muted line-clamp-1">{item.commercial_category || 'Sem categoria'}</p>
                  </td>
                  <td className={td}>{money(item.default_installation_value)}</td>
                  <td className={td}>{money(item.default_monthly_value)}</td>
                  <td className={td}>{money(item.reference_price)}</td>
                  <td className={td}>{money(item.standard_cost)}</td>
                  <td className={td}>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusColors[item.active ? 'active' : 'inactive']}`}>{item.active ? 'Ativo' : 'Inativo'}</span>
                  </td>
                  <td className={`${td} crm-action-group flex flex-wrap gap-1`}>
                    <Link href={`/produtos/${item.id}/editar`} className="btn-base btn-secondary btn-sm disabled:opacity-50">Editar</Link>
                    <button type="button" disabled={pending || !schemaReady} onClick={() => toggle(item)} className="btn-base btn-ghost btn-sm disabled:opacity-50">{item.active ? 'Inativar' : 'Ativar'}</button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={8} className={`${td} py-12 text-center text-sm text-muted`}>{products.length ? 'Nenhum item corresponde aos filtros.' : 'Nenhum produto ou serviço cadastrado.'}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

// ============================================================
// Formulário de cadastro/edição
// ============================================================
export function ProductForm({ initial = {}, schemaReady }: { initial?: Partial<ProductCatalogItem>; schemaReady: boolean }) {
  const data = initial ?? {}
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState('')
  const [messageOk, setMessageOk] = useState<boolean | null>(null)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const item = {
      id: String(form.get('id') ?? '') || undefined,
      name: String(form.get('name') ?? ''), internalCode: String(form.get('internalCode') ?? ''),
      kind: String(form.get('kind') ?? 'product') as ProductCatalogItem['kind'],
      commercialCategory: String(form.get('commercialCategory') ?? ''), description: String(form.get('description') ?? ''),
      installationValue: String(form.get('installationValue') ?? ''), monthlyValue: String(form.get('monthlyValue') ?? ''),
      salePrice: String(form.get('salePrice') ?? ''), standardCost: String(form.get('standardCost') ?? ''),
      billingMode: String(form.get('billingMode') ?? 'custom') as 'single'|'monthly'|'custom', active: form.has('active'),
    }
    setMessage(''); setMessageOk(null)
    startTransition(async () => {
      const result = await saveProduct(item)
      setMessage(result.message); setMessageOk(result.ok)
      if (result.ok) router.push('/produtos')
    })
  }

  const input = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-blue focus:ring-2 focus:ring-blue/15'
  const label = 'flex flex-col gap-1 text-sm font-medium text-ink'

  return (
    <form key={data.id ?? 'new'} onSubmit={submit} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {data.id && <input type="hidden" name="id" value={data.id} />}
      <label className={label}>
        Nome do produto ou serviço<span className="text-blue ml-0.5" aria-hidden="true">*</span>
        <input name="name" required minLength={2} maxLength={180} defaultValue={data.name ?? ''} className={input} aria-label="Nome do produto ou serviço" />
      </label>
      <label className={label}>
        Código interno
        <input name="internalCode" maxLength={60} defaultValue={data.internal_code ?? ''} className={input} aria-label="Código interno" />
        <p className="text-xs text-muted mt-1">Código interno de identificação (opcional).</p>
      </label>
      <label className={label}>
        Tipo
        <select name="kind" defaultValue={data.kind ?? 'product'} className={input} aria-label="Tipo de item">
          <option value="product">Produto</option>
          <option value="service">Serviço</option>
          <option value="certificate">Certificado digital</option>
        </select>
      </label>
      <label className={label}>
        Categoria comercial
        <input name="commercialCategory" maxLength={100} defaultValue={data.commercial_category ?? ''} className={input} aria-label="Categoria comercial" />
        <p className="text-xs text-muted mt-1">Categoria para agrupamento comercial (opcional).</p>
      </label>
      <label className={label}>
        Modalidade de cobrança
        <select name="billingMode" defaultValue={data.billing_mode ?? 'custom'} className={input} aria-label="Modalidade de cobrança">
          <option value="single">Única</option>
          <option value="monthly">Mensal</option>
          <option value="custom">Personalizada</option>
        </select>
      </label>
      <label className={label}>
        Valor padrão de instalação (R$)
        <input name="installationValue" inputMode="decimal" placeholder="0,00" defaultValue={data.default_installation_value ?? ''} className={input} aria-label="Valor de instalação" />
        <p className="text-xs text-muted mt-1">Valor único de instalação/implementação (opcional).</p>
      </label>
      <label className={label}>
        Valor padrão de mensalidade (R$)
        <input name="monthlyValue" inputMode="decimal" placeholder="0,00" defaultValue={data.default_monthly_value ?? ''} className={input} aria-label="Valor da mensalidade" />
        <p className="text-xs text-muted mt-1">Valor recorrente mensal (opcional).</p>
      </label>
      <label className={label}>
        Preço de venda avulsa (R$)
        <input name="salePrice" inputMode="decimal" placeholder="0,00" defaultValue={data.reference_price ?? ''} className={input} aria-label="Preço de venda avulsa" />
        <p className="text-xs text-muted mt-1">Preço de referência para venda avulsa (opcional).</p>
      </label>
      <label className={label}>
        Custo padrão (R$)
        <input name="standardCost" inputMode="decimal" placeholder="0,00" defaultValue={data.standard_cost ?? ''} className={input} aria-label="Custo padrão" />
        <p className="text-xs text-muted mt-1">Custo padrão do item (opcional).</p>
      </label>
      <label className={`${label} sm:col-span-2 xl:col-span-3`}>
        Descrição
        <textarea name="description" maxLength={5000} rows={3} defaultValue={data.description ?? ''} className={input} aria-label="Descrição" />
        <p className="text-xs text-muted mt-1">Descrição detalhada do produto ou serviço (opcional).</p>
      </label>
      <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2 xl:col-span-3">
        <input type="checkbox" name="active" value="true" defaultChecked={data.active ?? true} aria-label="Item ativo" />
        Item ativo e disponível para novas negociações
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2 xl:col-span-3">
        <button disabled={pending || !schemaReady} className="btn-base btn-primary btn-md disabled:opacity-50">{pending ? 'Salvando...' : data.id ? 'Salvar alterações' : 'Cadastrar item'}</button>
        {!schemaReady && <span className="text-xs text-amber-800 mt-1 block">Gravação bloqueada até aplicar a migration 202610310006.</span>}
      </div>
    </form>
  )
}
