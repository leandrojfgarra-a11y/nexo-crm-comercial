import { decryptGmailToken, loadGmailConnection, jsonError } from '@/lib/gmail/server'

export async function POST() {
  try {
    const context = await loadGmailConnection()
    if (!context.connection) return Response.json({ ok: true })
    const refreshToken = decryptGmailToken(context.connection.refresh_token_encrypted)
    // A revogação no Google é explícita, vinculada ao clique em Desconectar.
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`, { method: 'POST', cache: 'no-store' }).catch(() => undefined)
    const { error } = await context.supabase.from('gmail_connections').delete().eq('company_id', context.companyId)
    if (error) return jsonError('Não foi possível remover a conexão Gmail do CRM.', 500)
    return Response.json({ ok: true })
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Não foi possível desconectar o Gmail.', 500)
  }
}
