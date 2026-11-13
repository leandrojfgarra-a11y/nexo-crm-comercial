import { NextResponse } from 'next/server'
import { validCnpj } from '@/lib/crm-validation'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

type Nested = Record<string, unknown>

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Sessão expirada. Entre novamente para consultar a IE.' }, { status: 401 })
  if (user.app_metadata?.crm_admin !== true) return NextResponse.json({ error: 'Acesso negado. A consulta exige autorização administrativa.' }, { status: 403 })

  const cnpj = new URL(request.url).searchParams.get('cnpj')?.replace(/[.\/-]/g, '').toUpperCase() ?? ''
  if (!validCnpj(cnpj)) return NextResponse.json({ error: 'Informe um CNPJ válido.' }, { status: 400 })

  let response: Response
  try {
    response = await fetch(`https://publica.cnpj.ws/cnpj/${encodeURIComponent(cnpj)}`, {
      signal: AbortSignal.timeout(8000), cache: 'no-store', headers: { Accept: 'application/json' },
    })
  } catch (error) {
    const timeout = error instanceof Error && error.name === 'TimeoutError'
    return NextResponse.json({ error: timeout ? 'A consulta de IE excedeu 8 segundos. O campo continua disponível para preenchimento manual.' : 'Não foi possível conectar à fonte pública de IE. O campo continua disponível para preenchimento manual.' }, { status: timeout ? 504 : 503 })
  }

  if (response.status === 404) return NextResponse.json({ error: 'CNPJ não encontrado na base CNPJ.ws. Isso não indica isenção de IE.' }, { status: 404 })
  if (response.status === 429) return NextResponse.json({ error: 'A fonte de IE limita consultas a 3 por minuto por IP. Aguarde antes de tentar novamente.' }, { status: 429 })
  if (response.status === 403) return NextResponse.json({ error: 'A fonte pública recusou a consulta. O campo IE continua disponível para preenchimento manual.' }, { status: 502 })
  if (!response.ok) return NextResponse.json({ error: `A fonte pública de IE respondeu HTTP ${response.status}. O campo continua disponível para preenchimento manual.` }, { status: 503 })

  let raw: Nested
  try { raw = await response.json() as Nested }
  catch { return NextResponse.json({ error: 'A fonte de IE respondeu com JSON inválido. O campo continua disponível para preenchimento manual.' }, { status: 502 }) }
  const establishment = raw.estabelecimento && typeof raw.estabelecimento === 'object' ? raw.estabelecimento as Nested : {}
  const values = Array.isArray(establishment.inscricoes_estaduais) ? establishment.inscricoes_estaduais : []
  const inscriptions = values.flatMap(value => {
    if (!value || typeof value !== 'object') return []
    const item = value as Nested
    const state = item.estado && typeof item.estado === 'object' ? (item.estado as Nested).sigla : null
    if (typeof item.inscricao_estadual !== 'string' || !item.inscricao_estadual.trim()) return []
    return [{ number: item.inscricao_estadual.trim(), state: typeof state === 'string' ? state.toUpperCase() : null, active: typeof item.ativo === 'boolean' ? item.ativo : null, regime: typeof item.regime === 'string' ? item.regime : null }]
  })
  return NextResponse.json({ inscriptions, provider: 'CNPJ.ws' }, { headers: { 'Cache-Control': 'no-store' } })
}
