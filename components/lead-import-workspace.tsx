'use client'

import Link from 'next/link'
import { useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { validCnpj } from '@/lib/crm-validation'
import { repairMojibake } from '@/lib/text-encoding'

type Product = { id: string; name: string; kind: string }
type Activity = { code: string; label: string }
type LeadRow = {
  id: string
  taxId: string
  name: string
  tradeName: string
  phone: string
  email: string
  postalCode: string
  openedAt: string
  addressLine: string
  addressNumber: string
  addressExtra: string
  district: string
  city: string
  state: string
  status: string
  primary: Activity
  secondary: Activity[]
  fileDuplicate: boolean
  formulaField: boolean
}

const card = 'rounded-xl border border-slate-200/80 bg-surface shadow-sm'
const input = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-blue focus:ring-2 focus:ring-blue/15'
const categoryTitles = { food: 'Bares e restaurantes', retail: 'Comércio varejista' } as const
type Category = keyof typeof categoryTitles

async function spreadsheetBytes(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const looksLikeZip = bytes[0] === 0x50 && bytes[1] === 0x4b && [0x03, 0x05, 0x07].includes(bytes[2])
  if (!looksLikeZip) return { bytes, name: file.name }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const minEocd = Math.max(0, bytes.length - 65_557)
  let eocd = -1
  for (let offset = bytes.length - 22; offset >= minEocd; offset--) {
    if (view.getUint32(offset, true) === 0x06054b50) { eocd = offset; break }
  }
  if (eocd < 0) throw new Error('O arquivo parece ZIP, mas está incompleto ou inválido. Baixe-o novamente e tente outra vez.')
  const entries = view.getUint16(eocd + 10, true)
  const centralOffset = view.getUint32(eocd + 16, true)
  if (entries === 0xffff || centralOffset === 0xffffffff) throw new Error('Este arquivo ZIP usa o formato ZIP64, que ainda não é aceito. Extraia o CSV e envie-o diretamente.')

  const candidates: Array<{ name: string; method: number; compressed: number; uncompressed: number; localOffset: number; flags: number }> = []
  let cursor = centralOffset
  for (let index = 0; index < entries; index++) {
    if (cursor + 46 > bytes.length || view.getUint32(cursor, true) !== 0x02014b50) throw new Error('Não foi possível ler o índice do arquivo ZIP.')
    const flags = view.getUint16(cursor + 8, true)
    const method = view.getUint16(cursor + 10, true)
    const compressed = view.getUint32(cursor + 20, true)
    const uncompressed = view.getUint32(cursor + 24, true)
    const nameLength = view.getUint16(cursor + 28, true)
    const extraLength = view.getUint16(cursor + 30, true)
    const commentLength = view.getUint16(cursor + 32, true)
    const localOffset = view.getUint32(cursor + 42, true)
    const name = new TextDecoder().decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength))
    if (/\.(csv|xlsx|xls)$/i.test(name) && !name.endsWith('/')) candidates.push({ name, method, compressed, uncompressed, localOffset, flags })
    cursor += 46 + nameLength + extraLength + commentLength
  }
  candidates.sort((a, b) => Number(!/\.csv$/i.test(a.name)) - Number(!/\.csv$/i.test(b.name)))
  const entry = candidates[0]
  if (!entry) throw new Error('O ZIP não contém um arquivo CSV ou Excel reconhecido.')
  if (entry.uncompressed > 15 * 1024 * 1024) throw new Error('A planilha dentro do ZIP excede o limite de 15 MB.')
  if (entry.flags & 1) throw new Error('A planilha dentro do ZIP está protegida por senha. Envie uma versão sem senha.')
  if (entry.localOffset + 30 > bytes.length || view.getUint32(entry.localOffset, true) !== 0x04034b50) throw new Error('Não foi possível abrir a planilha dentro do ZIP.')
  const dataOffset = entry.localOffset + 30 + view.getUint16(entry.localOffset + 26, true) + view.getUint16(entry.localOffset + 28, true)
  const compressedData = bytes.subarray(dataOffset, dataOffset + entry.compressed)
  if (compressedData.length !== entry.compressed) throw new Error('A planilha dentro do ZIP está incompleta.')
  if (entry.method === 0) return { bytes: compressedData, name: entry.name }
  if (entry.method !== 8 || typeof DecompressionStream === 'undefined') throw new Error('A compactação deste ZIP não é compatível com o navegador. Extraia o CSV e envie-o diretamente.')
  try {
    const blobBuffer = compressedData.slice().buffer as ArrayBuffer
    const stream = new Blob([blobBuffer]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
    const reader = stream.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > 15 * 1024 * 1024) {
        await reader.cancel()
        throw new Error('A planilha dentro do ZIP excede o limite de 15 MB.')
      }
      chunks.push(value)
    }
    const expanded = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) { expanded.set(chunk, offset); offset += chunk.byteLength }
    if (expanded.length !== entry.uncompressed) throw new Error('O tamanho da planilha extraída não confere.')
    return { bytes: expanded, name: entry.name }
  } catch {
    throw new Error('Não foi possível descompactar o arquivo. Extraia o CSV e envie-o diretamente.')
  }
}

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function cellText(value: unknown) {
  if (value == null) return ''
  return repairMojibake(String(value).trim())
}

