'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'

type Folder = 'inbox' | 'sent' | 'starred' | 'important'
type MailSummary = { id: string; threadId: string; snippet: string; from: string; to: string; subject: string; date: string }
type MailDetail = MailSummary & { body: string; rfcMessageId?: string; references?: string }
const defaultSignature = 'Leandro Silva\nComercial | Analista de Vendas\nGarra Automação Comercial\nWhatsApp: +55 (32) 99847-8061\nE-mail: leandrojf.garra@gmail.com'

const folders: Array<{ id: Folder; label: string; icon: string }> = [
  { id: 'inbox', label: 'Caixa de entrada', icon: '▣' },
  { id: 'sent', label: 'Enviados', icon: '↗' },
  { id: 'starred', label: 'Com estrela', icon: '★' },
  { id: 'important', label: 'Importantes', icon: '◆' },
]

const noticeText: Record<string, string> = {
  connected: 'Gmail conectado. Sua caixa de entrada já pode ser consultada.',
  cancelled: 'A autorização do Google foi cancelada.',
  'missing-config': 'Falta configurar as credenciais OAuth e a chave de criptografia no servidor.',
  'state-error': 'Não foi possível validar a autorização. Inicie a conexão novamente.',
  'token-exchange-error': 'O Google não concluiu a autorização. Confira as credenciais OAuth e o endereço de retorno.',
  'profile-error': 'Não foi possível confirmar o endereço da conta Google.',
  'company-error': 'Seu usuário não está vinculado a uma empresa ativa.',
  'refresh-token-missing': 'O Google não retornou autorização contínua. Remova o acesso da conta Google e tente conectar novamente.',
  'save-error': 'A conexão foi autorizada, mas não pôde ser salva. Verifique se a migration Gmail foi aplicada.',
  'oauth-error': 'O Google retornou um erro na autorização.',
  'connection-error': 'Não foi possível concluir a conexão Gmail.',
}

function dateLabel(value: string) {
  if (!value) return 'Data indisponível'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('pt-BR')
}

function SignaturePreview({ signature, logo }: { signature: string; logo: string }) {
  const [name = '', role = '', company = '', ...contacts] = signature.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  return <div className="flex flex-wrap items-center gap-x-6 gap-y-4 bg-white py-2">
    {logo && <div className="flex min-h-16 w-40 shrink-0 items-center justify-center"><img src={logo} alt="Logomarca Garra Automação Comercial" className="max-h-16 max-w-full object-contain" /></div>}
    <div className="min-w-[220px] flex-1">
      <p className="text-base font-bold tracking-tight text-slate-900">{name || 'Leandro Silva'}</p>
      <p className="mt-0.5 text-sm text-slate-600">{role || 'Comercial | Analista de Vendas'}</p>
      <p className="mt-1 text-xs font-bold uppercase tracking-[0.08em] text-sky-700">{company || 'Garra Automação Comercial'}</p>
      {contacts.length > 0 && <div className="mt-2 grid gap-1 text-xs text-slate-600">{contacts.map((contact, index) => <span key={`${contact}-${index}`} className="inline-flex items-center gap-2">{/whatsapp/i.test(contact) ? <span aria-hidden="true" className="font-bold text-emerald-600">WA</span> : /e-mail|email/i.test(contact) ? <span aria-hidden="true" className="font-bold text-sky-700">@</span> : <span aria-hidden="true" className="text-slate-400">•</span>}{contact}</span>)}</div>}
    </div>
  </div>
}

