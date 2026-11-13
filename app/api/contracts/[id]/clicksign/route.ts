import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isUuid, PRIVATE_CUSTOMER_BUCKET } from '@/lib/customer-files'
import { resolveTenantContext } from '@/lib/tenant/context'

type ClicksignData = { data?: { id?: string; attributes?: { status?: string; closed_at?: string; modified?: string } } }
const apiRoot = () => process.env.CLICKSIGN_ENVIRONMENT === 'production' ? 'https://app.clicksign.com/api/v3' : 'https://sandbox.clicksign.com/api/v3'

async function clicksign(path: string, init: RequestInit = {}) {
  const token = process.env.CLICKSIGN_ACCESS_TOKEN?.trim()
  if (!token) throw new Error('CLICKSIGN_ACCESS_TOKEN não está configurado no servidor.')
  const response = await fetch(`${apiRoot()}${path}`, {
    ...init,
    cache: 'no-store',
    signal: AbortSignal.timeout(30_000),
    headers: { Authorization: token, Accept: 'application/vnd.api+json', 'Content-Type': 'application/vnd.api+json', ...init.headers },
  })
  const body = await response.json().catch(() => null) as ClicksignData | null
  if (!response.ok) {
    const detail = (body as { errors?: Array<{ detail?: string; title?: string }> } | null)?.errors?.map(error => error.detail || error.title).filter(Boolean).join('; ')
    throw new Error(detail || `Clicksign respondeu HTTP ${response.status}.`)
  }
  return body ?? {}
}

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status })
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get('origin')
  if (!origin || origin !== request.nextUrl.origin) return new Response('Forbidden', { status: 403 })
  const { id } = await context.params
  if (!isUuid(id)) return jsonError('Contrato inválido.')
  let body: { action?: string; signerName?: string; signerEmail?: string }
  try { body = await request.json() as typeof body } catch { return jsonError('Requisição inválida.') }
  const supabase = await createAdminClient()
  const tenant = await resolveTenantContext(supabase)
  const { data: contract, error: contractError } = await supabase.from('customer_contracts')
    .select('id,customer_id,contract_number,title,status,storage_path,original_file_name,mime_type,file_size,clicksign_envelope_id,clicksign_document_id,clicksign_signer_id,clicksign_status')
    .eq('id', id).eq('company_id', tenant.companyId).maybeSingle()
  if (contractError) return jsonError(contractError.message.includes('clicksign_') ? 'Aplique a migration incremental Clicksign antes de usar esta função.' : 'Não foi possível carregar o contrato.', 409)
  if (!contract) return jsonError('Contrato não encontrado ou sem acesso.', 404)

  if (body.action === 'sync') {
    if (!contract.clicksign_envelope_id) return jsonError('Este contrato ainda não possui envelope Clicksign.')
    try {
      const remote = await clicksign(`/envelopes/${encodeURIComponent(contract.clicksign_envelope_id)}`)
      const remoteStatus = remote.data?.attributes?.status
      if (!remoteStatus || !['draft', 'running', 'closed', 'canceled'].includes(remoteStatus)) return jsonError('A Clicksign retornou um status não reconhecido; o CRM não foi alterado.', 502)
      const localStatus = remoteStatus === 'running' ? 'awaiting_signature' : remoteStatus === 'closed' ? 'signed' : remoteStatus === 'canceled' ? 'cancelled' : contract.status
      const update: Record<string, unknown> = { clicksign_status: remoteStatus, clicksign_synced_at: new Date().toISOString() }
      if (localStatus !== contract.status) update.status = localStatus
      const { error } = await supabase.from('customer_contracts').update(update).eq('id', id).eq('company_id', tenant.companyId)
      if (error) return jsonError('Status lido na Clicksign, mas não foi possível atualizá-lo no CRM.', 500)
      return NextResponse.json({ ok: true, status: remoteStatus, message: `Status Clicksign atualizado: ${remoteStatus}.` })
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : 'Não foi possível consultar a Clicksign.', 502)
    }
  }

  if (body.action !== 'send') return jsonError('Ação inválida.')
  if (contract.clicksign_envelope_id) return jsonError(`Este contrato já está ligado ao envelope ${contract.clicksign_envelope_id}. Sincronize o status para evitar um envio duplicado.`, 409)
  if (contract.status !== 'draft') return jsonError('Somente contratos em rascunho podem ser enviados à Clicksign.')
  const signerName = String(body.signerName ?? '').trim()
  const signerEmail = String(body.signerEmail ?? '').trim().toLowerCase()
  if (signerName.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signerEmail)) return jsonError('Informe o nome e um e-mail válido do signatário.')
  if (!['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(contract.mime_type)) return jsonError('A Clicksign aceita aqui somente contrato PDF ou DOCX.')

  const { data: file, error: fileError } = await supabase.storage.from(PRIVATE_CUSTOMER_BUCKET).download(contract.storage_path)
  if (fileError || !file) return jsonError('Não foi possível ler o contrato no Storage privado.', 409)
  if (file.size > 10 * 1024 * 1024) return jsonError('O arquivo excede o limite atual de 10 MB.')

  let envelopeId = ''
  try {
    const envelope = await clicksign('/envelopes', { method: 'POST', body: JSON.stringify({ data: { type: 'envelopes', attributes: { name: `${contract.contract_number} · ${contract.title}`, locale: 'pt-BR' } } }) })
    envelopeId = envelope.data?.id ?? ''
    if (!envelopeId) throw new Error('A Clicksign não retornou o identificador do envelope.')
    const { error: checkpointError } = await supabase.from('customer_contracts').update({ clicksign_envelope_id: envelopeId, clicksign_status: 'draft', clicksign_synced_at: new Date().toISOString() }).eq('id', id).eq('company_id', tenant.companyId)
    if (checkpointError) throw new Error('Envelope criado na Clicksign, mas não vinculado ao CRM. Guarde o ID e não tente enviar novamente: ' + envelopeId)

    const bytes = Buffer.from(await file.arrayBuffer())
    const dataUri = `data:${contract.mime_type};base64,${bytes.toString('base64')}`
    const document = await clicksign(`/envelopes/${encodeURIComponent(envelopeId)}/documents`, { method: 'POST', body: JSON.stringify({ data: { type: 'documents', attributes: { filename: contract.original_file_name, content_base64: dataUri } } }) })
    const documentId = document.data?.id ?? ''
    if (!documentId) throw new Error('Documento enviado, mas a Clicksign não retornou seu identificador.')
    const { error: documentCheckpointError } = await supabase.from('customer_contracts').update({ clicksign_document_id: documentId }).eq('id', id).eq('company_id', tenant.companyId)
    if (documentCheckpointError) throw new Error(`Documento enviado, mas não foi possível registrar seu ID no CRM. Envelope: ${envelopeId}.`)

    const signer = await clicksign(`/envelopes/${encodeURIComponent(envelopeId)}/signers`, { method: 'POST', body: JSON.stringify({ data: { type: 'signers', attributes: { name: signerName, email: signerEmail, communicate_events: { signature_request: 'email', signature_reminder: 'email', document_signed: 'email' } } } }) })
    const signerId = signer.data?.id ?? ''
    if (!signerId) throw new Error('Signatário criado, mas a Clicksign não retornou seu identificador.')
    const { error: signerCheckpointError } = await supabase.from('customer_contracts').update({ clicksign_signer_id: signerId }).eq('id', id).eq('company_id', tenant.companyId)
    if (signerCheckpointError) throw new Error(`Signatário criado, mas não foi possível registrar seu ID no CRM. Envelope: ${envelopeId}.`)

    for (const attributes of [{ action: 'agree', role: 'sign' }, { action: 'provide_evidence', auth: 'email' }]) {
      await clicksign(`/envelopes/${encodeURIComponent(envelopeId)}/requirements`, { method: 'POST', body: JSON.stringify({ data: { type: 'requirements', attributes, relationships: { document: { data: { type: 'documents', id: documentId } }, signer: { data: { type: 'signers', id: signerId } } } } }) })
    }
    await clicksign(`/envelopes/${encodeURIComponent(envelopeId)}`, { method: 'PATCH', body: JSON.stringify({ data: { id: envelopeId, type: 'envelopes', attributes: { status: 'running' } } }) })
    const { error: localUpdateError } = await supabase.from('customer_contracts').update({ status: 'awaiting_signature', clicksign_status: 'running', clicksign_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', id).eq('company_id', tenant.companyId)
    if (localUpdateError) return jsonError(`Envelope enviado, mas o CRM não atualizou o status. Sincronize pelo ID ${envelopeId}.`, 500)
    return NextResponse.json({ ok: true, status: 'running', message: `Contrato enviado à Clicksign para ${signerEmail}.` })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Falha inesperada na integração.'
    return jsonError(envelopeId ? `${detail} O envelope rascunho ${envelopeId} foi preservado no CRM; não repita o envio. Verifique-o antes de continuar.` : detail, 502)
  }
}
