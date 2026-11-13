import { loadGmailConnection, gmailFetch, jsonError } from '@/lib/gmail/server'
import { randomUUID } from 'node:crypto'

function encodeSubject(value: string) {
  return /^[\x20-\x7E]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`
}

function base64Url(value: string) {
  return Buffer.from(value, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function mimeBase64(value: string) {
  return Buffer.from(value, 'utf8').toString('base64').match(/.{1,76}/g)?.join('\r\n') ?? ''
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!)
}

function textToHtml(value: string) {
  return escapeHtml(value).replace(/\r?\n/g, '<br>')
}

function signatureHtml(signature: string, logo: boolean) {
  const lines = signature.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  if (!lines.length) return ''
  const [name = '', role = '', company = '', ...contacts] = lines
  const contactHtml = contacts.map(line => {
    const match = line.match(/(\+?[\d\s().-]{8,})/)
    if (/whatsapp/i.test(line) && match) {
      const number = match[1].replace(/\D/g, '')
      return `<a href="https://wa.me/${number}" style="color:#1769aa;text-decoration:none;font-weight:600">${escapeHtml(line)}</a>`
    }
    if (/e-mail|email/i.test(line)) {
      const address = line.split(':').slice(1).join(':').trim()
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return `<a href="mailto:${escapeHtml(address)}" style="color:#1769aa;text-decoration:none;font-weight:600">${escapeHtml(line)}</a>`
    }
    return escapeHtml(line)
  }).join('<br>')

  const logoCell = logo ? '<td width="170" style="width:170px;padding:0 18px 0 0;vertical-align:middle"><img src="cid:nexo-signature-logo" alt="Garra Automação Comercial" width="150" style="display:block;width:150px;max-width:150px;height:auto;border:0"></td>' : ''
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:18px;border-collapse:collapse;font-family:Arial,sans-serif;color:#26364b"><tr>${logoCell}<td style="padding:0;vertical-align:middle"><strong style="font-size:16px;letter-spacing:.2px;color:#10243e">${escapeHtml(name)}</strong>${role ? `<br><span style="font-size:12px;line-height:1.7;color:#5d6f83">${escapeHtml(role)}</span>` : ''}${company ? `<br><strong style="font-size:12px;letter-spacing:.6px;color:#0b79a8">${escapeHtml(company.toLocaleUpperCase('pt-BR'))}</strong>` : ''}${contactHtml ? `<br><span style="display:inline-block;margin-top:7px;font-size:11px;line-height:1.8;color:#536780">${contactHtml}</span>` : ''}</td></tr></table>`
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { to?: string; subject?: string; text?: string; signature?: string; signatureLogo?: string; quotedText?: string; threadId?: string; inReplyTo?: string; references?: string }
    const to = body.to?.trim() ?? ''
    const subject = body.subject?.trim() ?? ''
    const text = body.text?.trim() ?? ''
    const signature = body.signature?.trim().slice(0, 2000) ?? ''
    const quotedText = body.quotedText?.trim().slice(0, 50_000) ?? ''
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(to) || to.length > 254) return jsonError('Informe um e-mail destinatário válido.')
    if (!subject || subject.length > 998) return jsonError('Informe um assunto com até 998 caracteres.')
    if (!text || text.length > 100_000) return jsonError('Escreva a mensagem (máximo de 100.000 caracteres).')
    if (body.threadId && !/^[a-zA-Z0-9_-]{1,200}$/.test(body.threadId)) return jsonError('Conversa Gmail inválida.')

    let logo: { mime: string; extension: string; bytes: Buffer } | null = null
    if (body.signatureLogo) {
      const match = body.signatureLogo.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/)
      if (!match) return jsonError('A logomarca da assinatura está em um formato inválido.')
      const bytes = Buffer.from(match[2], 'base64')
      if (!bytes.length || bytes.length > 350_000) return jsonError('A logomarca da assinatura deve ter até 350 KB após a otimização.')
      logo = { mime: `image/${match[1]}`, extension: match[1] === 'jpeg' ? 'jpg' : match[1], bytes }
    }

    const context = await loadGmailConnection()
    if (!context.connection) return jsonError('Conecte uma conta Gmail antes de enviar mensagens.', 409)
    const plainText = [text, signature ? `--\n${signature}` : '', quotedText ? `\n\n${quotedText}` : ''].filter(Boolean).join('\n\n')
    const htmlBody = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#26364b">${textToHtml(text)}${signature ? signatureHtml(signature, Boolean(logo)) : ''}${quotedText ? `<div style="margin-top:20px;border-left:3px solid #cbd5e1;padding-left:12px;color:#64748b">${textToHtml(quotedText)}</div>` : ''}</div>`
    const altBoundary = `nexo-alt-${randomUUID()}`
    const relatedBoundary = `nexo-related-${randomUUID()}`
    const messageParts = [
      `From: ${context.connection.email}`,
      `To: ${to}`,
      `Subject: ${encodeSubject(subject)}`,
      ...(body.inReplyTo ? [`In-Reply-To: ${body.inReplyTo.replace(/[\r\n]/g, '').slice(0, 998)}`] : []),
      ...(body.references ? [`References: ${body.references.replace(/[\r\n]/g, '').slice(0, 2000)}`] : []),
      'MIME-Version: 1.0',
      `Content-Type: multipart/related; boundary="${relatedBoundary}"`,
      '',
      `--${relatedBoundary}`,
      `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
      '',
      `--${altBoundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64', '', mimeBase64(plainText),
      `--${altBoundary}`,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: base64', '', mimeBase64(htmlBody),
      `--${altBoundary}--`,
      ...(logo ? [`--${relatedBoundary}`, `Content-Type: ${logo.mime}; name="garra-signature.${logo.extension}"`, 'Content-Transfer-Encoding: base64', 'Content-ID: <nexo-signature-logo>', `Content-Disposition: inline; filename="garra-signature.${logo.extension}"`, '', logo.bytes.toString('base64').match(/.{1,76}/g)?.join('\r\n') ?? ''] : []),
      `--${relatedBoundary}--`,
    ]
    const raw = messageParts.join('\r\n')
    await gmailFetch(context, 'messages/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ raw: base64Url(raw), ...(body.threadId ? { threadId: body.threadId } : {}) }),
    })
    return Response.json({ ok: true, message: 'E-mail enviado pelo Gmail.' }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Não foi possível enviar o e-mail.', 502)
  }
}
