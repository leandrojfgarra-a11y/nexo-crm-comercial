const CRM_ORIGINS = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
])

function validWhatsAppUrl(value) {
  try {
    const url = new URL(value)
    return url.origin === 'https://web.whatsapp.com'
      && url.pathname === '/send'
      && /^\d{10,15}$/.test(url.searchParams.get('phone') || '')
  } catch {
    return false
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'NEXO_OPEN_WHATSAPP' || !sender.url) return

  let senderOrigin
  try {
    senderOrigin = new URL(sender.url).origin
  } catch {
    return
  }

  if (!CRM_ORIGINS.has(senderOrigin) || !validWhatsAppUrl(message.url)) {
    sendResponse({ ok: false, error: 'Solicitação inválida.' })
    return
  }

  ;(async () => {
    try {
      const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' })
      const existing = tabs.find(tab => Number.isInteger(tab.id))
      if (existing?.id != null) {
        await chrome.tabs.update(existing.id, { url: message.url, active: true })
        if (existing.windowId != null) await chrome.windows.update(existing.windowId, { focused: true })
        sendResponse({ ok: true, reused: true })
        return
      }

      await chrome.tabs.create({ url: message.url, active: true })
      sendResponse({ ok: true, reused: false })
    } catch {
      sendResponse({ ok: false, error: 'O Chrome não conseguiu abrir o WhatsApp Web.' })
    }
  })()

  return true
})
