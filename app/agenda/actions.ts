'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { resolveAgendaContext } from '@/lib/agenda-context'
import { canManageAgendaEvent, isAgendaAdministrator, isAllowedAgendaStatusTransition, isValidAgendaInterval, resolveAgendaAssignee } from '@/lib/agenda-security'
import { hasAgendaSchema } from '@/lib/agenda-schema'
import { agendaDateTimeToIso, buildAgendaEventPayload } from '@/lib/agenda-calendar-data'

const agendaPath = '/agenda'
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function notice(value: string): never {
  redirect(`${agendaPath}?notice=${encodeURIComponent(value)}`)
}

const fail = (message: string): never => redirect(`${agendaPath}?action_error=${encodeURIComponent(message)}`)

function parseAgendaDateTime(date: string, time: string): Date {
  try {
    return new Date(agendaDateTimeToIso(date, time))
  } catch {
    return fail('Data ou horário inválido.')
  }
}

export type AgendaEventResult = { ok: boolean; message: string; eventId?: string }

export type AgendaEventInput = {
  id?: string
  title: string
  description: string | null
  eventType: 'note' | 'contact' | 'service' | 'appointment'
  startsAt: string
  endsAt: string
  allDay: boolean
  contactId: string | null
  contactNameManual: string | null
  contactPhoneManual: string | null
  serviceId: string | null
  serviceNameManual: string | null
  serviceDescriptionManual: string | null
  assignedUserId: string | null
  status: 'scheduled' | 'completed' | 'cancelled'
  color: string | null
}

