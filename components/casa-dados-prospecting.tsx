'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

type SavedFilters = { name: string; cnaeCodes: string; openedFrom: string; openedTo: string; limit: string; uf: string; municipality: string; activeOnly: boolean; dailyEnabled: boolean }
type SavedSearch = { id: string; name: string; filters: Record<string, unknown>; daily_enabled: boolean; last_run_at: string | null; last_request_id: string | null }
const input = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-blue focus:ring-2 focus:ring-blue/15'
const initial: SavedFilters = { name: 'Prospecção Nexo', cnaeCodes: '', openedFrom: '', openedTo: '', limit: '200', uf: '', municipality: '', activeOnly: true, dailyEnabled: false }

export function CasaDadosProspecting() {
  const [filters, setFilters] = useState<SavedFilters>(initial)
  const [searches, setSearches] = useState<SavedSearch[]>([])
  const [selectedSearchId, setSelectedSearchId] = useState('')
  const [migrationPending, setMigrationPending] = useState(false)
  const [requestId, setRequestId] = useState('')
  const [downloadUrl, setDownloadUrl] = useState('')
  const [downloadName, setDownloadName] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    fetch('/api/leads/prospecting/filters', { cache: 'no-store' }).then(async response => {
      const result = await response.json()
      if (!active) return
      if (result.migration_pending) { setMigrationPending(true); return }
      if (!response.ok) throw new Error(result.error ?? 'Não foi possível carregar as pesquisas salvas.')
      setSearches(result.searches ?? [])
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar as pesquisas salvas.') })
    return () => { active = false }
  }, [])

  function update<K extends keyof SavedFilters>(key: K, value: SavedFilters[K]) {
    setFilters(current => ({ ...current, [key]: value }))
  }

  function applySavedSearch(id: string) {
    setSelectedSearchId(id)
    const saved = searches.find(search => search.id === id)
    setRequestId(saved?.last_request_id ?? '')
    setDownloadUrl('')
    if (!saved) return
    const data = saved.filters
    setFilters({
      name: saved.name,
      cnaeCodes: Array.isArray(data.cnaeCodes) ? data.cnaeCodes.filter((value): value is string => typeof value === 'string').join(', ') : '',
      openedFrom: typeof data.openedFrom === 'string' ? data.openedFrom : '',
      openedTo: typeof data.openedTo === 'string' ? data.openedTo : '',
      limit: typeof data.limit === 'number' ? String(data.limit) : '200',
      uf: typeof data.uf === 'string' ? data.uf : '',
      municipality: typeof data.municipality === 'string' ? data.municipality : '',
      activeOnly: data.activeOnly !== false,
      dailyEnabled: saved.daily_enabled,
    })
  }

  async function saveFilters() {
    setError(''); setMessage('')
    try {
      const response = await fetch('/api/leads/prospecting/filters', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedSearchId || undefined, name: filters.name, daily_enabled: filters.dailyEnabled,
          filters: {
            cnaeCodes: [...new Set(filters.cnaeCodes.split(/[\s,;]+/).filter(code => /^\d{7}$/.test(code)))],
            openedFrom: filters.openedFrom, openedTo: filters.openedTo, limit: Number(filters.limit),
            uf: filters.uf, municipality: filters.municipality, activeOnly: filters.activeOnly,
          },
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? 'Não foi possível salvar a pesquisa.')
      const saved = result.search as SavedSearch
      setSearches(current => [saved, ...current.filter(item => item.id !== saved.id)])
      setSelectedSearchId(saved.id)
      setMessage('Pesquisa salva no Nexo CRM.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível salvar a pesquisa.') }
  }

  async function deleteSearch() {
    if (!selectedSearchId) return
    setError(''); setMessage('')
    try {
      const response = await fetch(`/api/leads/prospecting/filters?id=${encodeURIComponent(selectedSearchId)}`, { method: 'DELETE' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? 'Não foi possível excluir a pesquisa.')
      setSearches(current => current.filter(item => item.id !== selectedSearchId))
      setSelectedSearchId('')
      setMessage('Pesquisa removida do CRM.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível excluir a pesquisa.') }
  }

  const selectedSearch = searches.find(search => search.id === selectedSearchId)

  async function checkFile(id: string) {
    const response = await fetch(`/api/leads/prospecting/casa-dos-dados?id=${encodeURIComponent(id)}`, { cache: 'no-store' })
    const contentType = response.headers.get('content-type') ?? ''
    if (response.ok && /text\/csv|application\/octet-stream/i.test(contentType)) {
      const blob = await response.blob()
      setDownloadUrl(URL.createObjectURL(blob))
      setDownloadName(`casa-dos-dados-${id}.csv`)
      setMessage('Arquivo CSV pronto para baixar. Depois, envie-o na importação por planilha para revisar as linhas e evitar duplicados.')
      return true
    }
    const result = await response.json()
    if (response.status === 202) {
      setMessage(typeof result.message === 'string' ? result.message : 'O arquivo ainda está sendo gerado. Verifique novamente em alguns instantes.')
      return false
    }
    if (!response.ok) {
      const diagnostics = [result.provider_status && `status: ${result.provider_status}`, result.response_http_status && `HTTP do download: ${result.response_http_status}`, result.response_content_type && `formato: ${result.response_content_type}`, Array.isArray(result.response_fields) && result.response_fields.length ? `campos: ${result.response_fields.join(', ')}` : null].filter(Boolean).join(' · ')
      throw new Error([result.error ?? 'Não foi possível verificar o arquivo.', diagnostics].filter(Boolean).join(' '))
    }
    if (result.status !== 'ready' || typeof result.download_url !== 'string') throw new Error('A Casa dos Dados não disponibilizou um link válido.')
    setDownloadUrl(result.download_url)
    setDownloadName(`casa-dos-dados-${id}.csv`)
    setMessage('Arquivo pronto. Baixe o CSV e envie-o na tela de importação por planilha para revisar as linhas e evitar duplicados.')
    return true
  }

  async function generate() {
    setBusy(true); setError(''); setMessage('Solicitando arquivo de prospecção…'); setRequestId(''); setDownloadUrl(''); setDownloadName('')
    try {
      const response = await fetch('/api/leads/prospecting/casa-dos-dados', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: filters.name, cnae_codes: filters.cnaeCodes.split(/[\s,;]+/).filter(Boolean),
          opened_from: filters.openedFrom, opened_to: filters.openedTo, limit: Number(filters.limit),
          uf: filters.uf, municipality: filters.municipality, active_only: filters.activeOnly,
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? 'Não foi possível iniciar a pesquisa.')
      const id = String(result.request_id ?? '')
      if (!id) throw new Error('A API não retornou o identificador da pesquisa.')
      setRequestId(id)
      setMessage('Pesquisa aceita. Aguardando a geração do arquivo…')
      for (let attempt = 0; attempt < 8; attempt++) {
        await new Promise(resolve => window.setTimeout(resolve, 5000))
        if (await checkFile(id)) return
      }
      setMessage('A geração ainda está em andamento. Use “Verificar arquivo” em alguns instantes; não é necessário solicitar outra pesquisa.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível concluir a pesquisa.')
      setMessage('')
    } finally { setBusy(false) }
  }

  async function verify() {
    if (!requestId) return
    setBusy(true); setError(''); setMessage('Consultando o status…')
    try {
      await checkFile(requestId)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível consultar a pesquisa.'); setMessage('') }
    finally { setBusy(false) }
  }

  return <>
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs font-bold uppercase tracking-[.14em] text-blue">Relacionamento · Leads</p><h1 className="mt-1 text-[30px] font-bold tracking-tight">Pesquisa Casa dos Dados</h1><p className="mt-1 max-w-3xl text-[15px] text-muted">Gere um CSV por CNAE e data de abertura. O arquivo passa pela revisão e pela verificação de duplicidade já existentes no Nexo.</p></div>
      <Link href="/leads/importar" className="rounded-lg border border-slate-300 bg-surface px-4 py-2.5 text-sm font-semibold text-ink hover:bg-slate-50">Voltar à importação</Link>
    </div>

    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold">Filtros da pesquisa</h2>
      <p className="mt-1 text-sm text-muted">A chave de API é usada somente no servidor. As pesquisas ficam salvas no CRM e protegidas pelo acesso administrativo.</p>
      {migrationPending && <p role="alert" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Para salvar pesquisas no CRM, aplique manualmente a migration <code>202611050001_lead_prospecting_saved_filters.sql</code> no Supabase Nexo.</p>}
      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <label className="grid gap-1.5 text-sm font-medium">Carregar pesquisa salva<select value={selectedSearchId} onChange={event => applySavedSearch(event.target.value)} className={input}><option value="">Nova pesquisa…</option>{searches.map(search => <option key={search.id} value={search.id}>{search.name}</option>)}</select></label>
        <label className="grid gap-1.5 text-sm font-medium">Nome para identificar a pesquisa<input value={filters.name} maxLength={80} onChange={event => update('name', event.target.value)} className={input} /></label>
        <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">CNAEs (7 dígitos; separe por vírgula, espaço ou ponto e vírgula)<input value={filters.cnaeCodes} onChange={event => update('cnaeCodes', event.target.value)} placeholder="Ex.: 5611201, 4723700" className={input} /><span className="text-xs font-normal text-muted">A pesquisa considera os códigos em atividades principais e secundárias.</span></label>
        <label className="grid gap-1.5 text-sm font-medium">Abertura a partir de<input type="date" value={filters.openedFrom} onChange={event => update('openedFrom', event.target.value)} className={input} /></label>
        <label className="grid gap-1.5 text-sm font-medium">Abertura até<input type="date" value={filters.openedTo} onChange={event => update('openedTo', event.target.value)} className={input} /></label>
        <label className="grid gap-1.5 text-sm font-medium">Máximo de empresas<input type="number" min={1} max={1000} value={filters.limit} onChange={event => update('limit', event.target.value)} className={input} /></label>
        <label className="grid gap-1.5 text-sm font-medium">UF (opcional)<input value={filters.uf} maxLength={2} onChange={event => update('uf', event.target.value.toUpperCase())} placeholder="MG" className={input} /></label>
        <label className="grid gap-1.5 text-sm font-medium">Município (opcional)<input value={filters.municipality} maxLength={100} onChange={event => update('municipality', event.target.value)} placeholder="Juiz de Fora" className={input} /></label>
        <label className="flex items-center gap-2 self-end rounded-lg bg-slate-50 px-3 py-3 text-sm font-medium"><input type="checkbox" checked={filters.activeOnly} onChange={event => update('activeOnly', event.target.checked)} className="accent-blue" />Somente empresas ativas</label>
        <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm font-medium text-amber-950 sm:col-span-2 xl:col-span-3"><input type="checkbox" checked={filters.dailyEnabled} onChange={event => update('dailyEnabled', event.target.checked)} className="mt-0.5 accent-blue" />Habilitar geração diária desta pesquisa. Cada execução pode consumir saldo e gera um CSV para revisão; ela só começa depois de salvar a pesquisa e configurar o agendamento no servidor.</label>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="button" onClick={() => void saveFilters()} disabled={busy || migrationPending} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-ink hover:bg-slate-50 disabled:opacity-50">{selectedSearchId ? 'Atualizar pesquisa salva' : 'Salvar pesquisa no CRM'}</button>
        {selectedSearchId && <button type="button" onClick={() => void deleteSearch()} disabled={busy} className="rounded-lg border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">Excluir pesquisa</button>}
        <button type="button" onClick={() => void generate()} disabled={busy} className="rounded-lg bg-blue px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60">{busy ? 'Aguarde…' : 'Gerar arquivo CSV'}</button>
        {requestId && !downloadUrl && <button type="button" onClick={() => void verify()} disabled={busy} className="rounded-lg border border-blue-200 px-4 py-2.5 text-sm font-semibold text-blue hover:bg-blue-50 disabled:opacity-50">Verificar arquivo</button>}
      </div>
      <p className="mt-3 text-xs leading-5 text-muted">A geração pela API pode consumir saldo da Casa dos Dados. O CRM só solicita o arquivo quando você clicar no botão. A importação dos leads continua dependendo de revisão e confirmação na tela seguinte.</p>
      {selectedSearch?.last_run_at && <p className="mt-3 text-sm text-muted">Última execução diária: {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(selectedSearch.last_run_at))}{selectedSearch.last_request_id ? ` · solicitação ${selectedSearch.last_request_id}` : ''}</p>}
      {message && <p role="status" className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">{message}</p>}
      {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      {downloadUrl && <a href={downloadUrl} download={downloadName || undefined} target="_blank" rel="noreferrer" className="mt-4 inline-flex rounded-lg bg-blue px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">Baixar CSV da Casa dos Dados</a>}
      {requestId && <p className="mt-3 text-xs text-muted">ID da solicitação: {requestId}</p>}
    </section>
    <section className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><strong>Importação segura:</strong> depois de baixar, volte à <Link className="font-semibold underline" href="/leads/importar">importação por planilha</Link>, envie o CSV, confira os CNAEs e duplicidades antes de confirmar.</section>
  </>
}
