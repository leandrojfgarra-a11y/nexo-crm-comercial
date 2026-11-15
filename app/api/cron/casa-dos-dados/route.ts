import { timingSafeEqual } from 'node:crypto'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'
import { NextResponse, type NextRequest } from 'next/server'
import { validCnpj } from '@/lib/crm-validation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const apiBase = 'https://api.casadosdados.com.br'
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type SavedSearch = {
  id: string
  company_id: string
  name: string
  filters: Record<string, unknown>
  last_run_at: string | null
  last_opened_through: string | null
  last_request_id: string | null
}
type ImportRow = Record<string, unknown>

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
}

function sameSecret(candidate: string, expected: string) {
  const a = Buffer.from(candidate)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

function saoPauloDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function previousDay(day: string) {
  const date = new Date(`${day}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

function nextDay(day: string) {
  const date = new Date(`${day}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

function createExportPayload(search: SavedSearch, from: string, to: string) {
  const filters = search.filters
  const codes = Array.isArray(filters.cnaeCodes) ? filters.cnaeCodes.filter((code): code is string => typeof code === 'string' && /^\d{7}$/.test(code)) : []
  const limit = Number(filters.limit)
  if (!codes.length || !Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error(`A pesquisa “${search.name}” tem CNAEs ou limite inválidos.`)
  const query: Record<string, unknown> = {
    codigo_atividade_principal: codes,
    incluir_atividade_secundaria: true,
    codigo_atividade_secundaria: codes,
    data_abertura: { inicio: from, fim: to },
    limite: limit,
    pagina: 1,
  }
  if (filters.activeOnly !== false) query.situacao_cadastral = ['ATIVA']
  if (typeof filters.uf === 'string' && /^[A-Z]{2}$/i.test(filters.uf)) query.uf = [filters.uf.toLowerCase()]
  if (typeof filters.municipality === 'string' && filters.municipality.trim()) query.municipio = [filters.municipality.trim().slice(0, 100)]
  return { total_linhas: limit, nome: `${search.name} - ${from}`, tipo: 'csv', pesquisa: query }
}

function normalizeKey(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').replace(/[^a-z0-9]/g, '')
}

function value(row: ImportRow, ...aliases: string[]) {
  const keys = new Map(Object.keys(row).map(key => [normalizeKey(key), key]))
  for (const alias of aliases) {
    const key = keys.get(normalizeKey(alias))
    const found = key ? row[key] : undefined
    if (found !== undefined && found !== null && String(found).trim() !== '') return String(found).trim()
  }
  return ''
}

function dateOnly(input: string): string | null {
  if (!input) return null
  const br = input.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/)
  const candidate = br ? `${br[3]}-${br[2]}-${br[1]}` : input.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) && !Number.isNaN(Date.parse(`${candidate}T00:00:00Z`)) ? candidate : null
}

function csvRows(buffer: Buffer): ImportRow[] {
  const workbook = XLSX.read(buffer, { type: 'buffer', raw: false, cellDates: false })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) return []
  return XLSX.utils.sheet_to_json<ImportRow>(workbook.Sheets[sheetName], { defval: '', raw: false })
}

function mapCompany(row: ImportRow) {
  const taxId = value(row, 'CNPJ', 'CNPJ/CPF', 'Documento', 'tax_id').replace(/\D/g, '')
  const openedAt = dateOnly(value(row, 'Data de abertura', 'Abertura', 'Data abertura', 'opened_at'))
  const mainCnae = value(row, 'CNAE fiscal', 'CNAE principal', 'Código CNAE principal', 'Atividade principal', 'primary_cnae').replace(/\D/g, '').slice(0, 7)
  const name = value(row, 'Razão social', 'Nome empresarial', 'Razao social', 'Nome', 'name')
  const rawComplement = value(row, 'Complemento', 'address_extra')
  const activity = value(row, 'Descrição CNAE', 'Atividade principal', 'Ramo de atividade', 'business_activity')
  return {
    tax_id: taxId,
    name,
    trade_name: value(row, 'Nome fantasia', 'Fantasia', 'trade_name') || null,
    email: value(row, 'E-mail', 'Email', 'email').toLowerCase() || null,
    phone: value(row, 'Telefone', 'Telefones', 'DDD telefone 1', 'Telefone 1', 'phone') || null,
    postal_code: value(row, 'CEP', 'postal_code').replace(/\D/g, '').slice(0, 8) || null,
    address_line: value(row, 'Logradouro', 'Endereço', 'Endereco', 'address_line') || null,
    address_number: value(row, 'Número', 'Numero', 'address_number') || null,
    address_extra: rawComplement && !/^\*+$/.test(rawComplement) ? rawComplement : null,
    district: value(row, 'Bairro', 'district') || null,
    city: value(row, 'Município', 'Municipio', 'Cidade', 'city') || null,
    state: value(row, 'UF', 'Estado', 'state').toUpperCase().slice(0, 2) || null,
    opened_at: openedAt,
    primary_cnae: mainCnae || null,
    business_activity: activity || null,
  }
}

function matchesSavedFilters(row: ImportRow, company: ReturnType<typeof mapCompany>, filters: Record<string, unknown>) {
  if (filters.activeOnly !== false && !/^(ativa|ativo|2|situacao ativa)$/i.test(value(row, 'Situação cadastral', 'Situacao cadastral', 'Situação', 'Status'))) return false
  if (typeof filters.uf === 'string' && filters.uf && company.state !== filters.uf.toUpperCase()) return false
  if (typeof filters.municipality === 'string' && filters.municipality && !(company.city ?? '').toLocaleLowerCase('pt-BR').includes(filters.municipality.toLocaleLowerCase('pt-BR'))) return false
  const from = typeof filters.openedFrom === 'string' ? filters.openedFrom : null
  const to = typeof filters.openedTo === 'string' ? filters.openedTo : null
  if ((from || to) && (!company.opened_at || (from && company.opened_at < from) || (to && company.opened_at > to))) return false
  const selected = Array.isArray(filters.cnaeCodes) ? filters.cnaeCodes.filter((code): code is string => typeof code === 'string').map(code => code.replace(/\D/g, '')) : []
  if (selected.length) {
    const activityCodes = [value(row, 'CNAE fiscal', 'CNAE principal', 'Código CNAE principal', 'primary_cnae'), value(row, 'CNAE secundário', 'CNAEs secundários', 'Atividades secundárias', 'secondary_cnae')].join(' ').match(/\d{7}/g) ?? []
    if (!activityCodes.some(code => selected.includes(code))) return false
  }
  return true
}

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  return response.json().catch(() => ({})) as Promise<Record<string, unknown>>
}

