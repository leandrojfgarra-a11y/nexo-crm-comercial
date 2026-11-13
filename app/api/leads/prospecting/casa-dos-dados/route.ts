import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveTenantContext } from '@/lib/tenant/context'

const apiBase = 'https://api.casadosdados.com.br'
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
}

async function authorize(request: NextRequest) {
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) return { error: json({ error: 'Origem da solicitação inválida.' }, 403) }
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { error: json({ error: 'Sessão expirada. Entre novamente.' }, 401) }
  if (user.app_metadata?.crm_admin !== true) return { error: json({ error: 'Acesso negado. A pesquisa exige autorização administrativa.' }, 403) }
  try { await resolveTenantContext(supabase) }
  catch { return { error: json({ error: 'Não foi possível validar o vínculo com a empresa ativa.' }, 403) } }
  const apiKey = process.env.CASA_DOS_DADOS_API_KEY?.trim()
  if (!apiKey) return { error: json({ error: 'Integração não configurada. Defina CASA_DOS_DADOS_API_KEY no ambiente do servidor.' }, 503) }
  return { apiKey }
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export async function POST(request: NextRequest) {
  const authorization = await authorize(request)
  if ('error' in authorization) return authorization.error

  let body: Record<string, unknown>
  try { body = await request.json() as Record<string, unknown> }
  catch { return json({ error: 'O conteúdo enviado não é um JSON válido.' }, 400) }

  const codes = Array.isArray(body.cnae_codes)
    ? [...new Set(body.cnae_codes.filter((value): value is string => typeof value === 'string').map(value => value.replace(/\D/g, '')).filter(value => /^\d{7}$/.test(value)))].slice(0, 100)
    : []
  const from = body.opened_from
  const to = body.opened_to
  const limit = Number(body.limit ?? 200)
  const searchName = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : 'Nexo CRM - prospecção'
  if (!codes.length) return json({ error: 'Informe ao menos um CNAE válido com 7 dígitos.' }, 400)
  if (!validDate(from) || !validDate(to) || from > to) return json({ error: 'Informe um período válido para data de abertura.' }, 400)
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) return json({ error: 'O limite deve ser de 1 a 1.000 empresas por arquivo.' }, 400)

  const activeOnly = body.active_only !== false
  const uf = typeof body.uf === 'string' && /^[A-Za-z]{2}$/.test(body.uf) ? body.uf.toLowerCase() : undefined
  const municipality = typeof body.municipality === 'string' ? body.municipality.trim().slice(0, 100) : ''
  const research: Record<string, unknown> = {
    codigo_atividade_principal: codes,
    incluir_atividade_secundaria: true,
    codigo_atividade_secundaria: codes,
    data_abertura: { inicio: from, fim: to },
    limite: limit,
    pagina: 1,
  }
  if (activeOnly) research.situacao_cadastral = ['ATIVA']
  if (uf) research.uf = [uf]
  if (municipality) research.municipio = [municipality]

  try {
    const response = await fetch(`${apiBase}/v5/cnpj/pesquisa/arquivo`, {
      method: 'POST',
      headers: { 'api-key': authorization.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ total_linhas: limit, nome: searchName || 'Nexo CRM - prospecção', tipo: 'csv', pesquisa: research }),
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    })
    const result = await response.json().catch(() => ({})) as { arquivo_uuid?: unknown; mensagem?: unknown }
    if (!response.ok) {
      const message = response.status === 401 ? 'A chave da API foi recusada. Confira a variável configurada no servidor.'
        : response.status === 403 ? 'A conta não tem acesso à geração de arquivos pela API.'
        : response.status === 402 ? 'Saldo insuficiente para esta pesquisa.'
        : `A Casa dos Dados respondeu HTTP ${response.status}.`
      return json({ error: message }, response.status === 401 ? 401 : response.status === 403 ? 403 : 502)
    }
    if (typeof result.arquivo_uuid !== 'string' || !uuidPattern.test(result.arquivo_uuid)) return json({ error: 'A API não retornou um identificador de arquivo válido.' }, 502)
    return json({ request_id: result.arquivo_uuid, message: typeof result.mensagem === 'string' ? result.mensagem : 'Arquivo solicitado.' }, 202)
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError'
    return json({ error: timedOut ? 'A Casa dos Dados demorou mais que o limite para iniciar a pesquisa.' : 'Não foi possível conectar à API da Casa dos Dados neste servidor.' }, 502)
  }
}

