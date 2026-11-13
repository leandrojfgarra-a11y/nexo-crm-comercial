'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasHistoricalCustomerImportSchema } from '@/lib/customer-schema'
import { validCpf, validCnpj } from '@/lib/crm-validation'
import { resolveTenantContext } from '@/lib/tenant/context'

type ImportItem = Record<string, unknown> & {
  kind?: string; name?: string; tax_id?: string; status?: string; email?: string;
  monthly_fee?: number | null; billing_day?: number | null; product_ids?: string[]
}

export async function findHistoricalCustomerDuplicates(taxIds: string[]) {
  const supabase = await createAdminClient()
  const { companyId } = await resolveTenantContext(supabase)
  const ids = [...new Set(taxIds.map(value => String(value).trim()).filter(Boolean))].slice(0, 100)
  if (!ids.length) return { ok: true as const, taxIds: [] as string[] }
  const { data, error } = await supabase.from('people').select('tax_id').eq('company_id', companyId).in('tax_id', ids)
  if (error) return { ok: false as const, error: 'Não foi possível conferir documentos já cadastrados.' }
  return { ok: true as const, taxIds: (data ?? []).map(row => row.tax_id).filter((value): value is string => Boolean(value)) }
}

export async function importHistoricalCustomers(payload: string) {
  const supabase = await createAdminClient()
  const { companyId } = await resolveTenantContext(supabase)
  if (!(await hasHistoricalCustomerImportSchema(supabase))) {
    return { ok: false as const, error: 'A estrutura de importação histórica ainda não está disponível. Revise e aplique manualmente a migration complementar antes de importar.' }
  }
  if (payload.length > 180_000) return { ok: false as const, error: 'Lote muito grande. Importe no máximo 25 clientes por vez.' }
  let rows: ImportItem[]
  try {
    const parsed: unknown = JSON.parse(payload)
    if (!Array.isArray(parsed)) throw new Error('invalid')
    rows = parsed as ImportItem[]
  } catch {
    return { ok: false as const, error: 'Não foi possível interpretar os registros selecionados.' }
  }
  if (rows.length < 1 || rows.length > 25) return { ok: false as const, error: 'Selecione de 1 a 25 clientes por lote.' }

  const taxIds = rows.map(row => String(row.tax_id ?? '').trim()).filter(Boolean)
  if (new Set(taxIds).size !== taxIds.length) return { ok: false as const, error: 'O lote contém documentos repetidos. Remova as duplicidades antes de importar.' }
  for (const row of rows) {
    const tax = String(row.tax_id ?? '').trim().toUpperCase()
    if (String(row.name ?? '').trim().length < 2) return { ok: false as const, error: 'Há cliente sem nome/razão social.' }
    if (!['individual', 'company'].includes(String(row.kind)) || !['active', 'inactive'].includes(String(row.status))) return { ok: false as const, error: 'Há cliente com tipo ou situação inválida.' }
    if (tax && !(row.kind === 'individual' ? validCpf(tax) : validCnpj(tax))) return { ok: false as const, error: `Documento inválido: ${tax}.` }
    if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(row.email))) return { ok: false as const, error: `E-mail inválido para ${String(row.name)}.` }
    if (row.monthly_fee != null && (!Number.isFinite(Number(row.monthly_fee)) || Number(row.monthly_fee) < 0)) return { ok: false as const, error: `Mensalidade inválida para ${String(row.name)}.` }
    if (row.billing_day != null && (!Number.isInteger(Number(row.billing_day)) || Number(row.billing_day) < 1 || Number(row.billing_day) > 31)) return { ok: false as const, error: `Vencimento inválido para ${String(row.name)}.` }
  }
  if (taxIds.length) {
    const { data: existing, error } = await supabase.from('people').select('tax_id').eq('company_id', companyId).in('tax_id', taxIds)
    if (error) return { ok: false as const, error: 'Não foi possível verificar duplicidades no CRM.' }
    if ((existing ?? []).length) return { ok: false as const, error: 'Há CPF/CNPJ já cadastrado. Atualize a conferência de duplicidades e retire essas linhas do lote.' }
  }

  const productIds = [...new Set(rows.flatMap(row => Array.isArray(row.product_ids) ? row.product_ids.map(String) : []))]
  if (productIds.length) {
    const { data, error } = await supabase.from('products').select('id').eq('company_id', companyId).in('id', productIds)
    if (error || (data ?? []).length !== productIds.length) return { ok: false as const, error: 'Um produto selecionado não existe ou não pertence à empresa atual.' }
  }

  const cleanRows = rows.map(row => ({ ...row, tax_id: String(row.tax_id ?? '').trim().toUpperCase() || null, product_ids: Array.isArray(row.product_ids) ? row.product_ids.map(String) : [] }))
  const { data, error } = await supabase.rpc('import_historical_customers', { p_rows: cleanRows })
  if (error) return { ok: false as const, error: error.message.includes('Documento já cadastrado') ? 'Um CPF/CNPJ já foi cadastrado enquanto o lote estava aberto. Revise a duplicidade e tente novamente.' : `Importação não concluída: ${error.message}` }
  revalidatePath('/clientes')
  return { ok: true as const, imported: Number(data ?? rows.length) }
}