function normalizeCnpj(value: unknown) {
  const source = cellText(value).toUpperCase().replace(/[.\/-\s]/g, '')
  if (/^\d+$/.test(source)) return source.padStart(14, '0')
  return source
}

function cnaeCode(value: unknown) {
  const found = cellText(value).match(/\d{7}/)
  return found?.[0] ?? ''
}

function cnaeCodes(value: unknown) {
  return [...new Set(cellText(value).match(/\d{7}/g) ?? [])]
}

function excelDateToIso(value: unknown) {
  const text = cellText(value)
  if (!text) return ''
  let year = 0, month = 0, day = 0
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (iso) { year = Number(iso[1]); month = Number(iso[2]); day = Number(iso[3]) }
  else if (br) { day = Number(br[1]); month = Number(br[2]); year = Number(br[3]) }
  else if (/^\d+(\.\d+)?$/.test(text)) {
    const serial = XLSX.SSF.parse_date_code(Number(text))
    if (serial) ({ y: year, m: month, d: day } = serial)
  }
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return ''
  const candidate = new Date(Date.UTC(year, month - 1, day))
  if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) return ''
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`
}

function extractSecondary(codeValue: unknown, descriptionValue: unknown, combinedValue: unknown): Activity[] {
  const labels = new Map<string, string>()
  const combined = cellText(combinedValue)
  const parts = combined.split(/,\s*(?=\d{7}\s*[-–—])/g)
  for (const part of parts) {
    const match = part.match(/^\s*(\d{7})\s*[-–—]\s*(.+?)\s*$/)
    if (match) labels.set(match[1], match[2])
  }
  const codes = cnaeCodes(codeValue)
  const descriptions = cellText(descriptionValue).split(/\s*,\s*/).filter(Boolean)
  if (descriptions.length === codes.length) codes.forEach((code, index) => { if (!labels.has(code) && descriptions[index]) labels.set(code, descriptions[index]) })
  if (!codes.length) {
    for (const [code, label] of labels) codes.push(code)
  }
  return codes.map(code => ({ code, label: labels.get(code) ?? 'Atividade secundária sem descrição' }))
}

function activityForRow(row: LeadRow, categories: Set<Category>, customCodes: Set<string>) {
  const activities = [row.primary, ...row.secondary]
  return activities.find(activity => {
    if (customCodes.has(activity.code)) return true
    if (categories.has('food') && activity.code.startsWith('5611')) return true
    if (categories.has('retail') && activity.code.startsWith('47')) return true
    return false
  })
}

function issueFor(row: LeadRow, fileIds: Set<string>, existingIds: Set<string>) {
  if (!validCnpj(row.taxId) || !/^\d{14}$/.test(row.taxId)) return 'CNPJ inválido ou não compatível com o banco atual'
  if (!row.name || row.name.length < 2) return 'Sem razão social'
  if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) return 'E-mail inválido'
  if (row.fileDuplicate) return 'CNPJ repetido na planilha'
  if (row.formulaField) return 'Há fórmula em um campo selecionado'
  if (existingIds.has(row.taxId)) return 'CNPJ já cadastrado no CRM'
  if (!fileIds.has(row.taxId)) return 'Aguardando conferência no CRM'
  return null
}

export function LeadImportWorkspace({ products, productLoadError }: { products: Product[]; productLoadError: boolean }) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<LeadRow[]>([])
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [categories, setCategories] = useState<Set<Category>>(new Set())
  const [customCodes, setCustomCodes] = useState<Set<string>>(new Set())
  const [draftCategories, setDraftCategories] = useState<Set<Category>>(new Set())
  const [draftCustomCodes, setDraftCustomCodes] = useState<Set<string>>(new Set())
  const [allActivities, setAllActivities] = useState(false)
  const [draftAllActivities, setDraftAllActivities] = useState(false)
  const [activityPickerOpen, setActivityPickerOpen] = useState(false)
  const [activitySearch, setActivitySearch] = useState('')
  const [activeOnly, setActiveOnly] = useState(true)
  const [productId, setProductId] = useState('')
  const [batchNote, setBatchNote] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [existingIds, setExistingIds] = useState<Set<string>>(new Set())
  const [checkedFingerprint, setCheckedFingerprint] = useState('')
  const [checkError, setCheckError] = useState('')
  const [page, setPage] = useState(0)

  const activitySelectionDirty = allActivities !== draftAllActivities || categories.size !== draftCategories.size || [...categories].some(code => !draftCategories.has(code)) || customCodes.size !== draftCustomCodes.size || [...customCodes].some(code => !draftCustomCodes.has(code))
  const eligibleRows = useMemo(() => rows.filter(row => {
    if (activeOnly && normalize(row.status) !== 'ativa') return false
    return allActivities || Boolean(activityForRow(row, categories, customCodes))
  }), [rows, activeOnly, allActivities, categories, customCodes])
  const validRows = useMemo(() => eligibleRows.filter(row => {
    if (!validCnpj(row.taxId) || !/^\d{14}$/.test(row.taxId) || !row.name || row.name.length < 2) return false
    if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) return false
    return !row.fileDuplicate && !row.formulaField
  }), [eligibleRows])
  const validTaxIds = useMemo(() => new Set(validRows.map(row => row.taxId)), [validRows])
  const fingerprint = useMemo(() => validRows.map(row => row.taxId).sort().join('|'), [validRows])
  const hasCurrentDuplicateCheck = !activitySelectionDirty && fingerprint.length > 0 && checkedFingerprint === fingerprint
  const importableRows = useMemo(() => validRows.filter(row => hasCurrentDuplicateCheck && !existingIds.has(row.taxId) && selectedIds.has(row.id)), [validRows, hasCurrentDuplicateCheck, existingIds, selectedIds])
  const backfillRows = useMemo(() => validRows.filter(row => hasCurrentDuplicateCheck && existingIds.has(row.taxId) && Boolean(row.openedAt)), [validRows, hasCurrentDuplicateCheck, existingIds])
  const activities = useMemo(() => {
    const found = new Map<string, Activity>()
    for (const row of rows) for (const activity of [row.primary, ...row.secondary]) {
      if (activity.code && !found.has(activity.code)) found.set(activity.code, activity)
    }
    return [...found.values()].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))
  }, [rows])
  const activityMatches = useMemo(() => {
    const query = normalize(activitySearch)
    if (!query) return activities
    return activities.filter(activity => normalize(`${activity.code} ${activity.label}`).includes(query))
  }, [activities, activitySearch])
  const draftActivityNames = activities.filter(activity => draftCustomCodes.has(activity.code))
  const pageRows = eligibleRows.slice(page * 50, (page + 1) * 50)
  const fileDuplicateRows = rows.filter(row => row.fileDuplicate).length
  const invalidRows = eligibleRows.filter(row => issueFor(row, validTaxIds, existingIds)).length
  const selectedCount = validRows.filter(row => selectedIds.has(row.id) && !existingIds.has(row.taxId)).length

  function resetImport() {
    setRows([]); setFileName(''); setError(''); setMessage(''); setCheckError(''); setExistingIds(new Set()); setCheckedFingerprint(''); setSelectedIds(new Set()); setPage(0)
    setCategories(new Set()); setCustomCodes(new Set()); setDraftCategories(new Set()); setDraftCustomCodes(new Set()); setAllActivities(false); setDraftAllActivities(false); setActivitySearch(''); setActivityPickerOpen(false)
    if (fileInput.current) fileInput.current.value = ''
  }

  async function readFile(file?: File) {
    resetImport()
    if (!file) return
    const extension = file.name.split('.').pop()?.toLowerCase()
    if (!['xlsx', 'xls', 'csv', 'zip'].includes(extension ?? '')) { setError('Selecione um arquivo Excel (.xlsx ou .xls), CSV ou ZIP contendo a planilha.'); return }
    if (file.size > 15 * 1024 * 1024) { setError('O arquivo excede o limite de 15 MB.'); return }
    setBusy(true)
    try {
      const source = await spreadsheetBytes(file)
      const workbook = XLSX.read(source.bytes, { type: 'array', cellFormula: true, cellDates: false })
      const sheetName = workbook.SheetNames.find(name => normalize(name) === 'empresas') ?? workbook.SheetNames[0]
      const worksheet = sheetName ? workbook.Sheets[sheetName] : undefined
      if (!worksheet?.['!ref']) throw new Error('A planilha está vazia ou não contém uma aba de dados.')
      const range = XLSX.utils.decode_range(worksheet['!ref'])
      if (range.e.r > 10_000) throw new Error('A planilha tem mais de 10.000 linhas. Divida a lista em arquivos menores.')
      if (range.e.c > 100) throw new Error('A planilha tem colunas demais para este modelo. Confira o arquivo enviado.')
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, raw: false, defval: '', blankrows: true })
      const headers = (matrix[0] ?? []).map(value => normalize(cellText(value)))
      const findColumn = (...names: string[]) => headers.findIndex(header => names.includes(header))
      const columns = {
        taxId: findColumn('cnpj'), name: findColumn('razao social'), tradeName: findColumn('nome fantasia'),
        status: findColumn('situacao cadastral'), phone: findColumn('telefones', 'telefone'), email: findColumn('email', 'e mail'),
        openedAt: findColumn('data de abertura'),
        addressLine: findColumn('logradouro'), addressNumber: findColumn('numero'), addressExtra: findColumn('complemento'),
        postalCode: findColumn('cep'), district: findColumn('bairro'), city: findColumn('municipio', 'cidade'), state: findColumn('uf'),
        primaryCode: findColumn('codigo da atividade principal', 'codigo atividade principal'),
        primaryLabel: findColumn('descricao da atividade principal', 'descricao atividade principal'),
        secondaryCodes: findColumn('codigos das atividades secundarias', 'codigos atividades secundarias'),
        secondaryCombined: findColumn('atividades secundarias'),
        secondaryLabels: findColumn('descricao das atividades secundarias', 'descricoes das atividades secundarias', 'descricao atividades secundarias'),
      }
      const missing = [columns.taxId < 0 && 'CNPJ', columns.name < 0 && 'Razão Social', columns.primaryCode < 0 && 'Código da Atividade Principal', columns.primaryLabel < 0 && 'Descrição da Atividade Principal'].filter(Boolean)
      if (missing.length) throw new Error(`Este arquivo não segue o modelo esperado. Cabeçalhos ausentes: ${missing.join(', ')}.`)
      const formulaColumns = Object.values(columns).filter(column => column >= 0)
      const seen = new Set<string>()
      const parsed: LeadRow[] = []
      for (let index = 1; index < matrix.length; index++) {
        const cells = matrix[index] ?? []
        if (!cells.some(value => cellText(value))) continue
        const value = (column: number) => column < 0 ? '' : cellText(cells[column])
        const taxId = normalizeCnpj(cells[columns.taxId])
        const primary = { code: cnaeCode(cells[columns.primaryCode]), label: value(columns.primaryLabel) || 'Atividade principal' }
        const secondary = extractSecondary(cells[columns.secondaryCodes], cells[columns.secondaryLabels], cells[columns.secondaryCombined])
        const activityRowNumber = index
        const formulaField = formulaColumns.some(column => Boolean((worksheet[XLSX.utils.encode_cell({ r: activityRowNumber, c: column })] as XLSX.CellObject | undefined)?.f))
        const fileDuplicate = Boolean(taxId && seen.has(taxId))
        if (taxId) seen.add(taxId)
        const extra = value(columns.addressExtra)
        parsed.push({
          id: String(index + 1), taxId, name: value(columns.name), tradeName: value(columns.tradeName), phone: value(columns.phone),
          email: value(columns.email).toLowerCase(), postalCode: value(columns.postalCode).replace(/\D/g, '').padStart(8, '0'),
          openedAt: excelDateToIso(value(columns.openedAt)),
          addressLine: value(columns.addressLine), addressNumber: value(columns.addressNumber),
          addressExtra: /^\*+$/.test(extra) ? '' : extra, district: value(columns.district), city: value(columns.city),
          state: value(columns.state).toUpperCase(), status: value(columns.status), primary, secondary, fileDuplicate, formulaField,
        })
      }
      if (!parsed.length) throw new Error('Não foram encontradas linhas de empresas após o cabeçalho.')
      setFileName(source.name)
      setRows(parsed)
      setSelectedIds(new Set(parsed.filter(row => validCnpj(row.taxId) && /^\d{14}$/.test(row.taxId) && row.name.length >= 2 && !row.fileDuplicate && !row.formulaField && (!row.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email))).map(row => row.id)))
      setMessage(`Planilha lida localmente: ${parsed.length.toLocaleString('pt-BR')} linhas encontradas. Nenhum dado foi enviado ao servidor.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível ler esta planilha.')
    } finally {
      setBusy(false)
    }
  }

  function toggleCategory(category: Category) {
    setDraftCategories(previous => { const next = new Set(previous); if (next.has(category)) next.delete(category); else next.add(category); return next })
    setMessage('')
  }

  function toggleCustom(code: string) {
    setDraftCustomCodes(previous => { const next = new Set(previous); if (next.has(code)) next.delete(code); else next.add(code); return next })
    setMessage('')
  }

  function applyActivityFilter() {
    setCategories(new Set(draftCategories))
    setCustomCodes(new Set(draftCustomCodes))
    setAllActivities(draftAllActivities)
    setPage(0); setExistingIds(new Set()); setCheckedFingerprint(''); setMessage(''); setCheckError('')
    setActivityPickerOpen(false)
  }

  async function checkDuplicates() {
    if (!validRows.length) return
    setBusy(true); setCheckError(''); setMessage(''); setCheckedFingerprint('')
    try {
      const found = new Set<string>()
      for (let offset = 0; offset < validRows.length; offset += 250) {
        const response = await fetch('/api/leads/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operation: 'check', tax_ids: validRows.slice(offset, offset + 250).map(row => row.taxId) }) })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error ?? 'Não foi possível verificar duplicidades.')
        for (const taxId of result.existing_tax_ids ?? []) found.add(String(taxId))
      }
      setExistingIds(found)
      setCheckedFingerprint(fingerprint)
      setMessage(found.size ? `Verificação concluída. ${found.size} CNPJ(s) já existem no CRM e ficarão bloqueados.` : 'Verificação concluída. Nenhum dos CNPJs selecionados consta no CRM.')
    } catch (cause) {
      setCheckError(cause instanceof Error ? cause.message : 'A verificação de duplicidade falhou.')
    } finally { setBusy(false) }
  }

  function toggleSelection(id: string) {
    setSelectedIds(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next })
  }

  function toggleAll() {
    const eligibleIds = validRows.filter(row => !existingIds.has(row.taxId)).map(row => row.id)
    const allSelected = eligibleIds.length > 0 && eligibleIds.every(id => selectedIds.has(id))
    setSelectedIds(previous => { const next = new Set(previous); for (const id of eligibleIds) { if (allSelected) next.delete(id); else next.add(id) } return next })
  }

  async function importSelected() {
    if (!hasCurrentDuplicateCheck || !importableRows.length) return
    setBusy(true); setError(''); setCheckError(''); setMessage('')
    let imported = 0
    try {
      for (let offset = 0; offset < importableRows.length; offset += 25) {
        const batch = importableRows.slice(offset, offset + 25).map(row => {
          const activity = activityForRow(row, categories, customCodes) ?? row.primary
          return {
            tax_id: row.taxId, name: row.name, trade_name: row.tradeName || null, phone: row.phone || null,
            email: row.email || null, postal_code: row.postalCode || null, address_line: row.addressLine || null,
            opened_at: row.openedAt || null,
            address_number: row.addressNumber || null, address_extra: row.addressExtra || null, district: row.district || null,
            city: row.city || null, state: row.state || null,
            primary_cnae: row.primary.code ? `${row.primary.code}${row.primary.label ? ` · ${row.primary.label}` : ''}`.slice(0, 100) : null,
            business_activity: activity.label.slice(0, 150),
          }
        })
        const response = await fetch('/api/leads/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operation: 'import', rows: batch, product_id: productId || null, note: batchNote || null }) })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error ?? 'O CRM recusou um dos lotes.')
        imported += Number(result.imported ?? 0)
      }
      setMessage(`${imported.toLocaleString('pt-BR')} lead(s) importado(s). Eles já estão separados de Clientes e Oportunidades.`)
      setSelectedIds(new Set())
      setCheckedFingerprint('')
    } catch (cause) {
      setError(`${imported ? `${imported} lead(s) foram importados antes do erro. ` : ''}${cause instanceof Error ? cause.message : 'Não foi possível concluir a importação.'}`)
      setCheckedFingerprint('')
    } finally { setBusy(false) }
  }

  async function updateExistingLeadOpeningDates() {
    if (!hasCurrentDuplicateCheck || !backfillRows.length || busy) return
    const accepted = window.confirm(`Completar a data de abertura de até ${backfillRows.length} lead(s) existente(s)? Somente datas vazias serão preenchidas; datas já cadastradas serão preservadas.`)
    if (!accepted) return
    setBusy(true); setError(''); setCheckError(''); setMessage('')
    let updated = 0
    try {
      for (let offset = 0; offset < backfillRows.length; offset += 25) {
        const batch = backfillRows.slice(offset, offset + 25).map(row => ({ tax_id: row.taxId, opened_at: row.openedAt }))
        const response = await fetch('/api/leads/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operation: 'backfill_opened_at', rows: batch }) })
        const result = await response.json()
        updated += Number(result.updated ?? 0)
        if (!response.ok) throw new Error(result.error ?? 'Não foi possível completar as datas dos leads existentes.')
      }
      setMessage(`${updated.toLocaleString('pt-BR')} data(s) de abertura preenchida(s) em leads existentes. Nenhuma data já cadastrada foi substituída.`)
    } catch (cause) {
      setError(`${updated ? `${updated} data(s) foram preenchidas antes do erro. ` : ''}${cause instanceof Error ? cause.message : 'Não foi possível concluir a atualização.'}`)
    } finally { setBusy(false) }
  }

  return <>
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs font-bold uppercase tracking-[.14em] text-blue">Relacionamento · Leads</p><h1 className="mt-1 text-[30px] font-bold tracking-tight">Captação por planilha</h1><p className="mt-1 max-w-3xl text-[15px] text-muted">Envie cada nova planilha, escolha os ramos que deseja prospectar e revise os registros antes de criar leads.</p></div>
      <div className="flex flex-wrap gap-2"><Link href="/leads/importar/casa-dos-dados" className="rounded-lg bg-blue px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">Pesquisar CNPJs pela API</Link><Link href="/leads" className="rounded-lg border border-slate-300 bg-surface px-4 py-2.5 text-sm font-semibold text-ink hover:bg-slate-50">Voltar aos leads</Link></div>
    </div>

    <div className="mb-6 flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900"><span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-blue">Leitura local</span><span>O arquivo é processado no navegador. Nenhum dado é enviado a uma IA externa. Ao importar, o CRM recebe somente os campos permitidos e as linhas selecionadas.</span></div>

    <div className="mb-6 grid gap-4 md:grid-cols-3">{[
      ['1', 'Enviar planilha', 'Excel ou CSV no modelo de empresas.'],
      ['2', 'Escolher atividades', 'Filtrar pelo CNAE principal ou secundário.'],
      ['3', 'Revisar e importar', 'Conferir duplicidades e confirmar os leads.'],
    ].map(([number, title, description], index) => <article key={number} className={`${card} p-4`}><div className="flex items-center gap-3"><span className={`grid h-8 w-8 place-items-center rounded-full text-sm font-bold ${index === 0 ? 'bg-blue text-white' : 'bg-slate-100 text-slate-500'}`}>{number}</span><h2 className="font-bold">{title}</h2></div><p className="mt-2 pl-11 text-sm leading-5 text-muted">{description}</p></article>)}</div>

    {(error || message || checkError) && <div role={error || checkError ? 'alert' : 'status'} className={`mb-5 rounded-lg border px-4 py-3 text-sm ${error || checkError ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{error || checkError || message}</div>}

    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(380px,.95fr)]">
      <section className={`${card} p-5`}>
        <div className="mb-4 flex items-start justify-between gap-4"><div><h2 className="text-lg font-bold">1. Arquivo de origem</h2><p className="mt-1 text-sm text-muted">A planilha fica apenas no navegador durante a preparação do lote.</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">Até 15 MB · 10.000 linhas</span></div>
        <label onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void readFile(event.dataTransfer.files?.[0]) }} className="flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-5 py-7 text-center hover:border-blue-400 hover:bg-blue-50/50">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-blue-100 text-xl font-bold text-blue">↑</span><span className="mt-3 text-sm font-bold">{busy ? 'Processando...' : fileName || 'Arraste a planilha para cá'}</span><span className="mt-1 text-sm text-muted">ou selecione Excel (.xlsx, .xls), CSV ou ZIP</span><span className="mt-3 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-ink">Selecionar arquivo</span>
          <input ref={fileInput} type="file" accept=".xlsx,.xls,.csv,.zip" disabled={busy} onChange={event => void readFile(event.currentTarget.files?.[0])} className="sr-only" aria-label="Selecionar planilha para importar leads" />
        </label>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted">Aba `empresas`; são lidos apenas CNPJ, razão social, nome fantasia, contato, endereço, data de abertura e CNAEs.</p>{fileName && <button type="button" onClick={resetImport} disabled={busy} className="text-sm font-semibold text-blue hover:underline">Limpar arquivo</button>}</div>
        {productLoadError && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">O catálogo de produtos não carregou. Você ainda pode importar os leads sem produto associado.</p>}
        <div className="mt-5 rounded-lg border border-slate-200 p-4"><h3 className="font-semibold">Validações do arquivo</h3><ul className="mt-3 grid gap-2 text-sm text-muted"><li>O CNPJ precisa ser válido e não pode repetir outra linha do arquivo.</li><li>Empresas já cadastradas em Clientes ou Leads ficam sinalizadas e bloqueadas.</li><li>Linhas sem razão social ou com fórmulas em campos importáveis não são importadas.</li><li>As demais colunas, abas, fórmulas e dados societários são ignorados.</li></ul></div>
      </section>

      <section className={`${card} p-5`}>
        <div className="mb-4 flex items-start justify-between gap-4"><div><h2 className="text-lg font-bold">Campos que serão aproveitados</h2><p className="mt-1 text-sm text-muted">Mapeamento fixo por cabeçalho do arquivo, sem IA externa.</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">Somente selecionados</span></div>
        <div className="grid gap-2 sm:grid-cols-2">{[
          ['Razão social', 'Razao Social'], ['Nome fantasia', 'Nome Fantasia'], ['CNPJ', 'Chave para duplicidade'],
          ['Telefone', 'Telefones'], ['E-mail', 'E-mail'], ['Endereço', 'Logradouro, número, CEP, bairro, município e UF'],
          ['Data de abertura', 'Data de Abertura'],
          ['Ramo de atividade', 'CNAE principal e secundário correspondentes'], ['Produto/serviço', 'Definido por você para o lote'], ['Observações', 'Texto opcional definido por você'],
        ].map(([title, detail]) => <div key={title} className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"><span aria-hidden="true" className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded border border-blue-500 bg-blue text-xs font-bold text-white">✓</span><span><strong className="block text-ink">{title}</strong><span className="block text-xs text-muted">{detail}</span></span></div>)}</div>
        <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-muted"><strong className="text-ink">Não entram no CRM:</strong> natureza jurídica, capital social, sócios, porte, dados do Simples/MEI, datas de consulta e qualquer outra coluna não listada.</div>
      </section>
    </div>

    <section className={`${card} mt-6 p-5`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold">2. Escolher atividades para prospectar</h2><p className="mt-1 text-sm text-muted">Escolha CNAEs no seletor. Os atalhos de bares e varejo também entram no filtro quando marcados; para filtrar somente CNAEs específicos, deixe os atalhos desmarcados. A empresa aparece uma vez, mesmo que o CNAE esteja em atividade principal e secundária.</p></div><span className="rounded-full bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-cyan-800">{eligibleRows.length.toLocaleString('pt-BR')} empresas no filtro</span></div>
      {!rows.length && <p className="mb-4 rounded-lg border border-dashed border-slate-300 p-4 text-sm text-muted">Envie uma planilha para habilitar a seleção de atividades.</p>}
      <label className={`mb-3 flex cursor-pointer items-start gap-3 rounded-lg border p-4 text-sm ${draftAllActivities ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-surface'}`}><input type="checkbox" checked={draftAllActivities} disabled={!rows.length} onChange={event => setDraftAllActivities(event.target.checked)} className="mt-0.5 accent-blue" /><span><strong className="block">A planilha já está tratada: considerar todas as atividades</strong><span className="mt-1 block text-muted">Inclui todas as empresas do arquivo sem aplicar outro filtro de CNAE. A validação de CNPJ, a checagem de duplicados e a revisão antes de gravar continuam valendo.</span></span></label>
      <div className="grid gap-3 lg:grid-cols-3">
        {([['food', 'Bares e restaurantes', 'CNAE 5611: restaurantes, bares, lanchonetes e similares.'], ['retail', 'Comércio varejista', 'Todos os CNAEs do grupo 47, principal ou secundário.']] as const).map(([key,title,description]) => <button key={key} type="button" disabled={!rows.length} aria-pressed={draftCategories.has(key)} onClick={() => toggleCategory(key)} className={`rounded-lg border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${draftCategories.has(key) ? 'border-blue-400 bg-blue-50' : 'border-slate-200 bg-surface hover:border-slate-300'}`}><span className="flex items-start gap-3"><span className={`grid h-5 w-5 shrink-0 place-items-center rounded border text-xs font-bold ${draftCategories.has(key) ? 'border-blue-600 bg-blue text-white' : 'border-slate-300 bg-white text-transparent'}`}>✓</span><span><strong className="block">{title}</strong><span className="mt-1 block text-sm text-muted">{description}</span></span></span></button>)}
        <div className="relative rounded-lg border border-slate-200 p-4"><p className="text-sm font-semibold">Outras atividades · CNAE principal e secundário</p><button type="button" disabled={!rows.length} aria-expanded={activityPickerOpen} onClick={() => setActivityPickerOpen(open => !open)} className={`${input} mt-2 flex items-center justify-between gap-3 text-left disabled:cursor-not-allowed disabled:opacity-60`}><span>{draftCustomCodes.size ? `${draftCustomCodes.size} atividade(s) selecionada(s)` : 'Selecionar CNAEs da planilha'}</span><span aria-hidden="true">{activityPickerOpen ? '▲' : '▼'}</span></button>{draftActivityNames.length > 0 && <p className="mt-2 line-clamp-2 text-xs text-muted">{draftActivityNames.slice(0, 3).map(activity => `${activity.code} · ${activity.label}`).join(' | ')}{draftActivityNames.length > 3 ? ` | +${draftActivityNames.length - 3}` : ''}</p>}
          {activityPickerOpen && <div className="absolute inset-x-3 top-[calc(100%-0.25rem)] z-20 rounded-lg border border-slate-300 bg-white p-3 shadow-xl"><label className="block text-sm font-medium">Pesquisar CNAE ou descrição<input autoFocus value={activitySearch} onChange={event => setActivitySearch(event.target.value)} placeholder="Ex.: 4723700 ou bebidas" className={`${input} mt-1.5`} /></label><div className="mt-2 max-h-64 overflow-y-auto rounded-md border border-slate-200">{activityMatches.length ? activityMatches.map(activity => <label key={activity.code} className="flex cursor-pointer items-start gap-2 border-b border-slate-100 px-3 py-2 text-sm last:border-0 hover:bg-blue-50"><input type="checkbox" checked={draftCustomCodes.has(activity.code)} onChange={() => toggleCustom(activity.code)} className="mt-1 accent-blue" /><span><span className="font-semibold">{activity.code}</span><span className="block text-muted">{activity.label}</span></span></label>) : <p className="p-3 text-sm text-muted">Nenhuma atividade encontrada nesta planilha.</p>}</div><div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted"><span>{activities.length} CNAEs disponíveis · {draftCustomCodes.size} selecionados</span><div className="flex gap-3"><button type="button" onClick={() => setDraftCustomCodes(previous => new Set([...previous, ...activityMatches.map(activity => activity.code)]))} disabled={!activityMatches.length} className="font-semibold text-blue hover:underline disabled:opacity-50">Selecionar resultados</button><button type="button" onClick={() => setDraftCustomCodes(new Set())} className="font-semibold text-blue hover:underline">Limpar seleção</button></div></div><button type="button" onClick={applyActivityFilter} disabled={busy || (!draftCustomCodes.size && !draftCategories.size && !draftAllActivities)} className="mt-3 w-full rounded-lg bg-blue px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300">Aplicar seleção e mostrar empresas</button></div>}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 px-4 py-3"><label className="flex cursor-pointer items-center gap-2 text-sm font-medium"><input type="checkbox" checked={activeOnly} onChange={event => {setActiveOnly(event.target.checked);setPage(0);setCheckedFingerprint('');setMessage('')}} className="accent-blue" />Considerar somente empresas com situação cadastral ativa</label><span className="text-sm text-muted">{eligibleRows.length.toLocaleString('pt-BR')} correspondem · {invalidRows.toLocaleString('pt-BR')} precisam de revisão · {fileDuplicateRows.toLocaleString('pt-BR')} repetidas no arquivo</span></div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted">{activitySelectionDirty ? 'A nova opção ainda não foi aplicada.' : allActivities ? 'A lista considera todas as atividades da planilha.' : 'A lista usa as atividades selecionadas.'}</p><button type="button" onClick={applyActivityFilter} disabled={!rows.length || busy} className="rounded-lg bg-blue px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300">{draftAllActivities ? 'Aplicar e mostrar planilha completa' : 'Filtrar planilha e mostrar empresas'}</button></div>
      <div className="mt-4 grid gap-4 md:grid-cols-2"><label className="grid gap-1.5 text-sm font-medium">Produto/serviço de interesse para este lote<select value={productId} onChange={event => setProductId(event.target.value)} className={input}><option value="">Deixar sem vínculo</option>{products.map(product => <option key={product.id} value={product.id}>{product.name} · {product.kind === 'service' ? 'Serviço' : 'Produto'}</option>)}</select><span className="text-xs font-normal text-muted">O produto não vem da planilha. Esta escolha será aplicada aos leads que você importar.</span></label><label className="grid gap-1.5 text-sm font-medium">Observação para este lote<textarea value={batchNote} maxLength={2000} onChange={event => setBatchNote(event.target.value)} rows={2} placeholder="Ex.: Prospecção regional de novembro" className={input} /><span className="text-xs font-normal text-muted">Será registrada como observação comercial dos leads importados.</span></label></div>
      {rows.length > 0 && <div className="mt-4 flex flex-wrap items-center gap-3"><button type="button" onClick={checkDuplicates} disabled={busy || activitySelectionDirty || !validRows.length} className="rounded-lg border border-slate-300 bg-surface px-4 py-2.5 text-sm font-semibold text-ink hover:bg-slate-50 disabled:opacity-50">{busy ? 'Aguarde...' : hasCurrentDuplicateCheck ? 'Verificar novamente' : 'Verificar duplicidades no CRM'}</button>{hasCurrentDuplicateCheck && <span className="text-sm text-muted">{existingIds.size ? `${existingIds.size} já cadastrados` : 'Nenhum CNPJ já cadastrado'}</span>}{hasCurrentDuplicateCheck && backfillRows.length > 0 && <button type="button" onClick={() => void updateExistingLeadOpeningDates()} disabled={busy} className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50">{busy ? 'Atualizando...' : `Completar abertura de ${backfillRows.length} lead(s) existente(s)`}</button>}</div>}
    </section>

    <section className={`${card} mt-6 overflow-hidden`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4"><div><h2 className="font-bold">3. Revisão antes de importar</h2><p className="mt-1 text-sm text-muted">Revise os dados mapeados. As linhas inválidas e duplicadas ficam bloqueadas.</p></div><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">{activitySelectionDirty ? 'Seleção de atividades pendente' : `${selectedCount.toLocaleString('pt-BR')} selecionados para importação`}</span></div>
      {!eligibleRows.length ? <p className="px-5 py-10 text-center text-sm text-muted">Envie uma planilha e aplique um filtro ou escolha considerar todas as atividades.</p> : <>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3"><label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={validRows.length > 0 && validRows.filter(row => !existingIds.has(row.taxId)).every(row => selectedIds.has(row.id))} onChange={toggleAll} className="accent-blue" />Selecionar todos os registros válidos{allActivities ? ' da planilha' : ' do filtro'}</label><span className="text-xs text-muted">Exibindo {page * 50 + 1}–{Math.min((page + 1) * 50, eligibleRows.length)} de {eligibleRows.length.toLocaleString('pt-BR')}</span></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-left text-sm"><thead><tr className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">{['','Razão social / nome fantasia','CNPJ','Contato','Ramo de atividade','Abertura','Validação'].map((title,index) => <th key={`${title}-${index}`} className="px-4 py-3 font-semibold">{title}</th>)}</tr></thead><tbody>{pageRows.map(row => {const issue=issueFor(row,validTaxIds,existingIds);const activity=activityForRow(row,categories,customCodes) ?? (allActivities ? row.primary : null);const blocked=Boolean(issue);return <tr key={row.id} className="border-t border-slate-100 align-top"><td className="px-4 py-3"><input type="checkbox" aria-label={`Selecionar ${row.name}`} checked={selectedIds.has(row.id)} disabled={blocked} onChange={() => toggleSelection(row.id)} className="accent-blue" /></td><td className="px-4 py-3 font-semibold">{row.name}<span className="block text-xs font-normal text-muted">{row.tradeName || 'Sem nome fantasia'}</span></td><td className="px-4 py-3 font-mono text-xs">{row.taxId || '—'}</td><td className="px-4 py-3">{row.phone || row.email || '—'}<span className="block text-xs text-muted">{row.phone && row.email ? row.email : ''}</span></td><td className="px-4 py-3">{activity ? <><span>{activity.label}</span><span className="block text-xs text-muted">CNAE {activity.code}{activity.code === row.primary.code ? ' · principal' : ' · secundário'}</span></> : '—'}</td><td className="px-4 py-3">{row.openedAt ? new Date(`${row.openedAt}T12:00:00`).toLocaleDateString('pt-BR') : '—'}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${issue ? 'bg-amber-50 text-amber-800' : hasCurrentDuplicateCheck ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{issue ?? (hasCurrentDuplicateCheck ? 'Pronto para importar' : 'Aguardando conferência')}</span></td></tr>})}</tbody></table></div>
        {eligibleRows.length > 50 && <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3"><button type="button" disabled={page === 0} onClick={() => setPage(value => Math.max(0,value-1))} className="rounded border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50">Anterior</button><span className="text-xs text-muted">Página {page+1} de {Math.ceil(eligibleRows.length/50)}</span><button type="button" disabled={(page+1)*50>=eligibleRows.length} onClick={() => setPage(value => value+1)} className="rounded border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50">Próxima</button></div>}
      </>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4"><p className="text-sm text-muted">Os registros importados entram em <Link href="/leads" className="font-semibold text-blue hover:underline">Leads</Link>, separados de Clientes e Oportunidades.</p><button type="button" onClick={() => void importSelected()} disabled={busy || !hasCurrentDuplicateCheck || !importableRows.length} className="rounded-lg bg-blue px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500">{busy ? 'Processando...' : `Importar ${importableRows.length.toLocaleString('pt-BR')} leads selecionados`}</button></div>
    </section>
    <section className="mt-6 rounded-xl border border-cyan-200 bg-cyan-50/70 p-5"><h2 className="font-bold">Quando iniciar uma negociação</h2><p className="mt-1 max-w-4xl text-sm leading-6 text-slate-700">Os registros ficam como Leads. Quando houver interesse real, a equipe poderá aproveitar os mesmos dados para criar o cliente e abrir uma oportunidade no funil, sem duplicar a pessoa.</p></section>
  </>
}