export async function GET(request: NextRequest) {
  const authorization = await authorize(request)
  if ('error' in authorization) return authorization.error
  const id = request.nextUrl.searchParams.get('id') ?? ''
  if (!uuidPattern.test(id)) return json({ error: 'Identificador de pesquisa inválido.' }, 400)

  try {
    const response = await fetch(`${apiBase}/v4/public/cnpj/pesquisa/arquivo/${id}`, {
      headers: { 'api-key': authorization.apiKey }, cache: 'no-store', signal: AbortSignal.timeout(12_000),
    })
    const contentType = response.headers.get('content-type') ?? 'desconhecido'
    if (response.ok && /text\/csv|application\/octet-stream/i.test(contentType)) {
      return new Response(response.body, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="casa-dos-dados-${id}.csv"`, 'Cache-Control': 'no-store' } })
    }
    const result = await response.json().catch(() => ({})) as Record<string, unknown>
    if (!response.ok) return json({ error: response.status === 404 ? 'Pesquisa não encontrada na Casa dos Dados.' : `Não foi possível consultar a pesquisa (HTTP ${response.status}).` }, 502)
    const nestedLink = [result.data, result.arquivo, result.resultado].find(value => value && typeof value === 'object' && !Array.isArray(value) && typeof (value as Record<string, unknown>).link === 'string') as Record<string, unknown> | undefined
    const linkValue = typeof result.link === 'string' ? result.link : nestedLink?.link
    if (typeof linkValue !== 'string' || !linkValue.trim()) {
      let providerStatus: string | null = null
      let updatedAt: string | null = null
      let count: number | null = null
      try {
        const listResponse = await fetch(`${apiBase}/v4/cnpj/pesquisa/arquivo?pagina=1`, {
          headers: { 'api-key': authorization.apiKey }, cache: 'no-store', signal: AbortSignal.timeout(8_000),
        })
        if (listResponse.ok) {
          const list = await listResponse.json() as unknown
          const requests = Array.isArray(list) ? list : []
          const record = requests.find((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item) && item.arquivo_uuid === id))
          if (record) {
            providerStatus = typeof record.status === 'string' ? record.status.slice(0, 80) : null
            updatedAt = typeof record.atualizado === 'string' ? record.atualizado : null
            count = typeof record.quantidade === 'number' ? record.quantidade : null
          }
        }
      } catch { /* Mantém o estado pendente; a consulta secundária é apenas diagnóstica. */ }

      const responseMessage = [result.message, result.mensagem, result.error].find(value => typeof value === 'string')
      const diagnostic = { provider_status: providerStatus, updated_at: updatedAt, count, response_http_status: response.status, response_content_type: contentType, response_fields: Object.keys(result).slice(0, 20), response_message: typeof responseMessage === 'string' ? responseMessage.slice(0, 180) : null }
      if (providerStatus && /erro|falh|cancel|fail/i.test(providerStatus)) {
        return json({ error: `A Casa dos Dados registrou a solicitação como “${providerStatus}”. Nenhum link foi disponibilizado.`, ...diagnostic }, 502)
      }
      if (providerStatus && /^(processado|concluido|concluida|finalizado|finalizada|completed|complete|done|ready)$/i.test(providerStatus.trim())) {
        return json({ error: `A Casa dos Dados marcou como “${providerStatus}” (${count ?? 'quantidade não informada'} empresa(s)), mas o endpoint de download não devolveu um link. A pesquisa não precisa ser refeita.`, ...diagnostic }, 502)
      }
      const message = providerStatus
        ? `Status informado pela Casa dos Dados: ${providerStatus}${updatedAt ? ` · atualizado em ${updatedAt}` : ''}${count !== null ? ` · ${count} empresa(s) no arquivo` : ''}.`
        : 'A solicitação ainda não tem link. A lista da Casa dos Dados não trouxe um estado atualizado para este ID.'
      return json({ status: 'processing', ...diagnostic, message }, 202)
    }
    let download: URL
    try { download = new URL(linkValue) } catch { return json({ error: 'A API retornou um link de download inválido.' }, 502) }
    if (download.protocol !== 'https:') return json({ error: 'A API retornou um link de download inseguro.' }, 502)
    return json({ status: 'ready', download_url: download.toString(), expires_in_minutes: 60 })
  } catch {
    return json({ error: 'Não foi possível consultar o status da pesquisa na Casa dos Dados.' }, 502)
  }
}