async function retrieveExport(id: string, apiKey: string): Promise<{ state: 'ready'; bytes: Buffer } | { state: 'processing' } | { state: 'error'; message: string }> {
  const response = await fetch(`${apiBase}/v4/public/cnpj/pesquisa/arquivo/${id}`, { headers: { 'api-key': apiKey }, cache: 'no-store', signal: AbortSignal.timeout(12_000) })
  const contentType = response.headers.get('content-type') ?? ''
  if (response.ok && /text\/csv|application\/octet-stream|application\/vnd.openxmlformats/i.test(contentType)) {
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length > 15 * 1024 * 1024) return { state: 'error', message: 'O arquivo excede o limite de 15 MB para processamento automático.' }
    return { state: 'ready', bytes }
  }
  if (!response.ok) return response.status === 404 ? { state: 'processing' } : { state: 'error', message: `A Casa dos Dados respondeu HTTP ${response.status} ao consultar o arquivo.` }

  const result = await responseJson(response)
  const nested = [result.data, result.arquivo, result.resultado].find(item => item && typeof item === 'object' && !Array.isArray(item) && typeof (item as Record<string, unknown>).link === 'string') as Record<string, unknown> | undefined
  const link = typeof result.link === 'string' ? result.link : nested?.link
  if (typeof link === 'string' && link) {
    let url: URL
    try { url = new URL(link) } catch { return { state: 'error', message: 'A API devolveu um link de arquivo inválido.' } }
    if (url.protocol !== 'https:') return { state: 'error', message: 'A API devolveu um link de download inseguro.' }
    const download = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(20_000) })
    if (!download.ok) return { state: 'processing' }
    const bytes = Buffer.from(await download.arrayBuffer())
    if (bytes.length > 15 * 1024 * 1024) return { state: 'error', message: 'O arquivo excede o limite de 15 MB para processamento automático.' }
    return { state: 'ready', bytes }
  }

  const list = await fetch(`${apiBase}/v4/cnpj/pesquisa/arquivo?pagina=1`, { headers: { 'api-key': apiKey }, cache: 'no-store', signal: AbortSignal.timeout(8_000) }).catch(() => null)
  if (list?.ok) {
    const payload = await list.json().catch(() => null) as unknown
    const records = Array.isArray(payload) ? payload : Array.isArray((payload as Record<string, unknown> | null)?.data) ? (payload as { data: unknown[] }).data : []
    const record = records.find(item => item && typeof item === 'object' && (item as Record<string, unknown>).arquivo_uuid === id) as Record<string, unknown> | undefined
    if (record && /erro|falh|cancel|fail/i.test(String(record.status ?? ''))) return { state: 'error', message: `A Casa dos Dados informou falha no arquivo: ${String(record.status).slice(0, 100)}.` }
  }
  return { state: 'processing' }
}

