'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasProductCatalogSchema } from '@/lib/product-catalog'
import { isUuid, parseMoney } from '@/lib/sales-funnel'
import { resolveTenantContext, TenantContextError } from '@/lib/tenant/context'

export type ProductActionResult = { ok: boolean; message: string }
export type ProductInput = {
  id?: string; name: string; internalCode: string; kind: 'product'|'service'|'certificate'
  commercialCategory: string; description: string; installationValue: string; monthlyValue: string
  salePrice: string; standardCost: string; billingMode: 'single'|'monthly'|'custom'; active: boolean
}
const fail = (message: string): ProductActionResult => ({ ok: false, message })

type CatalogContext = { supabase: SupabaseClient; companyId: string } | { error: ProductActionResult }

async function catalogContext(): Promise<CatalogContext> {
  const supabase = await createAdminClient()
  let tenant: Awaited<ReturnType<typeof resolveTenantContext>>
  try {
    tenant = await resolveTenantContext(supabase)
  } catch (error) {
    if (error instanceof TenantContextError) return { error: fail(`${error.message} Nenhuma alteração foi feita.`) }
    throw error
  }
  if (!(await hasProductCatalogSchema(supabase))) return { error: fail('Aguarda a migration 202610310006 do catálogo de produtos. Nenhuma gravação foi feita.') }
  return { supabase, companyId: tenant.companyId }
}

export async function saveProduct(input: ProductInput): Promise<ProductActionResult> {
  const context = await catalogContext()
  if ('error' in context) return context.error
  if (!input || typeof input !== 'object' || !['name','internalCode','commercialCategory','description','installationValue','monthlyValue','salePrice','standardCost'].every(key => typeof (input as Record<string, unknown>)[key] === 'string') || typeof input.active !== 'boolean') return fail('Revise os campos do produto ou serviço.')
  if (input.id && !isUuid(input.id)) return fail('Identificador do produto inválido.')
  const name = input.name.trim()
  const code = input.internalCode.trim()
  const category = input.commercialCategory.trim()
  const description = input.description.trim()
  if (name.length < 2 || name.length > 180) return fail('O nome deve ter entre 2 e 180 caracteres.')
  if (code.length > 60 || category.length > 100 || description.length > 5000) return fail('Código, categoria ou descrição excede o limite permitido.')
  if (!['product','service','certificate'].includes(input.kind) || !['single','monthly','custom'].includes(input.billingMode)) return fail('Tipo ou modalidade de cobrança inválidos.')
  const installation = parseMoney(input.installationValue)
  const monthly = parseMoney(input.monthlyValue)
  const salePrice = parseMoney(input.salePrice)
  const cost = parseMoney(input.standardCost)
  if ([installation,monthly,salePrice,cost].some(value => value === undefined)) return fail('Informe valores monetários válidos e não negativos.')
  const payload = {
    name, internal_code: code || null, kind: input.kind, commercial_category: category || null,
    description: description || null, default_installation_value: installation,
    default_monthly_value: monthly, reference_price: salePrice, standard_cost: cost,
    billing_mode: input.billingMode, active: input.active,
    company_id: context.companyId,
  }
  const result = input.id
    ? await context.supabase.from('products').update(payload).eq('id', input.id).eq('company_id', context.companyId).select('id').maybeSingle()
    : await context.supabase.from('products').insert(payload).select('id').maybeSingle()
  if (result.error?.code === '23505') return fail('Já existe um produto com este código interno.')
  if (result.error || !result.data) return fail(`Não foi possível salvar o item: ${result.error?.message ?? 'registro não encontrado nesta empresa.'}`)
  revalidatePath('/produtos'); revalidatePath('/funil'); revalidatePath('/leads')
  return { ok: true, message: input.id ? 'Produto/serviço atualizado.' : 'Produto/serviço cadastrado.' }
}

export async function setProductActive(id: string, currentActive: boolean): Promise<ProductActionResult> {
  const context = await catalogContext()
  if ('error' in context) return context.error
  if (!isUuid(id) || typeof currentActive !== 'boolean') return fail('Produto inválido.')
  const { data, error } = await context.supabase.from('products').update({ active: !currentActive }).eq('id', id).eq('company_id', context.companyId).eq('active', currentActive).select('id').maybeSingle()
  if (error || !data) return fail(error?.message ?? 'O status foi alterado em outra solicitação. Atualize a lista.')
  revalidatePath('/produtos'); revalidatePath('/funil'); revalidatePath('/leads')
  return { ok: true, message: currentActive ? 'Item inativado sem remover vínculos.' : 'Item ativado.' }
}
