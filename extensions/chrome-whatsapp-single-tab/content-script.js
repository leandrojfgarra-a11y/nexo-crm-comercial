document.addEventListener('click', event => {
  const rawTarget = event.target
  const target = rawTarget instanceof Element ? rawTarget : rawTarget?.parentElement || null
  const link = target?.closest('a[data-nexo-whatsapp-link="true"]')
  if (!link) return

  const url = link.href
  if (!url.startsWith('https://web.whatsapp.com/send?')) return

  event.preventDefault()
  event.stopImmediatePropagation()

  chrome.runtime.sendMessage({ type: 'NEXO_OPEN_WHATSAPP', url }, response => {
    if (chrome.runtime.lastError || !response?.ok) {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  })
}, true)