export async function saveAgendaEvent(formData: FormData): Promise<AgendaEventResult> {
  const { supabase, actor } = await resolveAgendaContext()
  const { companyId, userId } = actor

  const schemaReady = await hasAgendaSchema(supabase)
  if (!schemaReady) {
    notice(
      'A tabela de compromissos ainda não está disponível. Aplique a migration de agenda antes de usar este módulo.'
    )
  }

  const id = String(formData.get('event_id') ?? '').trim()
  const title = String(formData.get('title') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim() || null
  const eventType = String(formData.get('event_type') ?? 'appointment')
  const startsAtDate = String(formData.get('starts_at') ?? '').trim()
  const startsAtTime = String(formData.get('start_time') ?? '').trim()
  const endsAtDate = String(formData.get('ends_at') ?? '').trim()
  const endsAtTime = String(formData.get('end_time') ?? '').trim()
  const allDay = String(formData.get('all_day') ?? 'false') === 'true'
  const status = String(formData.get('status') ?? 'scheduled')
  const color = String(formData.get('color') ?? '').trim() || null

  // Validações de entrada
  if (!title || title.length < 1 || title.length > 200) {
    fail('Informe um título válido para o compromisso.')
  }
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(startsAtDate)) {
    fail('Informe uma data inicial válida.')
  }
  if (!/^[0-9]{2}:[0-9]{2}$/.test(startsAtTime)) {
    fail('Informe um horário inicial válido.')
  }
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(endsAtDate)) {
    fail('Informe uma data final válida.')
  }
  if (!/^[0-9]{2}:[0-9]{2}$/.test(endsAtTime)) {
    fail('Informe um horário final válido.')
  }
  const startDateTime = parseAgendaDateTime(startsAtDate, startsAtTime)
  const endDateTime = parseAgendaDateTime(endsAtDate, endsAtTime)
  if (Number.isNaN(startDateTime.getTime()) || Number.isNaN(endDateTime.getTime())) {
    fail('Data ou horário inválido.')
  }
  if (endDateTime <= startDateTime || !isValidAgendaInterval(startDateTime, endDateTime)) {
    fail('O horário final deve ser posterior ao horário inicial.')
  }
  if (!['note', 'contact', 'service', 'appointment'].includes(eventType)) {
    fail('Tipo de compromisso inválido.')
  }
  if (!['scheduled', 'completed', 'cancelled'].includes(status)) {
    fail('Status de compromisso inválido.')
  }

  // Validações de pertencimento (defesa em profundidade)
  if (id && !uuidPattern.test(id)) {
    fail('Identificador do compromisso inválido.')
  }

  const contactId = String(formData.get('contact_id') ?? '').trim() || null
  const contactNameManual = String(formData.get('contact_name_manual') ?? '').trim() || null
  const contactPhoneManual = String(formData.get('contact_phone_manual') ?? '').trim() || null
  const serviceId = String(formData.get('service_id') ?? '').trim() || null
  const serviceNameManual = String(formData.get('service_name_manual') ?? '').trim() || null
  const serviceDescriptionManual = String(formData.get('service_description_manual') ?? '').trim() || null
  const assignedUserId = String(formData.get('assigned_user_id') ?? '').trim() || null

  if (contactId && !uuidPattern.test(contactId)) {
    fail('Identificador do contato inválido.')
  }
  if (serviceId && !uuidPattern.test(serviceId)) {
    fail('Identificador do serviço inválido.')
  }
  if (assignedUserId && !uuidPattern.test(assignedUserId)) {
    fail('Identificador do responsável inválido.')
  }

  // Verificar que registros vinculados pertencem à empresa atual
  if (contactId) {
    const { data: contact, error: contactError } = await supabase
      .from('people')
      .select('id')
      .eq('id', contactId)
      .eq('company_id', companyId)
      .maybeSingle()
    if (contactError || !contact) {
      fail('O contato vinculado não pertence à empresa atual.')
    }
  }

  if (serviceId) {
    const { data: service, error: serviceError } = await supabase
      .from('products')
      .select('id')
      .eq('id', serviceId)
      .eq('company_id', companyId)
      .maybeSingle()
    if (serviceError || !service) {
      fail('O serviço vinculado não pertence à empresa atual.')
    }
  }

  if (assignedUserId) {
    const { data: member, error: memberError } = await supabase
      .from('crm_company_members')
      .select('user_id')
      .eq('user_id', assignedUserId)
      .eq('company_id', companyId)
      .eq('active', true)
      .maybeSingle()
    if (memberError || !member) {
      fail('O responsável vinculado não pertence à empresa atual.')
    }
  }

  // Verificar se o usuário é admin/owner da empresa
  const isAdminOrOwner = isAgendaAdministrator(actor)

  let assignedUserIdFinal = assignedUserId

  // Vendedores só podem criar/editar compromissos próprios (assigned_user_id = userId)
  if (!isAdminOrOwner) {
    if (id) {
      // Edição: só pode editar se for o responsável
      const { data: existing, error: lookupError } = await supabase
        .from('agenda_events')
        .select('id, company_id, assigned_user_id')
        .eq('id', id)
        .eq('company_id', companyId)
        .maybeSingle()
      if (lookupError || !existing) {
        fail('Compromisso não encontrado ou sem acesso.')
      }
      if (!canManageAgendaEvent(actor, existing!)) {
        fail('Você só pode editar compromissos dos quais é responsável.')
      }
      // Não-admin não pode transferir responsável
      assignedUserIdFinal = userId
    } else {
      // Criação: só pode criar para si mesmo
      const assignment = resolveAgendaAssignee(actor, assignedUserIdFinal)
      if (!assignment.allowed) {
        fail('Você só pode criar compromissos para si mesmo.')
      }
      // Forçar assigned_user_id = userId para não-admins
      assignedUserIdFinal = assignment.userId
    }
  }

  const payload = buildAgendaEventPayload({
    company_id: companyId,
    title,
    description,
    event_type: eventType,
    starts_at: startDateTime.toISOString(),
    ends_at: endDateTime.toISOString(),
    all_day: allDay,
    contact_id: contactId,
    contact_name_manual: contactNameManual,
    contact_phone_manual: contactPhoneManual,
    service_id: serviceId,
    service_name_manual: serviceNameManual,
    service_description_manual: serviceDescriptionManual,
    assigned_user_id: assignedUserIdFinal,
    status,
    color,
  })

  if (id) {
    const { error } = await supabase.from('agenda_events').update(payload).eq('id', id).eq('company_id', companyId)
    if (error) {
      fail('Não foi possível atualizar o compromisso.')
    }
    revalidatePath('/agenda')
    return { ok: true, message: 'Compromisso atualizado com sucesso.', eventId: id }
  }

  const { data: insertedData, error } = await supabase
    .from('agenda_events')
    .insert(payload)
    .select('id')
    .single()
  if (error || !insertedData) {
    fail('Não foi possível criar o compromisso.')
  }
  revalidatePath('/agenda')
  return { ok: true, message: 'Compromisso criado com sucesso.', eventId: insertedData!.id }
}

