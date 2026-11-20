'use client'

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { customerSelectionStorageKey, updatePageSelection } from '@/lib/customer-selection'

type ExportFilters = { searchTerm: string; status: 'all' | 'active' | 'inactive'; productCode: string | null }
type ExportScope = 'all' | 'selected'
type SelectionContextValue = {
  selectedIds: string[]
  selectedSet: Set<string>
  ready: boolean
  toggle: (id: string, checked: boolean) => void
  setPage: (ids: string[], checked: boolean) => void
  clear: () => void
}

const SelectionContext = createContext<SelectionContextValue | null>(null)

export function CustomerSelectionProvider({
  companyId,
  filters,
  children,
}: {
  companyId: string
  filters: ExportFilters
  children: ReactNode
}) {
  const storageKey = customerSelectionStorageKey(companyId, filters)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [loadedStorageKey, setLoadedStorageKey] = useState<string | null>(null)

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(storageKey)
      const parsed: unknown = stored ? JSON.parse(stored) : []
      setSelectedIds(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [])
    } catch {
      setSelectedIds([])
    } finally {
      setLoadedStorageKey(storageKey)
    }
  }, [storageKey])

  useEffect(() => {
    if (loadedStorageKey === storageKey) sessionStorage.setItem(storageKey, JSON.stringify(selectedIds))
  }, [loadedStorageKey, selectedIds, storageKey])

  const ready = loadedStorageKey === storageKey

  const value = useMemo<SelectionContextValue>(() => ({
    selectedIds,
    selectedSet: new Set(selectedIds),
    ready,
    toggle: (id, checked) => setSelectedIds(current => updatePageSelection(current, [id], checked)),
    setPage: (ids, checked) => setSelectedIds(current => updatePageSelection(current, ids, checked)),
    clear: () => setSelectedIds([]),
  }), [ready, selectedIds])

  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>
}

function useCustomerSelection() {
  const value = useContext(SelectionContext)
  if (!value) throw new Error('Customer selection components must be wrapped in CustomerSelectionProvider.')
  return value
}

export function SelectAllCustomersOnPage({ customerIds }: { customerIds: string[] }) {
  const { selectedSet, ready, setPage } = useCustomerSelection()
  const checkboxRef = useRef<HTMLInputElement>(null)
  const selectedOnPage = customerIds.filter(id => selectedSet.has(id)).length
  const allSelected = customerIds.length > 0 && selectedOnPage === customerIds.length

  useEffect(() => {
    if (checkboxRef.current) checkboxRef.current.indeterminate = selectedOnPage > 0 && !allSelected
  }, [allSelected, selectedOnPage])

  return <input
    ref={checkboxRef}
    type="checkbox"
    aria-label="Selecionar todos os clientes desta página"
    checked={allSelected}
    disabled={!ready || !customerIds.length}
    onChange={event => setPage(customerIds, event.target.checked)}
    className="accent-blue"
  />
}

export function SelectCustomerRow({ customerId, customerName }: { customerId: string; customerName: string }) {
  const { selectedSet, ready, toggle } = useCustomerSelection()
  return <input
    type="checkbox"
    aria-label={`Selecionar ${customerName}`}
    checked={selectedSet.has(customerId)}
    disabled={!ready}
    onChange={event => toggle(customerId, event.target.checked)}
    className="mr-2 accent-blue"
  />
}

export function CustomerExportToolbar({ filters, totalCount, visibleCustomerIds }: { filters: ExportFilters; totalCount: number; visibleCustomerIds: string[] }) {
  const { selectedIds, ready, clear } = useCustomerSelection()
  const [scope, setScope] = useState<ExportScope>('all')
  const [busy, setBusy] = useState<'xlsx' | 'pdf' | null>(null)
  const [message, setMessage] = useState('')

  async function exportCustomers(format: 'xlsx' | 'pdf') {
    if (scope === 'selected' && selectedIds.length === 0) return
    setBusy(format)
    setMessage('')
    try {
      const response = await fetch('/api/clientes/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format, scope, filters, selectedIds: scope === 'selected' ? selectedIds : [] }),
      })
      if (!response.ok) {
        const result = await response.json().catch(() => null)
        throw new Error(typeof result?.error === 'string' ? result.error : 'Não foi possível gerar a exportação.')
      }
      const blob = await response.blob()
      const disposition = response.headers.get('Content-Disposition') ?? ''
      const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] ?? `clientes_nexo.${format}`
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      anchor.click()
      URL.revokeObjectURL(url)
      setMessage(`${format === 'xlsx' ? 'Planilha' : 'Relatório PDF'} gerado.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível gerar a exportação.')
    } finally {
      setBusy(null)
    }
  }

  return <div className="grid gap-3 border-b border-slate-200 bg-slate-50/70 p-4 lg:grid-cols-[minmax(220px,1fr)_auto] lg:items-end">
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex min-w-[270px] flex-col gap-1 text-sm font-medium text-ink">
        Exportar
        <select value={scope} onChange={event => setScope(event.target.value as ExportScope)} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue focus:ring-2 focus:ring-blue/15">
          <option value="all">Todos os clientes encontrados pelos filtros</option>
          <option value="selected">Somente clientes selecionados</option>
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span aria-live="polite" className="font-medium text-ink">{ready ? selectedIds.length : 0} selecionados</span>
        <button type="button" onClick={clear} disabled={!ready || selectedIds.length === 0} className="font-semibold text-blue underline disabled:text-slate-400">Limpar seleção</button>
        <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
          <SelectAllCustomersOnPage customerIds={visibleCustomerIds} />
          <span>Selecionar todos desta página</span>
        </label>
      </div>
    </div>
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => exportCustomers('xlsx')} disabled={busy !== null || !ready || (scope === 'all' && totalCount === 0) || (scope === 'selected' && selectedIds.length === 0)} className="btn-base btn-secondary btn-md">
        {busy === 'xlsx' ? 'Gerando Excel…' : 'Exportar Excel'}
      </button>
      <button type="button" onClick={() => exportCustomers('pdf')} disabled={busy !== null || !ready || (scope === 'all' && totalCount === 0) || (scope === 'selected' && selectedIds.length === 0)} className="btn-base btn-primary btn-md">
        {busy === 'pdf' ? 'Gerando PDF…' : 'Gerar PDF'}
      </button>
    </div>
    {message && <p role="status" className="text-sm text-muted lg:col-span-2">{message}</p>}
  </div>
}
