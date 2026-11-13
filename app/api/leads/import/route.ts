import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validCnpj } from '@/lib/crm-validation'
import { resolveTenantContext, TenantContextError } from '@/lib/tenant/context'

type ImportRow = {
  tax_id: string
  name: string
  trade_name?: string | null
  email?: string | null
  phone?: string | null
  postal_code?: string | null
  address_line?: string | null
  address_number?: string | null
  address_extra?: string | null
  district?: string | null
  city?: string | null
  state?: string | null
  opened_at?: string | null
  primary_cnae?: string | null
  business_activity?: string | null
}

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
}

function optionalText(value: unknown, max: number) {
  if (value == null || value === '') return null
  if (typeof value !== 'string') return undefined
  const clean = value.trim()
  return clean ? clean.slice(0, max) : null
}

function validDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

async function findExistingTaxIds(supabase: Awaited<ReturnType<typeof createClient>>, companyId: string, taxIds: string[]) {
  const { data, error } = await supabase.from('people').select('tax_id').eq('company_id', companyId).in('tax_id', taxIds)
  if (error) return { error: true as const, taxIds: [] as string[] }
  return { error: false as const, taxIds: (data ?? []).map(row => row.tax_id).filter((value): value is string => Boolean(value)) }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) return json({ error: 'Origem da solicitação inválida.' }, 403)
  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (contentLength > 150_000) return json({ error: 'Lote muito grande. Reduza a quantidade de registros por envio.' }, 413)

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return json({ error: 'Sessão expirada. Entre novamente para importar leads.' }, 401)
  if (user.app_metadata?.crm_admin !== true) return json({ error: 'Acesso negado. A importação exige autorização administrativa.' }, 403)
  let companyId: string
  try { companyId = (await resolveTenantContext(supabase)).companyId }
  catch (error) {
    const status = error instanceof TenantContextError && error.code === 'unauthenticated' ? 401 : 403
    return json({ error: error instanceof TenantContextError ? error.message : 'Não foi possível confirmar a empresa atual.' }, status)
  }

  let body: Record<string, unknown>
  try {
    const rawBody = await request.text()
    if (rawBody.length > 150_000) return json({ error: 'Lote muito grande. Reduza a quantidade de registros por envio.' }, 413)
    body = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    return json({ error: 'O conteúdo enviado não é um JSON válido.' }, 400)
  }

  if (body.operation === 'backfill_opened_at') {
    if (!Array.isArray(body.rows) || body.rows.length < 1 || body.rows.length > 250)
      return json({ error: 'Envie de 1 a 250 datas para completar os leads existentes.' }, 400)
    const datesByTaxId = new Map<string, string>()
    for (const candidate of body.rows) {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return json({ error: 'Uma linha possui formato inválido.' }, 400)
      const row = candidate as { tax_id?: unknown; opened_at?: unknown }
      const taxId = typeof row.tax_id === 'string' ? row.tax_id.replace(/\D/g, '') : ''
      if (!/^\d{14}$/.test(taxId) || !validCnpj(taxId)) return json({ error: 'Há um CNPJ inválido na atualização.' }, 400)
      if (typeof row.opened_at !== 'string' || !validDateOnly(row.opened_at)) return json({ error: `A data de abertura do CNPJ ${taxId} está inválida.` }, 400)
      datesByTaxId.set(taxId, row.opened_at)
    }

    const taxIds = [...datesByTaxId.keys()]
    const { data: people, error: peopleError } = await supabase.from('people').select('id,tax_id,opened_at').eq('company_id', companyId).in('tax_id', taxIds)
    if (peopleError) return json({ error: 'Não foi possível localizar os cadastros correspondentes no CRM.' }, 500)
    const peopleWithIds = (people ?? []).filter(person => person.tax_id)
    const personIds = peopleWithIds.map(person => person.id)
    if (!personIds.length) return json({ updated: 0, skipped: taxIds.length })
    const { data: leadRows, error: leadsError } = await supabase.from('leads').select('person_id').eq('company_id', companyId).in('person_id', personIds)
    if (leadsError) return json({ error: 'Não foi possível confirmar quais cadastros estão vinculados a leads.' }, 500)
    const leadPersonIds = new Set((leadRows ?? []).map(lead => lead.person_id).filter((id): id is string => Boolean(id)))

    let updated = 0
    for (const person of peopleWithIds) {
      if (!person.tax_id || !leadPersonIds.has(person.id) || person.opened_at) continue
      const openedAt = datesByTaxId.get(person.tax_id)
      if (!openedAt) continue
      const { data, error } = await supabase.from('people').update({ opened_at: openedAt })
        .eq('id', person.id).eq('company_id', companyId).is('opened_at', null).select('id').maybeSingle()
      if (error) return json({ error: `Falha ao atualizar datas após ${updated} registro(s).`, updated }, 500)
      if (data) updated++
    }
    return json({ updated, skipped: taxIds.length - updated })
  }

  if (body.operation === 'check') {
    if (!Array.isArray(body.tax_ids) || body.tax_ids.length > 250) return json({ error: 'Envie até 250 CNPJs por verificação.' }, 400)
    const taxIds = [...new Set(body.tax_ids.filter((value): value is string => typeof value === 'string').map(value => value.replace(/\D/g, '')).filter(value => value.length === 14 && validCnpj(value)))]
    if (!taxIds.length) return json({ existing_tax_ids: [] })
    const found = await findExistingTaxIds(supabase, companyId, taxIds)
    if (found.error) return json({ error: 'Não foi possível verificar os CNPJs já cadastrados no CRM.' }, 500)
    return json({ existing_tax_ids: found.taxIds })
  }

  if (body.operation !== 'import' || !Array.isArray(body.rows) || body.rows.length < 1 || body.rows.length > 25) {
    return json({ error: 'Envie de 1 a 25 leads válidos por lote.' }, 400)
  }

  const note = optionalText(body.note, 2000)
  const productId = optionalText(body.product_id, 36)
  if (note === undefined || productId === undefined) return json({ error: 'Revise o produto e a observação do lote.' }, 400)
  if (productId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(productId)) return json({ error: 'O produto selecionado é inválido.' }, 400)

  const schemaCheck = await Promise.all([
    supabase.from('people').select('business_activity,primary_cnae,opened_at').limit(0),
    supabase.from('leads').select('interest_product_id,notes').limit(0),
  ])
  if (schemaCheck.some(result => result.error)) return json({ error: 'O banco ainda não tem os campos de atividade e interesse comercial necessários. Confira as migrations de clientes/leads antes de importar.' }, 409)

  if (productId) {
    const { data: product, error } = await supabase.from('products').select('id').eq('id', productId).eq('company_id', companyId).eq('active', true).maybeSingle()
    if (error || !product) return json({ error: 'O produto/serviço selecionado não existe ou está inativo.' }, 400)
  }

  const safeRows: Array<{ source: ImportRow; person: Record<string, unknown> }> = []
  const seen = new Set<string>()
  for (const candidate of body.rows) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return json({ error: 'Um registro do lote possui formato inválido.' }, 400)
    const row = candidate as ImportRow
    const taxId = typeof row.tax_id === 'string' ? row.tax_id.replace(/\D/g, '') : ''
    const name = optionalText(row.name, 250)
    const email = optionalText(row.email, 254)
    const tradeName = optionalText(row.trade_name, 200)
    const phone = optionalText(row.phone, 100)
    const postalCodeRaw = optionalText(row.postal_code, 12)
    const postalCode = postalCodeRaw?.replace(/\D/g, '') ?? null
    const addressLine = optionalText(row.address_line, 250)
    const addressNumber = optionalText(row.address_number, 50)
    const addressExtraRaw = optionalText(row.address_extra, 150)
    const addressExtra = addressExtraRaw && /^\*+$/.test(addressExtraRaw) ? null : addressExtraRaw
    const district = optionalText(row.district, 150)
    const city = optionalText(row.city, 150)
    const stateRaw = optionalText(row.state, 2)
    const state = stateRaw?.toUpperCase() ?? null
    const openedAt = optionalText(row.opened_at, 10)
    const primaryCnae = optionalText(row.primary_cnae, 100)
    const businessActivity = optionalText(row.business_activity, 150)

    if (!validCnpj(taxId) || !/^\d{14}$/.test(taxId)) return json({ error: 'Há um CNPJ inválido no lote. Corrija ou desmarque a linha e tente novamente.' }, 400)
    if (name === undefined || !name || name.length < 2) return json({ error: `Informe uma razão social válida para o CNPJ ${taxId}.` }, 400)
    if (email === undefined || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return json({ error: `O e-mail do CNPJ ${taxId} está inválido.` }, 400)
    if ([tradeName, phone, postalCodeRaw, addressLine, addressNumber, addressExtra, district, city, stateRaw, openedAt, primaryCnae, businessActivity].some(value => value === undefined)) return json({ error: `Um campo do CNPJ ${taxId} excedeu o limite permitido.` }, 400)
    if (postalCode && !/^\d{8}$/.test(postalCode)) return json({ error: `O CEP do CNPJ ${taxId} deve conter oito dígitos.` }, 400)
    if (state && !/^[A-Z]{2}$/.test(state)) return json({ error: `A UF do CNPJ ${taxId} está inválida.` }, 400)
    if (openedAt && !validDateOnly(openedAt)) return json({ error: `A data de abertura do CNPJ ${taxId} está inválida.` }, 400)
    if (!businessActivity) return json({ error: `Não foi possível identificar o ramo de atividade selecionado para o CNPJ ${taxId}.` }, 400)
    if (seen.has(taxId)) return json({ error: 'O lote enviado contém CNPJ repetido. Atualize a seleção antes de importar.' }, 409)
    seen.add(taxId)

    safeRows.push({ source: row, person: {
      company_id: companyId, kind: 'company', name, trade_name: tradeName, tax_id: taxId, email: email?.toLowerCase() ?? null,
      phone, whatsapp: null, postal_code: postalCode, address_line: addressLine,
      address_number: addressNumber, address_extra: addressExtra, district, city, state,
      opened_at: openedAt,
      primary_cnae: primaryCnae, business_activity: businessActivity, notes: null,
    } })
  }

  const found = await findExistingTaxIds(supabase, companyId, [...seen])
  if (found.error) return json({ error: 'Não foi possível verificar duplicidades no CRM.' }, 500)
  if (found.taxIds.length) return json({ error: 'Alguns CNPJs já foram cadastrados no CRM. Atualize a verificação e remova essas linhas.', existing_tax_ids: found.taxIds }, 409)

  const { data: insertedPeople, error: peopleError } = await supabase.from('people').insert(safeRows.map(row => row.person)).select('id,tax_id')
  if (peopleError || !insertedPeople) {
    if (peopleError?.code === '23505') return json({ error: 'Um CNPJ foi cadastrado enquanto esta importação era preparada. Atualize a verificação antes de tentar novamente.' }, 409)
    return json({ error: 'Não foi possível criar os contatos do lote. Nenhum lead foi importado.' }, 500)
  }

  const notes = note || null
  const leads = insertedPeople.map(person => ({
    company_id: companyId, person_id: person.id, source: 'Importação por planilha', status: 'new',
    interest_product_id: productId, notes,
  }))
  const { error: leadsError } = await supabase.from('leads').insert(leads)
  if (leadsError) {
    const { error: cleanupError } = await supabase.from('people').delete()
      .eq('company_id', companyId)
      .in('id', insertedPeople.map(person => person.id))
    if (cleanupError) return json({ error: 'A criação dos leads falhou e o CRM não conseguiu desfazer todos os contatos. Verifique a lista de Leads antes de repetir o lote.' }, 500)
    return json({ error: 'Não foi possível concluir os leads. Os contatos temporários foram removidos; nenhum lead do lote foi mantido.' }, 500)
  }

  return json({ imported: insertedPeople.length })
}