export async function deleteAgendaEvent(formData: FormData): Promise<AgendaEventResult> {
  const { supabase, actor } = await resolveAgendaContext()
  const { companyId } = actor

  const schemaReady = await hasAgendaSchema(supabase)
  if (!schemaReady) {
    notice('A tabela de compromissos ainda não está disponível.')
  }

  const eventId = String(formData.get('event_id') ?? '').trim()
  if (!uuidPattern.test(eventId)) {
    fail('Identificador do compromisso inválido.')
  }

  // Verificar que o compromisso existe e pertence à empresa
  const { data: existing, error: lookupError } = await supabase
    .from('agenda_events')
    .select('id, company_id, assigned_user_id')
    .eq('id', eventId)
    .eq('company_id', companyId)
    .maybeSingle()
  if (lookupError || !existing) {
    fail('Compromisso não encontrado ou sem acesso.')
  }

  // Verificar se o usuário é admin/owner da empresa
  const isAdminOrOwner = isAgendaAdministrator(actor)

  // Vendedores só podem excluir compromissos próprios
  if (!isAdminOrOwner && (!existing || !canManageAgendaEvent(actor, existing))) {
    fail('Você só pode excluir compromissos dos quais é responsável.')
  }

  const { error } = await supabase.from('agenda_events').delete().eq('id', eventId).eq('company_id', companyId)
  if (error) {
    fail('Não foi possível excluir o compromisso.')
  }
  revalidatePath('/agenda')
  return { ok: true, message: 'Compromisso excluído com sucesso.' }
}

export async function setAgendaEventStatus(formData: FormData): Promise<AgendaEventResult> {
  const { supabase, actor } = await resolveAgendaContext()
  const { companyId } = actor

  const schemaReady = await hasAgendaSchema(supabase)
  if (!schemaReady) {
    notice('A tabela de compromissos ainda não está disponível.')
  }

  const eventId = String(formData.get('event_id') ?? '').trim()
  const newStatus = String(formData.get('new_status') ?? '')

  if (!uuidPattern.test(eventId)) {
    fail('Identificador do compromisso inválido.')
  }
  if (!['scheduled', 'completed', 'cancelled'].includes(newStatus)) {
    fail('Status de compromisso inválido.')
  }

  const { data: event, error: loadError } = await supabase
    .from('agenda_events')
    .select('id, company_id, status, assigned_user_id')
    .eq('id', eventId)
    .eq('company_id', companyId)
    .maybeSingle()
  if (loadError || !event) {
    fail('O compromisso não foi encontrado ou já foi removido.')
  }

  // Verificar se o usuário é admin/owner da empresa
  const isAdminOrOwner = isAgendaAdministrator(actor)

  // Vendedores só podem mudar status de compromissos próprios
  if (!isAdminOrOwner && (!event || !canManageAgendaEvent(actor, event))) {
    fail('Você só pode alterar o status de compromissos dos quais é responsável.')
  }

  const current = event as { id: string; status: string }
  const allowed = isAllowedAgendaStatusTransition(current.status, newStatus)
  if (!allowed) {
    fail('A transição de status do compromisso não é válida.')
  }

  const { error } = await supabase
    .from('agenda_events')
    .update({ status: newStatus })
    .eq('id', eventId)
    .eq('company_id', companyId)
  if (error) {
    fail('Não foi possível atualizar o status do compromisso.')
  }
  revalidatePath('/agenda')
  return {
    ok: true,
    message:
      newStatus === 'completed'
        ? 'Compromisso concluído.'
        : newStatus === 'cancelled'
          ? 'Compromisso cancelado.'
          : 'Compromisso reaberto.',
  }
}
