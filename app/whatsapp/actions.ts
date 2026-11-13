'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createTenantClient } from '@/lib/tenant/authorized-client'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function addWhatsAppInteraction(formData: FormData) {
  let supabase: Awaited<ReturnType<typeof createTenantClient>>['supabase']
  let companyId: string
  try {
    const context = await createTenantClient()
    supabase = context.supabase
    companyId = context.tenant.companyId
  } catch {
    redirect('/whatsapp?notice=save-failed')
  }
  const leadId = String(formData.get('lead_id') ?? '').trim()
  const kind = String(formData.get('kind') ?? 'message')
  const requestedStatus = String(formData.get('lead_status') ?? 'auto')
  const title = String(formData.get('title') ?? '').trim()
  const details = String(formData.get('details') ?? '').trim()
  if (!uuidPattern.test(leadId)) redirect('/whatsapp?notice=invalid')
  if (!['call', 'message'].includes(kind)) redirect('/whatsapp?notice=invalid')
  if (!['auto', 'new', 'contacted', 'qualified', 'lost'].includes(requestedStatus)) redirect('/whatsapp?notice=invalid')
  if (title.length < 2 || title.length > 180 || details.length > 5000) redirect('/whatsapp?notice=invalid')

  const { data: lead, error: leadError } = await supabase.from('leads').select('id,person_id,status').eq('company_id', companyId).eq('id', leadId).maybeSingle()
  if (leadError || !lead?.person_id) redirect('/whatsapp?notice=save-failed')
  const { data: { user } } = await supabase.auth.getUser()
  const { error } = await supabase.from('activities').insert({
    company_id: companyId,
    person_id: lead.person_id,
    kind,
    title,
    details: details || null,
    created_by: user?.id ?? null,
  })
  if (error) redirect('/whatsapp?notice=save-failed')

  const nextStatus = requestedStatus === 'auto'
    ? lead.status === 'new' && (kind === 'call' || kind === 'message') ? 'contacted' : null
    : requestedStatus
  if (nextStatus && nextStatus !== lead.status) {
    const { error: statusError } = await supabase.from('leads').update({ status: nextStatus }).eq('company_id', companyId).eq('id', leadId).eq('status', lead.status)
    if (statusError) {
      revalidatePath('/whatsapp')
      revalidatePath(`/leads/${leadId}`)
      redirect('/whatsapp?notice=status-failed')
    }
  }

  revalidatePath('/whatsapp')
  revalidatePath(`/leads/${leadId}`)
  redirect('/whatsapp?notice=saved')
}
