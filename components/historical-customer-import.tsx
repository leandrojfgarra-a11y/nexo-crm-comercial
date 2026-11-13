'use client'

import Link from 'next/link'
import { useState } from 'react'
import * as XLSX from 'xlsx'
import { validCnpj, validCpf } from '@/lib/crm-validation'
import { importHistoricalCustomers, findHistoricalCustomerDuplicates } from '@/app/clientes/importar/actions'
import { repairMojibake } from '@/lib/text-encoding'

type Product = { id: string; name: string; internal_code: string | null; active: boolean }
type Inscription = { number: string; state: string | null; active: boolean | null; regime: string | null }
type Enrichment = {
  name?: string | null; trade_name?: string | null; tax_id?: string | null; postal_code?: string | null;
  address_line?: string | null; address_number?: string | null; address_extra?: string | null; district?: string | null;
  city?: string | null; state?: string | null; primary_cnae?: string | null; registration_status?: string | null; opened_at?: string | null;
}
type CustomerRow = {
  id: string; rowNumber: number; kind: 'individual' | 'company'; status: 'active' | 'inactive' | '';
  name: string; tradeName: string; taxId: string; phone: string; whatsapp: string; email: string;
  monthlyFee: number | null; billingDay: number | null; legacyCode: string; legacyContractStatus: string;
  productCodes: string[]; unknownProducts: string[]; sourceDuplicate: boolean;
  enrichment?: Enrichment; inscriptions: Inscription[]; stateRegistration: string; lookupMessage: string; lookupBusy: boolean;
  postalCode?: string; addressLine?: string; addressNumber?: string; addressExtra?: string; district?: string;
  city?: string; state?: string; primaryCnae?: string; registrationStatus?: string; openedAt?: string;
}

const input = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-blue focus:ring-2 focus:ring-blue/15'
const panel = 'overflow-hidden rounded-xl border border-slate-200 bg-surface shadow-sm'
const PRODUCT_COLUMNS = [
  { index: 5, code: 'CT-E', label: 'CT-E' }, { index: 6, code: 'APP', label: 'APP' },
  { index: 7, code: 'NFP-E', label: 'NFP-E' }, { index: 8, code: 'BOLETO', label: 'BOLETO' },
  { index: 9, code: 'NFSE', label: 'NFSE' }, { index: 10, code: 'MDF-E', label: 'MDF-E' },
  { index: 11, code: 'BACKUP', label: 'BACKUP' }, { index: 12, code: 'LIMITADOR NOTAS', label: 'LIMITADOR NOTAS' },
  { index: 13, code: 'GARRAX', label: 'GARRAX' }, { index: 14, code: 'NFCE', label: 'NFCE' },
]
const norm = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const txt = (value: unknown) => value == null ? '' : repairMojibake(String(value).trim())
function documentValue(value: unknown) {
  return txt(value).toUpperCase().replace(/[.\/-\s]/g, '')
}
function moneyValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value * 100) / 100
  const raw = txt(value).replace(/R\$|\s/gi, '')
  if (!raw) return null
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw
  const amount = Number(normalized.replace(/[^0-9.-]/g, ''))
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) / 100 : null
}
function billingDay(value: unknown): number | null {
  const match = txt(value).match(/^(\d{1,2})(?:\D|$)/)
  const day = match ? Number(match[1]) : Number(value)
  return Number.isInteger(day) && day >= 1 && day <= 31 ? day : null
}
function apiDate(value: string | null | undefined) {
  if (!value) return ''
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/)
  if (match) return match[1]
  const br = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  return br ? `${br[3]}-${br[2]}-${br[1]}` : ''
}

