import { loadGmailConnection, gmailFetch, getHeader, jsonError } from '@/lib/gmail/server'

type GmailMessageList = { messages?: Array<{ id: string; threadId: string }>; nextPageToken?: string; resultSizeEstimate?: number }
type GmailMessage = { id: string; threadId: string; snippet?: string; internalDate?: string; payload?: { headers?: Array<{ name: string; value: string }> } }

export async function GET(request: Request) {
  try {
    const context = await loadGmailConnection()
    if (!context.connection) return jsonError('Conecte uma conta Gmail para ver a caixa de entrada.', 409)
    const url = new URL(request.url)
    const pageToken = url.searchParams.get('pageToken')
    const query = (url.searchParams.get('q') ?? '').trim().slice(0, 200)
    const folder = url.searchParams.get('folder') ?? 'inbox'
    const folderQuery: Record<string, string> = {
      inbox: 'in:inbox', sent: 'in:sent', starred: 'is:starred', important: 'is:important',
    }
    const baseQuery = folderQuery[folder] ?? folderQuery.inbox
    const params = new URLSearchParams({ maxResults: '20', q: query ? `${baseQuery} ${query}` : baseQuery })
    if (pageToken) params.set('pageToken', pageToken)
    const page = await gmailFetch<GmailMessageList>(context, `messages?${params.toString()}`)
    const messages = await Promise.all((page.messages ?? []).map(async ref => {
      const message = await gmailFetch<GmailMessage>(context, `messages/${encodeURIComponent(ref.id)}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`)
      return {
        id: message.id, threadId: message.threadId, snippet: message.snippet ?? '',
        from: getHeader(message.payload?.headers, 'From'), to: getHeader(message.payload?.headers, 'To'),
        subject: getHeader(message.payload?.headers, 'Subject') || '(sem assunto)',
        date: getHeader(message.payload?.headers, 'Date') || (message.internalDate ? new Date(Number(message.internalDate)).toISOString() : ''),
      }
    }))
    return Response.json({ ok: true, messages, nextPageToken: page.nextPageToken ?? null, totalEstimate: page.resultSizeEstimate ?? 0 }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Não foi possível carregar a caixa de entrada.', 502)
  }
}
