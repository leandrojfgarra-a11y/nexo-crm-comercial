'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function ClicksignControls({ contractId, envelopeId, status, contractStatus, signerName, signerEmail, enabled }: { contractId: string; envelopeId: string | null; status: string; contractStatus: string; signerName: string; signerEmail: string; enabled: boolean }) {
  const router = useRouter()
  const [name, setName] = useState(signerName)
  const [email, setEmail] = useState(signerEmail)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function request(action: 'send' | 'sync') {
    if (action === 'send' && !window.confirm(`Enviar este contrato para assinatura via Clicksign a ${email}? A ativação notificará o signatário por e-mail.`)) return
    setBusy(true); setError(''); setMessage('')
    try {
      const response = await fetch(`/api/contracts/${contractId}/clicksign`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, signerName: name, signerEmail: email }) })
      const result = await response.json() as { ok?: boolean; error?: string; message?: string }
      if (!response.ok || !result.ok) { setError(result.error || 'Não foi possível concluir a operação Clicksign.'); router.refresh(); return }
      setMessage(result.message || 'Operação concluída.')
      router.refresh()
    } catch { setError('Não foi possível comunicar com o servidor do CRM.') }
    finally { setBusy(false) }
  }

  if (!enabled) return <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">A integração depende da migration <strong>202611080002_clicksign_contracts.sql</strong> e da configuração privada do token no servidor.</p>

  const canSend = contractStatus === 'draft' && (!status || status === 'draft')

  return <div className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
    {envelopeId ? <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted">Clicksign · {status || 'vinculado'} · envelope <span className="font-mono">{envelopeId}</span></p><button type="button" disabled={busy} onClick={() => void request('sync')} className="btn-base btn-secondary btn-sm">{busy ? 'Consultando…' : 'Atualizar status'}</button></div> : <>
      <p className="text-sm font-semibold">Enviar para assinatura via Clicksign</p>
      {!canSend && <p className="text-xs text-amber-800">Somente contratos em rascunho podem ser enviados. Este contrato está como {contractStatus === 'signed' ? 'assinado' : contractStatus === 'active' ? 'vigente' : contractStatus === 'cancelled' ? 'cancelado' : contractStatus === 'closed' ? 'encerrado' : 'fora de rascunho'}. Cadastre um novo contrato em rascunho para iniciar uma assinatura.</p>}
      <div className="grid gap-2 sm:grid-cols-2"><label className="grid gap-1 text-xs font-medium">Nome do signatário<input value={name} onChange={event => setName(event.target.value)} maxLength={160} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" /></label><label className="grid gap-1 text-xs font-medium">E-mail do signatário<input type="email" value={email} onChange={event => setEmail(event.target.value)} maxLength={254} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" /></label></div>
      <p className="text-xs text-muted">O envio usa autenticação por e-mail. A confirmação abre o envelope e notifica o signatário.</p>
      <button type="button" disabled={busy || !canSend || name.trim().length < 2 || !email.includes('@')} onClick={() => void request('send')} className="btn-base btn-primary btn-sm w-fit">{busy ? 'Enviando…' : 'Enviar contrato para assinatura'}</button>
    </>}
    {message && <p role="status" className="text-xs text-emerald-800">{message}</p>}{error && <p role="alert" className="text-xs text-red-700">{error}</p>}
  </div>
}