export function HistoricalCustomerImport({ products, schemaReady, productSchemaReady }: { products: Product[]; schemaReady: boolean; productSchemaReady: boolean }) {
  const [rows, setRows] = useState<CustomerRow[]>([])
  const [fileName, setFileName] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [existingDocs, setExistingDocs] = useState<Set<string>>(new Set())
  const [checkedSelection, setCheckedSelection] = useState('')
  const [page, setPage] = useState(0)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const selectedRows = rows.filter(row => selected.has(row.id))
  const selectionKey = selectedRows.map(row => row.id).sort().join('|')
  const hasProductMappings = selectedRows.every(row => row.productCodes.every(code => Boolean(mapping[code])))
  const duplicateRows = rows.filter(row => row.sourceDuplicate).length
  const pageRows = rows.slice(page * 20, (page + 1) * 20)

  function reset() {
    setRows([]); setFileName(''); setSelected(new Set()); setMapping({}); setExistingDocs(new Set()); setCheckedSelection(''); setPage(0); setMessage(''); setError('')
  }

  async function readFile(file?: File) {
    reset()
    if (!file) return
    if (!/\.(xlsx|xls)$/i.test(file.name)) { setError('Selecione a planilha Excel Clientes Garra (.xlsx ou .xls).'); return }
    if (file.size > 15 * 1024 * 1024) { setError('A planilha excede 15 MB.'); return }
    setBusy(true)
    try {
      const bytes = await file.arrayBuffer()
      const workbook = XLSX.read(bytes, { type: 'array', cellDates: false, cellFormula: false })
      const sheetName = workbook.SheetNames.find(name => norm(name) === 'CLIENTES') ?? workbook.SheetNames[0]
      const sheet = sheetName ? workbook.Sheets[sheetName] : undefined
      if (!sheet?.['!ref']) throw new Error('Não encontrei uma aba com dados na planilha.')
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '', blankrows: false })
      if (matrix.length > 10001) throw new Error('A planilha excede o limite de 10.000 linhas.')
      const seen = new Set<string>()
      const parsed: CustomerRow[] = []
      for (let index = 1; index < matrix.length; index++) {
        const cells = matrix[index] ?? []
        if (!cells.some(value => txt(value))) continue
        const taxId = documentValue(cells[15])
        const repeated = Boolean(taxId && seen.has(taxId))
        if (taxId) seen.add(taxId)
        const statusValue = txt(cells[0]).toUpperCase()
        const productCodes = PRODUCT_COLUMNS.filter(column => txt(cells[column.index]).toUpperCase() === 'SIM').map(column => column.code)
        const unknownProducts = PRODUCT_COLUMNS.filter(column => {
          const value = txt(cells[column.index]).toUpperCase()
          return value !== '' && value !== 'SIM' && value !== 'NÃO' && value !== 'NAO'
        }).map(column => `${column.code}: ${txt(cells[column.index])}`)
        parsed.push({
          id: `row-${index + 1}`, rowNumber: index + 1, kind: taxId.length === 11 ? 'individual' : 'company',
          status: statusValue === 'A' ? 'active' : statusValue === 'I' ? 'inactive' : '',
          tradeName: txt(cells[2]), name: txt(cells[3]), taxId,
          phone: txt(cells[18]), whatsapp: txt(cells[19]), email: txt(cells[20]).toLowerCase(),
          legacyContractStatus: txt(cells[4]), productCodes, unknownProducts,
          monthlyFee: moneyValue(cells[16]), billingDay: billingDay(cells[17]), legacyCode: txt(cells[1]),
          sourceDuplicate: repeated, inscriptions: [], stateRegistration: '', lookupMessage: '', lookupBusy: false,
          postalCode: '', addressLine: '', addressNumber: '', addressExtra: '', district: '', city: '', state: '',
          primaryCnae: '', registrationStatus: '', openedAt: '',
        })
      }
      if (!parsed.length) throw new Error('A aba está sem linhas de clientes depois do cabeçalho.')
      const preselected = parsed.filter(row => !row.sourceDuplicate && row.status && row.name.length >= 2 && row.taxId && (row.kind === 'individual' ? validCpf(row.taxId) : validCnpj(row.taxId)) && (!row.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)))
      const newMapping: Record<string, string> = {}
      for (const column of PRODUCT_COLUMNS) {
        const match = products.find(product => norm(product.internal_code ?? '') === norm(column.code)) ?? products.find(product => norm(product.name).includes(norm(column.code)))
        if (match) newMapping[column.code] = match.id
      }
      setRows(parsed); setFileName(file.name); setSelected(new Set(preselected.map(row => row.id))); setMapping(newMapping); setPage(0)
      setMessage(`Planilha lida no navegador: ${parsed.length} registros. ${preselected.length} pré-selecionados para revisão; nenhum dado foi gravado.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível ler a planilha.')
    } finally { setBusy(false) }
  }

  function toggleRow(id: string) {
    setSelected(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next })
    setCheckedSelection('')
  }

  async function checkDuplicates() {
    setBusy(true); setError(''); setMessage('')
    const result = await findHistoricalCustomerDuplicates(selectedRows.map(row => row.taxId).filter(Boolean))
    setBusy(false)
    if (!result.ok) { setError(result.error); return }
    const found = new Set(result.taxIds)
    setExistingDocs(found); setCheckedSelection(selectionKey)
    setMessage(found.size ? `${found.size} documento(s) já existem no CRM. Essas linhas serão bloqueadas para evitar duplicidade.` : 'Conferência concluída: nenhum CPF/CNPJ selecionado consta no CRM.')
  }

  async function lookupRow(id: string) {
    const row = rows.find(item => item.id === id)
    if (!row || row.kind !== 'company' || !validCnpj(row.taxId)) { setError('A consulta de CNPJ exige um CNPJ válido.'); return }
    setRows(current => current.map(item => item.id === id ? { ...item, lookupBusy: true, lookupMessage: 'Consultando CNPJ e Inscrição Estadual…' } : item))
    setError('')
    let enrichment: Enrichment | undefined
    let ieOptions: Inscription[] = []
    let ieMessage = ''
    try {
      const response = await fetch(`/api/lookups/cnpj?cnpj=${encodeURIComponent(row.taxId)}`, { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? `Consulta CNPJ falhou (HTTP ${response.status}).`)
      enrichment = data as Enrichment
    } catch (cause) {
      ieMessage = cause instanceof Error ? cause.message : 'Consulta CNPJ indisponível.'
    }
    try {
      const response = await fetch(`/api/lookups/ie?cnpj=${encodeURIComponent(row.taxId)}`, { cache: 'no-store' })
      const data = await response.json()
      if (response.ok) ieOptions = Array.isArray(data.inscriptions) ? data.inscriptions as Inscription[] : []
      else if (!ieMessage) ieMessage = data.error ?? `Consulta IE falhou (HTTP ${response.status}).`
      if (response.status === 429) ieMessage = data.error ?? 'A fonte de IE limita consultas. Aguarde antes de consultar outro CNPJ.'
    } catch (cause) {
      if (!ieMessage) ieMessage = cause instanceof Error ? cause.message : 'Consulta de IE indisponível; o campo poderá ser conferido manualmente.'
    }
    const matchingState = enrichment?.state ? ieOptions.filter(item => item.state === enrichment?.state && item.active === true) : []
    const selectedIe = matchingState.length === 1 ? matchingState[0].number : ieOptions.length === 1 ? ieOptions[0].number : ''
    setRows(current => current.map(item => item.id === id ? { ...item, lookupBusy: false, enrichment, inscriptions: ieOptions, stateRegistration: selectedIe, lookupMessage: enrichment ? (ieMessage ? `CNPJ consultado; IE: ${ieMessage}` : ieOptions.length ? 'Dados CNPJ/IE recebidos. Confira antes de aplicar.' : 'Dados CNPJ recebidos; IE não informada pela fonte.') : ieMessage || 'Consulta não concluída.' } : item))
  }

  function applyEnrichment(id: string) {
    setRows(current => current.map(row => {
      if (row.id !== id || !row.enrichment) return row
      const data = row.enrichment
      const usable = (value: string | null | undefined, fallback: string) => value && !/\*{2,}/.test(value) ? value : fallback
      return { ...row,
        name: usable(data.name, row.name), tradeName: usable(data.trade_name, row.tradeName),
        postalCode: usable(data.postal_code, row.postalCode ?? ''), addressLine: usable(data.address_line, row.addressLine ?? ''),
        addressNumber: usable(data.address_number, row.addressNumber ?? ''), addressExtra: usable(data.address_extra, row.addressExtra ?? ''),
        district: usable(data.district, row.district ?? ''), city: usable(data.city, row.city ?? ''), state: usable(data.state, row.state ?? ''),
        primaryCnae: usable(data.primary_cnae, row.primaryCnae ?? ''), registrationStatus: usable(data.registration_status, row.registrationStatus ?? ''),
        openedAt: usable(apiDate(data.opened_at), row.openedAt ?? ''),
      }
    }))
  }

  async function submitImport() {
    if (!schemaReady || !productSchemaReady) { setError('A migration complementar precisa ser aplicada manualmente antes da gravação.'); return }
    if (selectedRows.length > 25) { setError('Para o teste, importe no máximo 25 clientes por lote.'); return }
    if (!selectedRows.length) { setError('Selecione ao menos um cliente válido.'); return }
    if (checkedSelection !== selectionKey) { setError('Confira duplicidades para a seleção atual antes de importar.'); return }
    if (selectedRows.some(row => row.sourceDuplicate || (row.taxId && existingDocs.has(row.taxId)))) { setError('Retire da seleção as linhas duplicadas na planilha ou já existentes no CRM.'); return }
    if (!hasProductMappings) { setError('Associe cada produto contratado da seleção a um item do catálogo do CRM.'); return }
    const payload = selectedRows.map(row => ({
      kind: row.kind, name: row.name, trade_name: row.tradeName, tax_id: row.taxId, status: row.status,
      phone: row.phone, whatsapp: row.whatsapp, email: row.email,
      monthly_fee: row.monthlyFee, billing_day: row.billingDay, legacy_code: row.legacyCode,
      legacy_contract_status: row.legacyContractStatus,
      postal_code: row.postalCode ?? '', address_line: row.addressLine ?? '', address_number: row.addressNumber ?? '',
      address_extra: row.addressExtra ?? '', district: row.district ?? '', city: row.city ?? '', state: row.state ?? '',
      state_registration: row.stateRegistration, primary_cnae: row.primaryCnae ?? '', registration_status: row.registrationStatus ?? '', opened_at: row.openedAt ?? '',
      product_ids: [...new Set(row.productCodes.map(code => mapping[code]).filter(Boolean))],
    }))
    if (!window.confirm(`Importar ${payload.length} cliente(s) como base histórica? Nenhum lead, oportunidade, contrato ou card do funil será criado.`)) return
    setBusy(true); setError(''); setMessage('')
    const result = await importHistoricalCustomers(JSON.stringify(payload))
    setBusy(false)
    if (!result.ok) { setError(result.error); return }
    setMessage(`${result.imported} cliente(s) importado(s) para a base histórica. Nenhum registro foi criado no funil.`)
    const importedIds = new Set(selectedRows.map(row => row.id))
    setRows(current => current.filter(row => !importedIds.has(row.id)))
    setSelected(new Set())
    setExistingDocs(new Set()); setCheckedSelection('')
  }

  return <div className="grid gap-5">
    <div className={panel}><div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 p-5"><div><h2 className="font-bold">Importar base histórica de clientes</h2><p className="mt-1 text-sm text-muted">Clientes ativos e inativos, fora de Leads, Oportunidades e Funil de vendas.</p></div><Link href="/clientes" className="btn-base btn-secondary btn-sm">Voltar para clientes</Link></div>
      <div className="grid gap-4 p-5 lg:grid-cols-[1fr_1.1fr]"><section className="grid content-start gap-3"><label className="grid gap-2 text-sm font-semibold">Planilha Clientes Garra<input type="file" accept=".xlsx,.xls" disabled={busy} onChange={event => void readFile(event.currentTarget.files?.[0])} className={input} /></label><p className="text-xs text-muted">A leitura é feita no navegador. A planilha original não é enviada para IA nem gravada como arquivo.</p><div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">Telefone, WhatsApp e e-mail vêm sempre da planilha. A consulta CNPJ/IE é manual por linha e os dados empresariais só entram na prévia quando você clicar em aplicar.</div>{!schemaReady && <p role="alert" className="msg-base msg-warning">A migration de base histórica e produtos por cliente ainda não está aplicada. Você pode preparar a prévia, mas a gravação ficará desabilitada.</p>}</section>
        <section><h3 className="mb-2 text-sm font-bold">Mapeamento dos produtos da planilha</h3><p className="mb-3 text-xs text-muted">Cada “SIM” cria um vínculo do produto com o cliente. A mensalidade continua única no cadastro do cliente.</p><div className="grid gap-2 sm:grid-cols-2">{PRODUCT_COLUMNS.map(column => <label key={column.code} className="grid gap-1 text-xs font-semibold">{column.label}<select className={input} value={mapping[column.code] ?? ''} onChange={event => { setMapping(current => ({ ...current, [column.code]: event.target.value })); setCheckedSelection('') }}><option value="">Selecione item do catálogo…</option>{products.map(product => <option key={product.id} value={product.id}>{product.name}{!product.active ? ' (inativo)' : ''}</option>)}</select></label>)}</div>{!products.length && <p className="mt-2 text-xs text-amber-800">Cadastre primeiro os produtos no catálogo do CRM para associá-los nesta importação.</p>}</section></div>
    </div>

    {(error || message) && <p role={error ? 'alert' : 'status'} className={`msg-base ${error ? 'msg-danger' : 'msg-success'}`}>{error || message}</p>}
    {rows.length > 0 && <div className={panel}><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4"><div><h2 className="font-bold">Revisão: {fileName}</h2><p className="text-sm text-muted">{rows.length} linhas · {selectedRows.length} selecionadas · {duplicateRows} repetidas no arquivo</p></div><div className="flex flex-wrap gap-2"><button type="button" disabled={busy || !selectedRows.length} onClick={() => void checkDuplicates()} className="btn-base btn-secondary btn-sm">Verificar duplicidades no CRM</button><button type="button" disabled={busy || !schemaReady || !productSchemaReady || !selectedRows.length || selectedRows.length > 25 || checkedSelection !== selectionKey} onClick={() => void submitImport()} className="btn-base btn-primary btn-sm">{busy ? 'Processando…' : `Importar ${selectedRows.length} selecionados`}</button></div></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-600"><tr>{['Sel.','Razão social / fantasia','CPF/CNPJ · status','Contato da planilha','Mensalidade','Produtos contratados','Consulta CNPJ / IE'].map(label => <th key={label} className="px-3 py-3">{label}</th>)}</tr></thead><tbody>{pageRows.map(row => {
        const taxInvalid = Boolean(row.taxId && !(row.kind === 'individual' ? validCpf(row.taxId) : validCnpj(row.taxId)))
        const duplicate = row.sourceDuplicate || Boolean(row.taxId && existingDocs.has(row.taxId))
        const invalidEmail = Boolean(row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email))
        const selectedProductMissing = row.productCodes.some(code => !mapping[code])
        const cannotSelect = !row.name || !row.status || taxInvalid || invalidEmail || duplicate || selectedProductMissing
        return <tr key={row.id} className="border-t border-slate-100 align-top"><td className="px-3 py-3"><input type="checkbox" checked={selected.has(row.id)} disabled={cannotSelect || busy} onChange={() => toggleRow(row.id)} aria-label={`Selecionar ${row.name}`} /></td><td className="px-3 py-3"><strong>{row.name || 'Sem razão social'}</strong><span className="block text-xs text-muted">{row.tradeName || 'Sem nome fantasia'} · linha {row.rowNumber}</span>{row.enrichment && <button type="button" onClick={() => applyEnrichment(row.id)} className="mt-1 text-xs font-semibold text-blue hover:underline">Aplicar dados cadastrais do CNPJ</button>}</td><td className="px-3 py-3">{row.taxId || 'Documento ausente'}<span className="block text-xs text-muted">{row.status === 'active' ? 'Ativo' : row.status === 'inactive' ? 'Inativo' : 'Status inválido'}</span>{!row.taxId && <span className="block text-xs text-amber-800">Sem documento: seleção manual, sem conferência automática de duplicidade</span>}{taxInvalid && <span className="block text-xs text-red-700">Documento inválido</span>}{row.sourceDuplicate && <span className="block text-xs text-amber-800">Repetido no arquivo</span>}{row.taxId && existingDocs.has(row.taxId) && <span className="block text-xs text-amber-800">Já cadastrado no CRM</span>}</td><td className="px-3 py-3">{row.phone || '—'}<span className="block text-xs text-muted">WhatsApp: {row.whatsapp || '—'}</span><span className="block text-xs text-muted">{row.email || '—'}</span></td><td className="px-3 py-3">{row.monthlyFee == null ? '—' : row.monthlyFee.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}<span className="block text-xs text-muted">Venc.: {row.billingDay ? `dia ${row.billingDay}` : '—'}</span></td><td className="px-3 py-3">{row.productCodes.length ? row.productCodes.join(' + ') : 'Nenhum “SIM”'}{row.productCodes.some(code => !mapping[code]) && <span className="block text-xs text-amber-800">Associe os produtos no mapeamento acima.</span>}{row.unknownProducts.length > 0 && <span className="block text-xs text-amber-800">Revisar: {row.unknownProducts.join(', ')} (somente SIM é importado)</span>}{row.legacyContractStatus && <span className="block text-xs text-muted">Contrato legado: {row.legacyContractStatus}</span>}</td><td className="px-3 py-3"><button type="button" disabled={row.lookupBusy || !validCnpj(row.taxId)} onClick={() => void lookupRow(row.id)} className="btn-base btn-secondary btn-sm">{row.lookupBusy ? 'Consultando…' : 'Consultar CNPJ + IE'}</button>{row.lookupMessage && <span className="mt-1 block max-w-64 text-xs text-muted">{row.lookupMessage}</span>}{row.enrichment && <div className="mt-2 grid gap-1"><span className="text-xs text-muted">Sugestão: {row.enrichment.name || 'sem razão social'} · {row.enrichment.city || 'sem cidade'}/{row.enrichment.state || '—'}</span>{row.inscriptions.length > 1 ? <select aria-label="Selecionar Inscrição Estadual" className={`${input} mt-1`} value={row.stateRegistration} onChange={event => setRows(current => current.map(item => item.id === row.id ? { ...item, stateRegistration: event.target.value } : item))}><option value="">Escolher IE…</option>{row.inscriptions.map((item,index) => <option key={`${item.state}-${item.number}-${index}`} value={item.number}>{item.state ?? 'UF não informada'} · {item.number}{item.active === true ? ' · ativa' : item.active === false ? ' · inativa' : ''}</option>)}</select> : row.stateRegistration ? <span className="text-xs text-muted">IE: {row.stateRegistration}</span> : row.inscriptions.length === 1 ? <button type="button" onClick={() => setRows(current => current.map(item => item.id === row.id ? { ...item, stateRegistration: item.inscriptions[0]?.number ?? '' } : item))} className="text-left text-xs font-semibold text-blue">Usar IE {row.inscriptions[0].number}</button> : null}</div>}</td></tr>
      })}</tbody></table></div><div className="flex items-center justify-between gap-3 border-t border-slate-200 p-3 text-sm"><button disabled={page===0} onClick={()=>setPage(value=>Math.max(0,value-1))} className="btn-base btn-secondary btn-sm">Anterior</button><span className="text-muted">Página {page+1} de {Math.max(1,Math.ceil(rows.length/20))} · até 20 por página</span><button disabled={(page+1)*20>=rows.length} onClick={()=>setPage(value=>Math.min(Math.ceil(rows.length/20)-1,value+1))} className="btn-base btn-secondary btn-sm">Próxima</button></div>
      <div className="border-t border-slate-200 bg-slate-50 p-4 text-xs text-muted">Os dados de telefone, WhatsApp e e-mail são sempre os da planilha, mesmo após consulta. A coluna “CONTRATOS” é guardada como status legado de referência; nenhum contrato ou link Clicksign será criado. Mensalidade é armazenada como referência total, sem gerar cobrança.</div>
    </div>}
  </div>
}
