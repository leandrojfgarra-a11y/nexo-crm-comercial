'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createTenantClient } from '@/lib/tenant/authorized-client'
import { isUuid } from '@/lib/sales-funnel'

export type GoalSaveResult = { ok: boolean; message: string }
const fail = (message: string): GoalSaveResult => ({ok:false,message})

async function goalContext(): Promise<{supabase:SupabaseClient;companyId:string} | GoalSaveResult> {
  let supabase:SupabaseClient
  let companyId:string
  try {
    const context=await createTenantClient()
    supabase=context.supabase
    companyId=context.tenant.companyId
  } catch {
    return fail('Sessão ou vínculo da empresa inválido. Entre novamente para continuar.')
  }
  const [goals, view, items] = await Promise.all([
    supabase.from('commercial_goals').select('id,period_month,goal_type,seller_id,product_id,category_name,quantity_target').limit(0),
    supabase.from('active_closed_sales').select('id,effective_closed_at,cycle_number').limit(0),
    supabase.from('closed_sale_items').select('closed_sale_id,cycle_number,product_id_snapshot,category_snapshot').limit(0),
  ])
  if (goals.error || view.error || items.error) return fail('Metas aguardam as migrations 009 e 010. Nenhuma gravação foi feita.')
  return {supabase,companyId}
}

export async function saveCommercialGoal(input: {
  id?: string; periodMonth: string; type: string; sellerId: string; productId: string; categoryName: string; quantity: string
}): Promise<GoalSaveResult> {
  const context = await goalContext()
  if ('ok' in context) return context
  const {supabase,companyId}=context
  if (!input || !['periodMonth','type','sellerId','productId','categoryName','quantity'].every(key => typeof (input as Record<string, unknown>)[key] === 'string')) return fail('Revise os dados da meta.')
  if (input.id && !isUuid(input.id)) return fail('Identificador da meta inválido.')
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.periodMonth)) return fail('Selecione um mês válido.')
  if (!['general','seller','product','category'].includes(input.type)) return fail('Selecione um tipo de meta válido.')
  if (!/^\d{1,7}$/.test(input.quantity) || !Number.isSafeInteger(Number(input.quantity)) || Number(input.quantity) > 1_000_000) return fail('A quantidade planejada deve ser um inteiro entre 0 e 1.000.000.')

  if (input.id) {
    const {data,error} = await supabase.from('commercial_goals').update({quantity_target:Number(input.quantity)}).eq('company_id',companyId).eq('id',input.id).select('id').maybeSingle()
    if (error) return fail(`Não foi possível atualizar a meta: ${error.message}`)
    if (!data) return fail('Meta não encontrada ou sem permissão para alteração.')
    revalidatePath('/metas')
    return {ok:true,message:'Quantidade planejada atualizada.'}
  }

  const periodMonth = `${input.periodMonth}-01`
  const payload: Record<string,unknown> = {company_id:companyId,period_month:periodMonth,goal_type:input.type,quantity_target:Number(input.quantity)}
  if (input.type === 'seller') {
    if (!isUuid(input.sellerId)) return fail('Selecione um vendedor para esta meta.')
    const {data,error} = await supabase.from('sellers').select('id').eq('company_id',companyId).eq('id',input.sellerId).maybeSingle()
    if (error || !data) return fail('Vendedor não encontrado.')
    payload.seller_id=input.sellerId
  } else if (input.type === 'product') {
    if (!isUuid(input.productId)) return fail('Selecione um produto ou serviço para esta meta.')
    const {data,error} = await supabase.from('products').select('id').eq('company_id',companyId).eq('id',input.productId).maybeSingle()
    if (error || !data) return fail('Produto ou serviço não encontrado.')
    payload.product_id=input.productId
  } else if (input.type === 'category') {
    const category = input.categoryName.trim()
    if (category.length < 1 || category.length > 120) return fail('Informe uma categoria com até 120 caracteres.')
    payload.category_name=category
  }

  const {data:{user}} = await supabase.auth.getUser()
  payload.created_by=user?.id ?? null
  const {error} = await supabase.from('commercial_goals').insert(payload)
  if (error) return fail(error.code === '23505' ? 'Já existe uma meta deste tipo para esse escopo e mês.' : `Não foi possível criar a meta: ${error.message}`)
  revalidatePath('/metas')
  return {ok:true,message:'Meta comercial cadastrada.'}
}

export async function deleteCommercialGoal(id: string): Promise<GoalSaveResult> {
  const context = await goalContext()
  if ('ok' in context) return context
  const {supabase,companyId}=context
  if (typeof id !== 'string' || !isUuid(id)) return fail('Identificador de meta inválido.')
  const {data,error} = await supabase.from('commercial_goals').delete().eq('company_id',companyId).eq('id',id).select('id').maybeSingle()
  if (error) return fail(`Não foi possível excluir a meta: ${error.message}`)
  if (!data) return fail('Meta não encontrada ou sem permissão para exclusão.')
  revalidatePath('/metas')
  return {ok:true,message:'Meta excluída. O histórico de vendas foi preservado.'}
}
