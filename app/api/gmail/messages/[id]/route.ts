import { loadGmailConnection, gmailFetch, getHeader, extractPlainText, jsonError } from '@/lib/gmail/server'

type GmailMessage = {
  id: string; threadId: string; snippet?: string; internalDate?: string
  payload?: { headers?: Array<{ name: string; value: string }>; body?: { data?: string }; parts?: any[] }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!/^[a-zA-Z0-9_-]{1,200}$/.test(id)) return jsonError('Identificador de mensagem inválido.', 400)
    const context = await loadGmailConnection()
    const message = await gmailFetch<GmailMessage>(context, `messages/${encodeURIComponent(id)}?format=full`)
    return Response.json({ ok: true, message: {
      id: message.id, threadId: message.threadId,
      from: getHeader(message.payload?.headers, 'From'), to: getHeader(message.payload?.headers, 'To'),
      subject: getHeader(message.payload?.headers, 'Subject') || '(sem assunto)',
      date: getHeader(message.payload?.headers, 'Date') || (message.internalDate ? new Date(Number(message.internalDate)).toISOString() : ''),
      rfcMessageId: getHeader(message.payload?.headers, 'Message-ID'),
      references: getHeader(message.payload?.headers, 'References'),
      body: extractPlainText(message.payload),
    } }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Não foi possível abrir esta mensagem.', 502)
  }
}
