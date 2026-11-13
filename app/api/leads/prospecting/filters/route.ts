import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveTenantContext, TenantContextError } from '@/lib/tenant/context'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
}

async function getAdmin(request: NextRequest, checkOrigin = false) {
  const origin = request.headers.get('origin')
  if (checkOrigin && origin && origin !== new URL(request.url).origin) return { error: json({ error: 'Origem da solicitação inválida.' }, 403) }
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { error: json({ error: 'Sessão expirada. Entre novamente.' }, 401) }
  if (user.app_metadata?.crm_admin !== true) return { error: json({ error: 'Acesso negado. A configuração exige autorização administrativa.' }, 403) }
  try {
    const tenant = await resolveTenantContext(supabase)
    return { supabase, user, companyId: tenant.companyId }
  } catch (tenantError) {
    if (tenantError instanceof TenantContextError) {
      const status = tenantError.code === 'unauthenticated' ? 401 : tenantError.code === 'unauthorized' ? 403 : 403
      return { error: json({ error: tenantError.message }, status) }
    }
    return { error: json({ error: 'Não foi possível validar a empresa ativa.' }, 403) }
  }
}

function migrationPending(error: { code?: string } | null) {
  return error?.code === '42P01' || error?.code === 'PGRST205'
}

function dateOnly(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function validateFilters(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'Os filtros possuem formato inválido.'
  const filters = value as Record<string, unknown>
  const codes = Array.isArray(filters.cnaeCodes) ? filters.cnaeCodes : []
  if (!codes.length || codes.length > 100 || codes.some(code => typeof code !== 'string' || !/^\d{7}$/.test(code))) return 'Informe até 100 CNAEs válidos, cada um com 7 dígitos.'
  if (!dateOnly(filters.openedFrom) || !dateOnly(filters.openedTo) || filters.openedFrom > filters.openedTo) return 'Informe um período válido para data de abertura.'
  const limit = Number(filters.limit)
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) return 'O limite deve ser de 1 a 1.000 empresas por arquivo.'
  if (filters.uf && (typeof filters.uf !== 'string' || !/^[A-Z]{2}$/.test(filters.uf))) return 'Informe uma UF válida ou deixe o campo vazio.'
  if (filters.municipality != null && (typeof filters.municipality !== 'string' || filters.municipality.length > 100)) return 'O município excede o limite permitido.'
  if (typeof filters.activeOnly !== 'boolean') return 'A opção de situação cadastral está inválida.'
  return null
}

export async function GET(request: NextRequest) {
  const auth = await getAdmin(request)
  if ('error' in auth) return auth.error
  const { data, error } = await auth.supabase.from('lead_prospecting_filters').select('id,name,filters,daily_enabled,last_run_at,last_opened_through,last_request_id,created_at,updated_at').eq('company_id', auth.companyId).order('updated_at', { ascending: false })
  if (migrationPending(error)) return json({ error: 'A migration de filtros salvos ainda não foi aplicada ao Supabase Nexo.', migration_pending: true }, 409)
  if (error) return json({ error: 'Não foi possível carregar as pesquisas salvas.' }, 500)
  return json({ searches: data ?? [] })
}

export async function POST(request: NextRequest) {
  const auth = await getAdmin(request, true)
  if ('error' in auth) return auth.error
  let body: Record<string, unknown>
  try { body = await request.json() as Record<string, unknown> }
  catch { return json({ error: 'O conteúdo enviado não é um JSON válido.' }, 400) }
  const id = typeof body.id === 'string' && uuidPattern.test(body.id) ? body.id : null
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (name.length < 2 || name.length > 80) return json({ error: 'O nome da pesquisa deve ter de 2 a 80 caracteres.' }, 400)
  const filtersError = validateFilters(body.filters)
  if (filtersError) return json({ error: filtersError }, 400)
  const record = { company_id: auth.companyId, name, filters: body.filters, daily_enabled: body.daily_enabled === true, updated_at: new Date().toISOString() }
  const query = id
    ? auth.supabase.from('lead_prospecting_filters').update(record).eq('company_id', auth.companyId).eq('id', id).select('id,name,filters,daily_enabled,last_run_at,last_opened_through,last_request_id,created_at,updated_at').maybeSingle()
    : auth.supabase.from('lead_prospecting_filters').insert({ ...record, created_by: auth.user.id }).select('id,name,filters,daily_enabled,last_run_at,last_opened_through,last_request_id,created_at,updated_at').single()
  const { data, error } = await query
  if (migrationPending(error)) return json({ error: 'Aplique a migration de filtros salvos no Supabase Nexo antes de salvar pesquisas.', migration_pending: true }, 409)
  if (error?.code === '23505') return json({ error: 'Já existe uma pesquisa com esse nome. Selecione-a para atualizar ou escolha outro nome.' }, 409)
  if (error || !data) return json({ error: 'Não foi possível salvar a pesquisa.' }, 500)
  return json({ search: data })
}

export async function DELETE(request: NextRequest) {
  const auth = await getAdmin(request, true)
  if ('error' in auth) return auth.error
  const id = request.nextUrl.searchParams.get('id') ?? ''
  if (!uuidPattern.test(id)) return json({ error: 'Pesquisa inválida.' }, 400)
  const { error } = await auth.supabase.from('lead_prospecting_filters').delete().eq('company_id', auth.companyId).eq('id', id)
  if (migrationPending(error)) return json({ error: 'A migration de filtros salvos ainda não foi aplicada ao Supabase Nexo.', migration_pending: true }, 409)
  if (error) return json({ error: 'Não foi possível excluir a pesquisa salva.' }, 500)
  return json({ deleted: true })
}
