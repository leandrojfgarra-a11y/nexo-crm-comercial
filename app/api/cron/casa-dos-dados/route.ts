import { timingSafeEqual } from 'node:crypto'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type SavedSearch = { id: string; company_id: string; name: string; filters: Record<string, unknown>; last_run_at: string | null; last_opened_through: string | null }

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
  if (typeof filters.uf === 'string' && /^[A-Z]{2}$/.test(filters.uf)) query.uf = [filters.uf.toLowerCase()]
  if (typeof filters.municipality === 'string' && filters.municipality.trim()) query.municipio = [filters.municipality.trim().slice(0, 100)]
  return { total_linhas: limit, nome: `${search.name} - ${from}`, tipo: 'csv', pesquisa: query }
}

async function run(request: NextRequest) {
  const expected = process.env.PROSPECTING_CRON_SECRET
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!expected || !supplied || !sameSecret(supplied, expected)) return json({ error: 'Não autorizado.' }, 401)

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  const casaApiKey = process.env.CASA_DOS_DADOS_API_KEY
  if (!supabaseUrl || !serviceRoleKey || !casaApiKey) return json({ error: 'Configure a chave privada do Supabase, a chave da Casa dos Dados e o segredo do cron no servidor.' }, 503)

  const supabase = createSupabaseClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: searches, error } = await supabase.from('lead_prospecting_filters')
    .select('id,company_id,name,filters,last_run_at,last_opened_through').not('company_id', 'is', null).eq('daily_enabled', true).order('company_id').order('created_at')
  if (error) return json({ error: 'Não foi possível carregar as pesquisas diárias. Confira a migration manual de filtros salvos.' }, 503)

  const today = saoPauloDate()
  const through = previousDay(today)
  const results: Array<{ name: string; status: 'requested' | 'skipped' | 'error'; opened_from?: string; opened_to?: string; request_id?: string; message?: string }> = []
  for (const search of (searches ?? []) as SavedSearch[]) {
    if (search.last_run_at && saoPauloDate(new Date(search.last_run_at)) === today) {
      results.push({ name: search.name, status: 'skipped', message: 'Já executada hoje.' })
      continue
    }
    const from = search.last_opened_through ? nextDay(search.last_opened_through) : through
    if (from > through) {
      results.push({ name: search.name, status: 'skipped', message: 'Ainda não há um dia completo novo para pesquisar.' })
      continue
    }
    try {
      const payload = createExportPayload(search, from, through)
      const response = await fetch('https://api.casadosdados.com.br/v5/cnpj/pesquisa/arquivo', {
        method: 'POST', headers: { 'api-key': casaApiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload), cache: 'no-store', signal: AbortSignal.timeout(20_000),
      })
      const body = await response.json().catch(() => ({})) as { arquivo_uuid?: unknown }
      if (!response.ok || typeof body.arquivo_uuid !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.arquivo_uuid)) {
        results.push({ name: search.name, status: 'error', opened_from: from, opened_to: through, message: `A API Casa dos Dados respondeu HTTP ${response.status}.` })
        continue
      }
      const { error: updateError } = await supabase.from('lead_prospecting_filters').update({
        last_run_at: new Date().toISOString(), last_opened_through: through, last_request_id: body.arquivo_uuid,
      }).eq('company_id', search.company_id).eq('id', search.id)
      if (updateError) {
        results.push({ name: search.name, status: 'error', opened_from: from, opened_to: through, message: 'Arquivo solicitado, mas não foi possível registrar a execução no CRM.' })
        continue
      }
      results.push({ name: search.name, status: 'requested', opened_from: from, opened_to: through, request_id: body.arquivo_uuid })
    } catch {
      results.push({ name: search.name, status: 'error', opened_from: from, opened_to: through, message: 'Falha de rede ou timeout ao solicitar o arquivo.' })
    }
  }
  return json({ date: through, count: results.length, results })
}

export async function GET(request: NextRequest) { return run(request) }
export async function POST(request: NextRequest) { return run(request) }
