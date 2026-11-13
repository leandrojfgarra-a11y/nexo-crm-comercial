'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { startLeadNegotiation } from '@/app/oportunidades/actions'

export function LeadNegotiationButton({ leadId }: { leadId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')

  function start() {
    setError('')
    startTransition(async () => {
      const result = await startLeadNegotiation(leadId)
      if (!result.ok) {
        setError(result.message)
        return
      }
      router.push('/funil?notice=lead-negotiation-started')
    })
  }

  return <span className="inline-flex flex-col items-start gap-1">
    <button type="button" disabled={pending} onClick={start} title="Cria o cliente com os dados atuais do lead e abre a oportunidade em 1º contato" className="crm-button crm-button-primary !min-h-8 !px-2.5 !py-1">
      {pending ? 'Iniciando…' : 'Iniciar negociação'}
    </button>
    {error && <span role="alert" className="max-w-56 whitespace-normal text-xs font-normal text-red-700">{error}</span>}
  </span>
}
