'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { submitPublicAcceptance } from '@/app/p/[token]/actions'

export function PublicProposalAcceptance({ token, blocked }: { token: string; blocked: boolean }) {
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState('')
  const [ok, setOk] = useState<boolean | null>(null)
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    startTransition(async () => {
      const result = await submitPublicAcceptance(token, String(data.get('name') ?? ''), String(data.get('email') ?? ''))
      setMessage(result.message); setOk(result.ok)
    })
  }
  return <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5 text-slate-900">
    <h2 className="text-lg font-bold">Manifestar aceite</h2>
    <p className="mt-1 text-sm text-slate-600">Seu aceite será registrado como pendente até a confirmação interna do Nexo.</p>
    {message && <p role={ok ? 'status' : 'alert'} className={`mt-4 rounded-lg border p-3 text-sm ${ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-950'}`}>{message}</p>}
    <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm font-medium">Nome completo *<input name="name" required minLength={2} maxLength={180} className="rounded-lg border border-slate-300 px-3 py-2.5" /></label><label className="grid gap-1 text-sm font-medium">E-mail *<input name="email" required type="email" maxLength={254} className="rounded-lg border border-slate-300 px-3 py-2.5" /></label><button disabled={pending || blocked} className="w-fit rounded-lg bg-blue px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 sm:col-span-2">{pending ? 'Enviando…' : blocked ? 'Proposta indisponível para aceite' : 'Registrar manifestação'}</button></form>
  </section>
}
