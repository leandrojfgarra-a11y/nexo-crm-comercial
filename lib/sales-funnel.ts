import type { SupabaseClient } from '@supabase/supabase-js'

export const SALES_FUNNEL_PIPELINE_ID = '00000000-0000-0000-0000-000000000001'
export const SALES_FUNNEL_STAGES = [
  'Leads',
  '1º contato',
  'Em análise',
  'Aprovado',
  'Contrato assinado',
  'Taxa paga',
  'Concluído',
] as const

export type SalesFunnelStage = (typeof SALES_FUNNEL_STAGES)[number]

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function parseMoney(value: string): number | null | undefined {
  if (!value.trim()) return null
  const normalized = value.replace(/\s/g, '').replace(',', '.')
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(normalized)) return undefined
  const amount = Number(normalized)
  return Number.isFinite(amount) && amount >= 0 ? amount : undefined
}

export function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(value + 'T00:00:00Z')
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export async function hasSalesFunnelSchema(supabase: SupabaseClient) {
  const [opportunityColumns, leadColumns, stageColumns, pipeline] = await Promise.all([
    supabase.from('opportunities').select('lead_id,customer_id,product_id,installation_value,monthly_value,opened_at,notes,closure_type,closure_reason').limit(0),
    supabase.from('leads').select('interest_product_id,notes').limit(0),
    supabase.from('pipeline_stages').select('active').limit(0),
    supabase.from('pipelines').select('id').eq('id', SALES_FUNNEL_PIPELINE_ID).maybeSingle(),
  ])
  if (opportunityColumns.error || leadColumns.error || stageColumns.error || pipeline.error || !pipeline.data) return false
  const { data: stages, error } = await supabase.from('pipeline_stages')
    .select('id,name,position,is_won,is_lost,active')
    .eq('pipeline_id', SALES_FUNNEL_PIPELINE_ID)
    .eq('active', true)
    .order('position')
  return !error && stages?.length === SALES_FUNNEL_STAGES.length &&
    stages.every((stage, index) => stage.name === SALES_FUNNEL_STAGES[index] && stage.position === index && stage.is_won === (index === SALES_FUNNEL_STAGES.length - 1) && !stage.is_lost)
}

export async function hasOpportunityCommercialProfileSchema(supabase: SupabaseClient) {
  const [opportunities, links] = await Promise.all([
    supabase.from('opportunities').select('converted_at,monthly_due_day,implementation_owner,installation_date,training_date,trainings_needed,invoice_limit,system_version,nfce_version,mdfe_version,technical_notes,contract_status,boleto_delivery_method,installation_fee_status,installation_fee_payment_method,installation_fee_paid_at').limit(0),
    supabase.from('opportunity_products').select('opportunity_id,product_id').limit(0),
  ])
  return !opportunities.error && !links.error
}

export async function hasClosedSalesSchema(supabase: SupabaseClient) {
  const [sales, items, events] = await Promise.all([
    supabase.from('closed_sales').select('id,opportunity_id,closed_at').limit(0),
    supabase.from('closed_sale_items').select('closed_sale_id,product_id_snapshot,category_snapshot').limit(0),
    supabase.from('closed_sale_events').select('closed_sale_id,event_number,event_type').limit(0),
  ])
  return !sales.error && !items.error && !events.error
}