async function run(request: NextRequest) {
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const accepted = [process.env.CRON_SECRET, process.env.PROSPECTING_CRON_SECRET].filter((secret): secret is string => Boolean(secret?.trim()))
  if (!supplied || !accepted.some(secret => sameSecret(supplied, secret))) return json({ error: 'Não autorizado.' }, 401)

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  const casaApiKey = process.env.CASA_DOS_DADOS_API_KEY
  if (!supabaseUrl || !serviceRoleKey || !casaApiKey) return json({ error: 'Configure as chaves privadas do Supabase e da Casa dos Dados no ambiente do servidor.' }, 503)

  const supabase = createSupabaseClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: searches, error } = await supabase.from('lead_prospecting_filters')
    .select('id,company_id,name,filters,last_run_at,last_opened_through,last_request_id').not('company_id', 'is', null).eq('daily_enabled', true).order('company_id').order('created_at')
  if (error) return json({ error: 'Não foi possível carregar as pesquisas diárias. Confira a migration manual de filtros salvos.' }, 503)

  const today = saoPauloDate()
  const throughToday = previousDay(today)
  const results: Array<{ name: string; status: 'imported' | 'requested' | 'skipped' | 'error'; opened_from?: string; opened_to?: string; request_id?: string; imported?: number; duplicates?: number; message?: string }> = []
  for (const search of (searches ?? []) as SavedSearch[]) {
    let requestId = search.last_request_id
    let from: string
    let through: string
    if (requestId) {
      // Resume the exact export already paid for; never create a duplicate request while it is pending.
      through = search.last_run_at ? previousDay(saoPauloDate(new Date(search.last_run_at))) : throughToday
      from = search.last_opened_through ? nextDay(search.last_opened_through) : through
    } else {
      if (search.last_run_at && saoPauloDate(new Date(search.last_run_at)) === today) {
        results.push({ name: search.name, status: 'skipped', message: 'Já executada hoje.' })
        continue
      }
      through = throughToday
      from = search.last_opened_through ? nextDay(search.last_opened_through) : through
      if (from > through) {
        results.push({ name: search.name, status: 'skipped', message: 'Ainda não há um dia completo novo para pesquisar.' })
        continue
      }
      try {
        const response = await fetch(`${apiBase}/v5/cnpj/pesquisa/arquivo`, {
          method: 'POST', headers: { 'api-key': casaApiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify(createExportPayload(search, from, through)), cache: 'no-store', signal: AbortSignal.timeout(20_000),
        })
        const body = await responseJson(response)
        if (!response.ok || typeof body.arquivo_uuid !== 'string' || !uuidPattern.test(body.arquivo_uuid)) {
          results.push({ name: search.name, status: 'error', opened_from: from, opened_to: through, message: `A Casa dos Dados respondeu HTTP ${response.status}; nenhuma importação foi confirmada.` })
          continue
        }
        requestId = body.arquivo_uuid
        const { error: updateError } = await supabase.from('lead_prospecting_filters').update({ last_run_at: new Date().toISOString(), last_request_id: requestId }).eq('company_id', search.company_id).eq('id', search.id)
        if (updateError) {
          results.push({ name: search.name, status: 'error', opened_from: from, opened_to: through, request_id: requestId, message: 'O arquivo foi solicitado, mas o identificador não pôde ser salvo. Não repita manualmente para evitar cobrança duplicada.' })
          continue
        }
      } catch {
        results.push({ name: search.name, status: 'error', opened_from: from, opened_to: through, message: 'Falha de rede ao solicitar a exportação; nenhuma importação foi confirmada.' })
        continue
      }
    }

    try {
      // Wait briefly for this already-requested export. Never submit another paid request
      // while the provider is still preparing the CSV.
      let file = await retrieveExport(requestId!, casaApiKey)
      for (let attempt = 0; file.state === 'processing' && attempt < 3; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 2_000))
        file = await retrieveExport(requestId!, casaApiKey)
      }
      if (file.state === 'processing') {
        results.push({ name: search.name, status: 'requested', opened_from: from, opened_to: through, request_id: requestId!, message: 'A exportação continua processando após quatro verificações. O próximo cron retomará a mesma solicitação, sem gerar outra cobrança.' })
        continue
      }
      if (file.state === 'error') {
        results.push({ name: search.name, status: 'error', opened_from: from, opened_to: through, request_id: requestId!, message: file.message })
        continue
      }
      const rows = csvRows(file.bytes)
      const mapped = new Map<string, ReturnType<typeof mapCompany>>()
      for (const row of rows) {
        const company = mapCompany(row)
        if (!company.name || !validCnpj(company.tax_id) || !matchesSavedFilters(row, company, search.filters)) continue
        mapped.set(company.tax_id, company)
      }
      const companies = [...mapped.values()]
      const existingIds = new Set<string>()
      for (let offset = 0; offset < companies.length; offset += 100) {
        const ids = companies.slice(offset, offset + 100).map(company => company.tax_id)
        const { data: found, error: existingError } = await supabase.from('people').select('tax_id').eq('company_id', search.company_id).in('tax_id', ids)
        if (existingError) throw new Error('Falha ao verificar duplicidades existentes no CRM.')
        for (const row of found ?? []) if (typeof row.tax_id === 'string') existingIds.add(row.tax_id.replace(/\D/g, ''))
      }
      const fresh = companies.filter(company => !existingIds.has(company.tax_id))
      let imported = 0
      const notes = `Prospecção automática Casa dos Dados · pesquisa “${search.name}” · abertura ${from} a ${through}.`
      for (let offset = 0; offset < fresh.length; offset += 50) {
        const batch = fresh.slice(offset, offset + 50)
        const peoplePayload = batch.map(company => ({
          company_id: search.company_id, kind: 'company', name: company.name, trade_name: company.trade_name,
          tax_id: company.tax_id, email: company.email, phone: company.phone, postal_code: company.postal_code,
          address_line: company.address_line, address_number: company.address_number, address_extra: company.address_extra,
          district: company.district, city: company.city, state: company.state, opened_at: company.opened_at,
          primary_cnae: company.primary_cnae, business_activity: company.business_activity,
        }))
        const { data: insertedPeople, error: peopleError } = await supabase.from('people').insert(peoplePayload).select('id,tax_id')
        if (peopleError || !insertedPeople) throw new Error('Não foi possível gravar os dados cadastrais dos leads.')
        const leadsPayload = insertedPeople.map(person => ({
          company_id: search.company_id, person_id: person.id, source: 'Casa dos Dados · pesquisa automática',
          status: 'new', interest_product_id: null, notes,
        }))
        const { error: leadsError } = await supabase.from('leads').insert(leadsPayload)
        if (leadsError) {
          await supabase.from('people').delete().eq('company_id', search.company_id).in('id', insertedPeople.map(person => person.id))
          throw new Error('Não foi possível gravar os leads; os dados cadastrais desta etapa foram revertidos.')
        }
        imported += insertedPeople.length
      }
      const { error: completeError } = await supabase.from('lead_prospecting_filters').update({ last_opened_through: through, last_request_id: null }).eq('company_id', search.company_id).eq('id', search.id)
      if (completeError) throw new Error('Os leads foram importados, mas não foi possível marcar o período como concluído; solicitação preservada para evitar uma nova busca paga.')
      results.push({ name: search.name, status: 'imported', opened_from: from, opened_to: through, request_id: requestId!, imported, duplicates: companies.length - fresh.length, message: `Importação concluída: ${imported} lead(s) novo(s), ${companies.length - fresh.length} duplicado(s) ignorado(s).` })
    } catch (error) {
      results.push({ name: search.name, status: 'error', opened_from: from, opened_to: through, request_id: requestId!, message: error instanceof Error ? error.message : 'Erro ao processar o arquivo; a solicitação foi preservada para evitar cobrança repetida.' })
    }
  }
  return json({ date: today, count: results.length, results })
}

export async function GET(request: NextRequest) { return run(request) }
export async function POST(request: NextRequest) { return run(request) }
