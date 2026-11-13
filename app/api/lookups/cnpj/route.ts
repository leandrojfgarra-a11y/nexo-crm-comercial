import { NextResponse } from 'next/server'
import { validCnpj } from '@/lib/crm-validation'
import { mergeMissingFields, normalizeCnpj, normalizeCnpjWs } from '@/lib/cnpj-normalization'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

type Provider = 'BrasilAPI' | 'Minha Receita' | 'CNPJ.ws'
type ProviderResult = { provider: Provider; status: number | null; data?: Record<string, unknown>; error?: string }
const fieldsToComplete = ['name','trade_name','phone','email','postal_code','address_line','address_number','address_extra','district','city','state','primary_cnae','registration_status','opened_at']
function missingFields(data: Record<string, string | null>) { return fieldsToComplete.filter(key => !data[key]) }

async function queryProvider(provider: Provider, url: string): Promise<ProviderResult> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(7000), cache: 'no-store', headers: { Accept: 'application/json' } })
    if (!response.ok) return { provider, status: response.status, error: `HTTP ${response.status}` }
    let data: unknown
    try { data = await response.json() }
    catch { return { provider, status: response.status, error: 'resposta não JSON' } }
    if (!data || typeof data !== 'object' || Array.isArray(data) || typeof (data as Record<string, unknown>).razao_social !== 'string') {
      return { provider, status: response.status, error: 'formato JSON inesperado' }
    }
    return { provider, status: response.status, data: data as Record<string, unknown> }
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'TimeoutError'
    const cause = error instanceof Error && 'cause' in error ? (error as Error & { cause?: { code?: string } }).cause?.code : undefined
    return { provider, status: null, error: isTimeout ? 'timeout' : cause ? `falha de rede (${cause})` : 'falha de rede' }
  }
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Sessão expirada. Entre novamente para consultar o CNPJ.' }, { status: 401 })
  if (user.app_metadata?.crm_admin !== true) return NextResponse.json({ error: 'Acesso negado. A consulta exige autorização administrativa.' }, { status: 403 })

  const cnpj = new URL(request.url).searchParams.get('cnpj')?.replace(/[.\/-]/g, '').toUpperCase() ?? ''
  if (!validCnpj(cnpj)) return NextResponse.json({ error: 'Informe um CNPJ válido.' }, { status: 400 })

  // Cada fonte é consultada uma única vez. Um 403 da BrasilAPI não é contornado;
  // somente se consulta a API pública independente e documentada como fallback.
  const results: ProviderResult[] = []
  const supplementalSources: Provider[] = []
  let normalized: ReturnType<typeof normalizeCnpj> | null = null
  let inscriptions: ReturnType<typeof normalizeCnpjWs>['inscriptions'] | undefined
  let ieLookupError: string | undefined

  const primary = await queryProvider('BrasilAPI', 'https://brasilapi.com.br/api/cnpj/v1/' + encodeURIComponent(cnpj))
  results.push(primary)
  if (primary.data) normalized = normalizeCnpj(primary.data, cnpj)

  if (!normalized || missingFields(normalized).length) {
    const fallback = await queryProvider('Minha Receita', 'https://minhareceita.org/' + encodeURIComponent(cnpj))
    results.push(fallback)
    if (fallback.data) {
      const fallbackData = normalizeCnpj(fallback.data, cnpj)
      if (!normalized) normalized = fallbackData
      else {
        const merged = mergeMissingFields(normalized, fallbackData)
        if (Object.keys(merged).some(key => !normalized?.[key] && !!merged[key])) supplementalSources.push(fallback.provider)
        normalized = merged
      }
    }
  }

  if (!normalized || missingFields(normalized).length) {
    const fiscalSource = await queryProvider('CNPJ.ws', 'https://publica.cnpj.ws/cnpj/' + encodeURIComponent(cnpj))
    results.push(fiscalSource)
    inscriptions = []
    if (fiscalSource.data) {
      const fiscalData = normalizeCnpjWs(fiscalSource.data, cnpj)
      inscriptions = fiscalData.inscriptions
      if (!normalized) normalized = fiscalData.fields
      else {
        const merged = mergeMissingFields(normalized, fiscalData.fields)
        if (Object.keys(merged).some(key => !normalized?.[key] && !!merged[key]) || inscriptions.length) supplementalSources.push(fiscalSource.provider)
        normalized = merged
      }
    } else ieLookupError = fiscalSource.error ?? ('HTTP ' + (fiscalSource.status ?? 'sem resposta'))
  }

  if (normalized) return NextResponse.json({
    ...normalized,
    provider: results.find(result => result.data)?.provider,
    ...(supplementalSources.length ? { supplemental_sources: [...new Set(supplementalSources)] } : {}),
    ...(inscriptions ? { inscriptions } : {}),
    ...(ieLookupError ? { ie_lookup_error: ieLookupError } : {}),
  }, { headers: { 'Cache-Control': 'no-store' } })

  const summary = (result: ProviderResult) => result.provider + ': ' + (result.error || ('HTTP ' + (result.status ?? 'sem resposta')))
  return NextResponse.json({ error: 'Consulta indispon?vel nas fontes p?blicas. ' + results.map(summary).join('; ') + '.' }, { status: 503 })
}