export function GmailWorkspace({ email, configured, schemaReady, notice }: { email: string | null; configured: boolean; schemaReady: boolean; notice: string }) {
  const [messages, setMessages] = useState<MailSummary[]>([])
  const [selected, setSelected] = useState<MailDetail | null>(null)
  const [folder, setFolder] = useState<Folder>('inbox')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [compose, setCompose] = useState(false)
  const [replyDraft, setReplyDraft] = useState<{ to: string; subject: string; threadId: string; inReplyTo: string; references: string } | null>(null)
  const [replyQuote, setReplyQuote] = useState('')
  const [sending, setSending] = useState(false)
  const [body, setBody] = useState('')
  const [signature, setSignature] = useState(defaultSignature)
  const [signatureLogo, setSignatureLogo] = useState('')
  const [logoBusy, setLogoBusy] = useState(false)
  const [signatureEditor, setSignatureEditor] = useState(false)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try {
      setSignature(window.localStorage.getItem('nexo-gmail-signature') ?? defaultSignature)
      setSignatureLogo(window.localStorage.getItem('nexo-gmail-signature-logo') ?? '')
    } catch { /* armazenamento local indisponível */ }
  }, [])

  const loadMessages = useCallback(async (query = '', targetFolder: Folder = 'inbox') => {
    setLoading(true); setError(''); setSelected(null)
    try {
      const params = new URLSearchParams({ q: query, folder: targetFolder })
      const response = await fetch(`/api/gmail/messages?${params}`, { cache: 'no-store' })
      const data = await response.json() as { ok?: boolean; error?: string; messages?: MailSummary[] }
      if (!response.ok || !data.ok) throw new Error(data.error || 'Não foi possível carregar os e-mails.')
      setMessages(data.messages ?? [])
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao carregar e-mails.') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { if (email) void loadMessages('', 'inbox') }, [email, loadMessages])

  async function openMessage(id: string) {
    setError(''); setSelected(null)
    try {
      const response = await fetch(`/api/gmail/messages/${encodeURIComponent(id)}`, { cache: 'no-store' })
      const data = await response.json() as { ok?: boolean; error?: string; message?: MailDetail }
      if (!response.ok || !data.ok || !data.message) throw new Error(data.error || 'Não foi possível abrir esta mensagem.')
      setSelected(data.message)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao abrir e-mail.') }
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSending(true); setError(''); setSuccess('')
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    try {
      const response = await fetch('/api/gmail/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: form.get('to'), subject: form.get('subject'), text: body, signature, signatureLogo, quotedText: replyQuote, ...(replyDraft ? { threadId: replyDraft.threadId, inReplyTo: replyDraft.inReplyTo, references: replyDraft.references } : {}) }) })
      const data = await response.json() as { ok?: boolean; error?: string; message?: string }
      if (!response.ok || !data.ok) throw new Error(data.error || 'Não foi possível enviar o e-mail.')
      setSuccess(data.message || 'E-mail enviado.'); setCompose(false); setReplyDraft(null); setReplyQuote(''); setBody(''); formElement.reset()
      if (folder === 'sent') void loadMessages(search, 'sent')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao enviar e-mail.') }
    finally { setSending(false) }
  }

  async function disconnect() {
    if (!window.confirm(`Desconectar ${email} do CRM e revogar a autorização Gmail?`)) return
    setLoading(true); setError('')
    try {
      const response = await fetch('/api/gmail/disconnect', { method: 'POST' })
      const data = await response.json() as { ok?: boolean; error?: string }
      if (!response.ok || !data.ok) throw new Error(data.error || 'Não foi possível desconectar.')
      window.location.reload()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao desconectar.') }
    finally { setLoading(false) }
  }

  function startCompose() {
    setReplyDraft(null)
    setReplyQuote('')
    setBody('')
    setCompose(true)
  }

  function startReply() {
    if (!selected) return
    const recipient = selected.from.match(/<([^>]+)>/)?.[1] ?? selected.from.trim()
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(recipient)) {
      setError('Não consegui identificar o endereço do remetente para responder. Use Escrever e-mail.')
      return
    }
    const subject = /^re:/i.test(selected.subject) ? selected.subject : `Re: ${selected.subject}`
    setReplyDraft({ to: recipient, subject, threadId: selected.threadId, inReplyTo: selected.rfcMessageId ?? '', references: [selected.references, selected.rfcMessageId].filter(Boolean).join(' ') })
    const quote = selected.body.split('\n').map(line => `> ${line}`).join('\n')
    setReplyQuote(`Em ${dateLabel(selected.date)}, ${selected.from} escreveu:\n${quote}`)
    setBody('')
    setCompose(true)
  }

  function insertAtCursor(text: string) {
    const field = bodyRef.current
    if (!field) { setBody(current => `${current}${text}`); return }
    const start = field.selectionStart
    const end = field.selectionEnd
    const next = `${body.slice(0, start)}${text}${body.slice(end)}`
    setBody(next)
    requestAnimationFrame(() => { field.focus(); field.setSelectionRange(start + text.length, start + text.length) })
  }

  function insertList(marker: '• ' | '1. ') {
    const field = bodyRef.current
    const start = field?.selectionStart ?? body.length
    const end = field?.selectionEnd ?? body.length
    const selectedText = body.slice(start, end)
    const lines = (selectedText || ' ').split('\n').map((line, index) => `${marker === '1. ' ? `${index + 1}. ` : marker}${line}`).join('\n')
    insertAtCursor(lines)
  }

  function saveSignature() {
    try {
      window.localStorage.setItem('nexo-gmail-signature', signature.trim())
      if (signatureLogo) window.localStorage.setItem('nexo-gmail-signature-logo', signatureLogo)
      else window.localStorage.removeItem('nexo-gmail-signature-logo')
    } catch { setError('Não foi possível salvar a assinatura neste navegador. Remova a imagem ou use um arquivo menor.'); return }
    setSignature(signature.trim()); setSignatureEditor(false); setSuccess('Assinatura e logomarca salvas neste navegador.')
  }

  async function loadSignatureLogo(file?: File) {
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { setError('Use uma logomarca PNG, JPG ou WebP.'); return }
    if (file.size > 5 * 1024 * 1024) { setError('A imagem da assinatura deve ter no máximo 5 MB.'); return }
    setLogoBusy(true); setError('')
    let source = ''
    try {
      source = URL.createObjectURL(file)
      const image = new Image()
      image.src = source
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Não foi possível abrir essa imagem.')) })
      const cropHeight = Math.min(image.height, Math.max(1, image.width / 2.6))
      const cropY = Math.max(0, (image.height - cropHeight) / 2)
      const canvas = document.createElement('canvas')
      canvas.width = 650; canvas.height = Math.round(650 * cropHeight / image.width)
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Não foi possível preparar a logomarca.')
      context.drawImage(image, 0, cropY, image.width, cropHeight, 0, 0, canvas.width, canvas.height)
      const dataUrl = canvas.toDataURL('image/png')
      if (dataUrl.length > 450_000) throw new Error('A logomarca ficou muito grande. Use uma imagem menor ou mais otimizada.')
      setSignatureLogo(dataUrl)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível preparar a logomarca.') }
    finally { if (source) URL.revokeObjectURL(source); setLogoBusy(false) }
  }

  const activeFolder = folders.find(item => item.id === folder)?.label ?? 'Caixa de entrada'

  return <div className="gmail-workspace grid gap-5">
    {noticeText[notice] && <p role="status" className={`msg-base ${notice === 'connected' ? 'msg-success' : 'msg-warning'}`}>{noticeText[notice]}</p>}
    {!schemaReady && <p role="alert" className="msg-base msg-warning">A estrutura segura de conexão Gmail ainda não está no banco. Revise e aplique manualmente a migration <strong>202611090001_gmail_connections.sql</strong>.</p>}
    {!configured && <p role="alert" className="msg-base msg-warning">Configure as credenciais OAuth e a chave de criptografia do Gmail no servidor antes de conectar uma conta.</p>}
    {error && <p role="alert" className="msg-base msg-danger">{error}</p>}
    {success && <p role="status" className="msg-base msg-success">{success}</p>}

    {!email ? <section className="panel-base grid gap-4 p-6">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-red-50 text-2xl text-red-600" aria-hidden="true">✉</div>
      <div><h2 className="text-lg font-semibold">Conectar uma conta Gmail</h2><p className="mt-1 max-w-2xl text-sm text-muted">A conexão usa a tela oficial do Google. O Nexo não recebe sua senha; os tokens ficam cifrados no servidor e limitados à empresa atual.</p></div>
      <p className="text-sm text-muted">A autorização permite ler mensagens e enviar e-mails. Você pode revogá-la nesta tela ou nas configurações da sua Conta Google.</p>
      {configured && schemaReady && <a href="/api/gmail/connect" className="btn-base btn-primary btn-md w-fit">Conectar com Google</a>}
    </section> : <>
      <section className="gmail-account panel-base flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="flex min-w-0 items-center gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-blue-100 font-bold text-blue-800">G</div><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-muted">Conta conectada</p><p className="truncate font-semibold">{email}</p><p className="text-xs text-muted">Sincronização manual · conexão segura</p></div></div>
        <div className="flex flex-wrap gap-2"><button type="button" onClick={() => compose ? (setCompose(false), setReplyDraft(null), setBody('')) : startCompose()} className="btn-base btn-primary btn-md">{compose ? 'Fechar editor' : '＋ Escrever e-mail'}</button><button type="button" onClick={() => setSignatureEditor(value => !value)} className="btn-base btn-secondary btn-md">{signatureEditor ? 'Fechar assinatura' : 'Assinatura'}</button><button type="button" onClick={() => void disconnect()} className="btn-base btn-secondary btn-md">Desconectar</button></div>
      </section>

      {signatureEditor && <section className="panel-base grid gap-4 p-5">
        <div><h2 className="font-semibold">Assinatura de e-mail</h2><p className="text-sm text-muted">Incluída automaticamente em novas mensagens e respostas. Salva somente neste navegador.</p></div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.8fr)]">
          <label className="grid gap-1 text-sm font-medium">Dados da assinatura<textarea value={signature} onChange={event => setSignature(event.target.value)} rows={5} maxLength={2000} placeholder={'Seu nome\nCargo · Empresa\nWhatsApp: +55 00 00000-0000\nE-mail: voce@empresa.com.br'} className="w-full rounded-lg px-3 py-2.5 text-sm text-ink" /></label>
          <div className="grid content-start gap-2 text-sm"><span className="font-medium">Logomarca</span><input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={event => { void loadSignatureLogo(event.target.files?.[0]); event.currentTarget.value = '' }} className="sr-only" /><div className="flex flex-wrap gap-2"><button type="button" disabled={logoBusy} onClick={() => logoInputRef.current?.click()} className="btn-base btn-secondary btn-sm">{logoBusy ? 'Preparando imagem…' : signatureLogo ? 'Trocar logomarca' : 'Escolher logomarca'}</button>{signatureLogo && <button type="button" onClick={() => setSignatureLogo('')} className="btn-base btn-secondary btn-sm">Remover logo</button>}</div><p className="text-xs text-muted">PNG, JPG ou WebP; até 5 MB. A imagem é otimizada e anexada dentro do e-mail, sem URL pública.</p></div>
        </div>
        <div className="grid gap-2"><h3 className="text-sm font-semibold">Prévia da assinatura</h3><SignaturePreview signature={signature} logo={signatureLogo} /></div>
        <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={saveSignature} className="btn-base btn-primary btn-sm">Salvar assinatura</button><button type="button" onClick={() => { setSignature(''); setSignatureLogo(''); try { window.localStorage.removeItem('nexo-gmail-signature'); window.localStorage.removeItem('nexo-gmail-signature-logo') } catch { /* no-op */ } }} className="btn-base btn-secondary btn-sm">Remover assinatura</button><span className="text-xs text-muted">{signature.length}/2.000 caracteres</span></div>
      </section>}

      {compose && <section className="panel-base overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-blue">{replyDraft ? 'Resposta' : 'Nova mensagem'}</p><h2 className="font-semibold">{replyDraft ? 'Responder e-mail' : 'Escrever e-mail'}</h2></div><span className="rounded-full bg-white px-3 py-1 text-xs text-muted">Enviado por {email}</span></header>
        <form onSubmit={send} className="grid gap-4 p-5">
          <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm font-medium">Para<input name="to" type="email" required maxLength={254} defaultValue={replyDraft?.to ?? ''} placeholder="nome@empresa.com.br" className="w-full rounded-lg px-3 py-2.5 text-sm text-ink" /></label><label className="grid gap-1 text-sm font-medium">Assunto<input name="subject" required maxLength={998} defaultValue={replyDraft?.subject ?? ''} placeholder="Assunto da mensagem" className="w-full rounded-lg px-3 py-2.5 text-sm text-ink" /></label></div>
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 p-2" aria-label="Ferramentas de formatação">
              <span className="px-2 text-xs font-semibold uppercase tracking-wide text-muted">Inserir</span>
              <button type="button" onClick={() => insertList('• ')} className="gmail-tool" title="Inserir lista com marcadores">• Lista</button>
              <button type="button" onClick={() => insertList('1. ')} className="gmail-tool" title="Inserir lista numerada">1. Lista numerada</button>
              <button type="button" onClick={() => insertAtCursor('\n────────────\n')} className="gmail-tool">Divisor</button>
            </div>
            <label className="sr-only" htmlFor="gmail-message-body">Mensagem</label><textarea ref={bodyRef} id="gmail-message-body" value={body} onChange={event => setBody(event.target.value)} required maxLength={100000} rows={12} placeholder="Escreva sua mensagem…" className="gmail-composer-body w-full resize-y border-0 px-4 py-4 text-sm leading-7 text-ink outline-none focus:ring-0" />
            {(signature || signatureLogo) && <div className="border-t border-slate-200 bg-slate-50 p-4"><p className="mb-3 text-xs font-medium text-muted">Prévia da assinatura automática</p><SignaturePreview signature={signature} logo={signatureLogo} /></div>}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted">Texto simples com suporte a listas. O envio acontece somente quando você clicar em enviar.</p><div className="flex items-center gap-2"><span className="text-xs text-muted">{body.length.toLocaleString('pt-BR')}/100.000</span><button disabled={sending || !body.trim()} className="btn-base btn-primary btn-md disabled:opacity-50">{sending ? 'Enviando…' : 'Enviar e-mail'}</button></div></div>
        </form>
      </section>}

      <section className="panel-base overflow-hidden">
        <div className="border-b border-slate-200 px-4 pt-3"><div className="flex flex-wrap gap-1" role="tablist" aria-label="Pastas e marcadores do Gmail">{folders.map(item => <button type="button" role="tab" aria-selected={folder === item.id} key={item.id} onClick={() => { setFolder(item.id); void loadMessages(search, item.id) }} className={`gmail-folder-tab ${folder === item.id ? 'is-active' : ''}`}><span aria-hidden="true">{item.icon}</span>{item.label}</button>)}</div></div>
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 bg-slate-50/70 p-4"><form className="flex min-w-[240px] flex-1 gap-2" onSubmit={event => { event.preventDefault(); void loadMessages(search, folder) }}><label className="grid flex-1 gap-1 text-sm font-medium">Pesquisar em {activeFolder.toLowerCase()}<input value={search} onChange={event => setSearch(event.target.value)} placeholder="Remetente, assunto ou termos" className="w-full rounded-lg px-3 py-2.5 text-sm text-ink" /></label><button disabled={loading} className="btn-base btn-secondary btn-md self-end">Buscar</button></form><button type="button" disabled={loading} onClick={() => void loadMessages(search, folder)} className="btn-base btn-secondary btn-md">{loading ? 'Carregando…' : 'Atualizar'}</button></div>
        <div className="gmail-reading-pane grid min-h-[520px] lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.5fr)]">
          <div className="gmail-message-list divide-y divide-slate-100 border-b border-slate-100 lg:border-b-0 lg:border-r">{loading && !messages.length ? <p className="p-5 text-sm text-muted">Carregando mensagens…</p> : !messages.length ? <div className="grid min-h-56 place-content-center gap-2 p-6 text-center"><span className="text-3xl text-muted" aria-hidden="true">✉</span><p className="font-medium">Nenhuma mensagem encontrada</p><p className="text-sm text-muted">Tente outra busca ou atualize {activeFolder.toLowerCase()}.</p></div> : messages.map(message => <button type="button" key={message.id} onClick={() => void openMessage(message.id)} className={`gmail-message-row grid w-full gap-1 p-4 text-left transition ${selected?.id === message.id ? 'is-selected' : ''}`}><span className="flex items-center justify-between gap-3"><span className="truncate text-sm font-semibold">{message.from}</span><span className="shrink-0 text-[11px] text-muted">{dateLabel(message.date)}</span></span><span className="truncate text-sm">{message.subject}</span><span className="line-clamp-2 text-xs text-muted">{message.snippet}</span></button>)}</div>
          <article className="gmail-message-detail min-w-0 p-5 sm:p-6">{selected ? <div className="grid gap-5"><header className="border-b border-slate-200 pb-4"><div className="mb-3 flex flex-wrap items-start justify-between gap-3"><h2 className="min-w-0 flex-1 text-xl font-semibold leading-snug">{selected.subject}</h2><button type="button" onClick={startReply} className="btn-base btn-secondary btn-sm">↶ Responder</button></div><div className="grid gap-1 text-sm"><p><strong>De:</strong> {selected.from}</p><p><strong>Para:</strong> {selected.to}</p><p className="text-xs text-muted">{dateLabel(selected.date)}</p></div></header><pre className="gmail-message-body whitespace-pre-wrap break-words font-sans text-sm leading-7">{selected.body || '(A mensagem não contém texto simples exibível.)'}</pre></div> : <div className="grid h-full min-h-64 place-content-center gap-2 text-center text-sm text-muted"><span className="text-4xl" aria-hidden="true">✉</span><p className="font-medium text-ink">Sua caixa de correio</p><p>Selecione uma mensagem à esquerda para ler.</p></div>}</article>
        </div>
        <footer className="border-t border-slate-200 bg-slate-50/60 px-4 py-3 text-xs text-muted">A caixa de entrada é atualizada sob demanda. Os marcadores refletem as categorias do Gmail e são usados como filtros.</footer>
      </section>
      <p className="text-xs text-muted">Nesta versão, a consulta é manual; ainda não há sincronização em segundo plano nem associação automática ao histórico de clientes.</p>
    </>}
  </div>
}
