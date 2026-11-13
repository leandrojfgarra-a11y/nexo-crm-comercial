'use client'

import { useEffect, useRef, useState, useTransition, type DragEvent, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { addOpportunityActivity, advanceLeadToFirstContact, closeOpportunity, moveOpportunity, saveOpportunity } from '@/app/oportunidades/actions'
import type { OpportunityInput } from '@/app/oportunidades/actions'
import { messageForFunnelStage } from '@/lib/whatsapp-messages'

export type FunnelStageView = { id: string; name: string; position: number; is_won: boolean }
export type FunnelEventView = { id: string; created_at: string; event_type: string; note: string | null; old_value: unknown; new_value: unknown; actor_id: string | null }
export type FunnelActivityView = { id: string; opportunity_id: string; person_id: string; kind: 'call'|'message'|'meeting'|'task'|'note'; title: string; details: string | null; created_by: string | null; created_at: string }
export type FunnelProfileView = Record<string, any> & { customerId: string | null; accountant: Record<string, any> | null }
export type FunnelCardView = {
  id: string; type: 'lead' | 'opportunity'; leadId?: string; personId: string; subjectId: string; subjectLabel: string; subjectType: 'lead' | 'customer' | 'person'
  sellerName: string; sellerId: string; productName: string; productId: string
  title: string; installationValue: number | null; monthlyValue: number | null
  openedAt: string; expectedCloseDate: string; notes: string; stageId: string; status: 'open' | 'won'
  history?: FunnelEventView[]
  activities?: FunnelActivityView[]; additionalProductIds?: string[]; details?: FunnelProfileView
}
export type FunnelSubjectOption = { value: string; label: string }
export type FunnelOption = { id: string; name: string; kind?: string; defaultInstallationValue?: number | null; defaultMonthlyValue?: number | null }

function whatsappUrlForCard(card: FunnelCardView, stageName: string) {
  const details = card.details
  const phone = [details?.whatsapp, details?.mobile_phone, details?.phone]
    .map(value => String(value || '').replace(/\D/g, ''))
    .map(digits => digits.length === 10 || digits.length === 11 ? `55${digits}` : digits)
    .find(digits => digits.length >= 12 && digits.length <= 15)
  if (!phone) return null
  const name = String(details?.name || card.subjectLabel)
  const company = String(details?.trade_name || details?.name || card.subjectLabel)
  const text = encodeURIComponent(messageForFunnelStage(stageName, {
    contactName: name,
    companyName: company,
    activity: details?.business_activity || details?.primary_cnae,
    productName: card.productName,
  }))
  return `https://web.whatsapp.com/send?phone=${phone}&text=${text}`
}

function Info({ label, value }: { label: string; value: unknown }) {
  const text = value == null || value === '' ? '—' : String(value)
  return <div className="min-w-0"><dt className="text-xs text-muted">{label}</dt><dd className="mt-0.5 break-words font-medium">{text}</dd></div>
}

export function FunnelBoard({ stages, cards, subjects, sellers, products, today, profileReady, accountantDetailsReady }: {
  stages: FunnelStageView[]; cards: FunnelCardView[]; subjects: FunnelSubjectOption[]
  sellers: FunnelOption[]; products: FunnelOption[]; today: string; profileReady: boolean; accountantDetailsReady: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState('')
  const [messageOk, setMessageOk] = useState<boolean | null>(null)
  const [formCard, setFormCard] = useState<FunnelCardView | null | undefined>(undefined)
  const [formTab, setFormTab] = useState<'principais' | 'produto-valores' | 'datas' | 'implantacao-contrato'>('principais')
  const [formStageId, setFormStageId] = useState(stages[0]?.id ?? '')
  const [formProductId, setFormProductId] = useState('')
  const [additionalProductIds, setAdditionalProductIds] = useState<string[]>([])
  const [negotiatedValues, setNegotiatedValues] = useState({ installation: '', monthly: '' })
  const suggestedValues = useRef<{ installation: string | null; monthly: string | null }>({ installation: null, monthly: null })
  const [closeCardId, setCloseCardId] = useState('')
  const [closeType, setCloseType] = useState<'lost' | 'rejected'>('lost')
  const [selectedCard, setSelectedCard] = useState<FunnelCardView | null>(null)
  const [stageOverrides, setStageOverrides] = useState<Record<string, string>>({})
  const [movingCardIds, setMovingCardIds] = useState<Set<string>>(() => new Set())
  useEffect(() => {
    if (selectedCard) setSelectedCard(cards.find(card => card.id === selectedCard.id) ?? null)
  }, [cards, selectedCard?.id])
  useEffect(() => {
    setStageOverrides({})
  }, [cards])

  const displayedCards = cards.map(card => stageOverrides[card.id] ? { ...card, stageId: stageOverrides[card.id] } : card)

  const input = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-blue focus:ring-2 focus:ring-blue/15'
  const label = 'flex flex-col gap-1.5 text-sm font-medium text-ink'
  const required = <span className="text-blue ml-0.5" aria-hidden="true">*</span>

  function run(action: () => Promise<{ ok: boolean; message: string }>, successMessage?: string, refreshOnError = false) {
    setMessage('')
    setMessageOk(null)
    startTransition(async () => {
      const result = await action()
      setMessage(result.message)
      setMessageOk(result.ok)
      if (result.ok) {
        if (successMessage) setFormCard(undefined)
        setCloseCardId('')
      }
      if (result.ok || refreshOnError) router.refresh()
    })
  }

  function openCreate() {
    setFormStageId(stages[0]?.id ?? '')
    setFormProductId('')
    setAdditionalProductIds([])
    setNegotiatedValues({ installation: '', monthly: '' })
    suggestedValues.current = { installation: null, monthly: null }
    setFormCard(null)
    setMessage(''); setMessageOk(null)
  }
  function openEdit(card: FunnelCardView) {
    setFormStageId(card.stageId)
    setFormProductId(card.productId)
    setAdditionalProductIds((card.additionalProductIds ?? []).filter(id => id !== card.productId))
    setNegotiatedValues({
      installation: card.installationValue == null ? '' : card.installationValue.toFixed(2).replace('.', ','),
      monthly: card.monthlyValue == null ? '' : card.monthlyValue.toFixed(2).replace('.', ','),
    })
    suggestedValues.current = { installation: null, monthly: null }
    setFormCard(card)
    setMessage(''); setMessageOk(null)
  }

  function submitOpportunity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const [subjectType, subjectId] = String(form.get('subject') ?? '').split(':')
    const stageId = String(form.get('stageId') ?? '')
    const chosenStage = stages.find(item => item.id === stageId)
    const input: OpportunityInput = {
      id: String(form.get('id') ?? '') || undefined,
      fromStageId: String(form.get('fromStageId') ?? '') || undefined,
      subjectType: subjectType as 'lead' | 'customer' | 'person',
      subjectId: subjectId ?? '',
      sellerId: String(form.get('sellerId') ?? ''),
      productId: String(form.get('productId') ?? ''),
      title: String(form.get('title') ?? ''),
      installationValue: String(form.get('installationValue') ?? ''),
      monthlyValue: String(form.get('monthlyValue') ?? ''),
      openedAt: String(form.get('openedAt') ?? ''),
      expectedCloseDate: String(form.get('expectedCloseDate') ?? ''),
      notes: String(form.get('notes') ?? ''),
      stageId,
      status: chosenStage?.is_won ? 'won' : 'open',
      additionalProductIds: form.getAll('additionalProductIds').map(String),
      convertedAt: String(form.get('convertedAt') ?? ''), monthlyDueDay: String(form.get('monthlyDueDay') ?? ''),
      implementationOwner: String(form.get('implementationOwner') ?? ''), installationDate: String(form.get('installationDate') ?? ''),
      trainingDate: String(form.get('trainingDate') ?? ''), trainingsNeeded: String(form.get('trainingsNeeded') ?? ''), invoiceLimit: String(form.get('invoiceLimit') ?? ''),
      systemVersion: String(form.get('systemVersion') ?? ''), nfceVersion: String(form.get('nfceVersion') ?? ''), mdfeVersion: String(form.get('mdfeVersion') ?? ''), technicalNotes: String(form.get('technicalNotes') ?? ''),
      contractStatus: String(form.get('contractStatus') ?? 'pending'), boletoDeliveryMethod: String(form.get('boletoDeliveryMethod') ?? ''),
      installationFeeStatus: String(form.get('installationFeeStatus') ?? 'pending'), installationFeePaymentMethod: String(form.get('installationFeePaymentMethod') ?? ''), installationFeePaidAt: String(form.get('installationFeePaidAt') ?? ''),
    }
    run(() => saveOpportunity(input), 'saved', true)
  }

  function suggestProductValues(productId: string) {
    setFormProductId(productId)
    setAdditionalProductIds(previous => previous.filter(id => id !== productId))
    const product = products.find(item => item.id === productId)
    const normalized = (raw: string) => {
      if (!raw.trim()) return ''
      const value = Number(raw.trim().replace(',', '.'))
      return Number.isFinite(value) ? value.toFixed(2) : raw.trim()
    }
    const update = (currentValue: string, key: 'installation'|'monthly', value: number | null | undefined) => {
      const current = normalized(currentValue)
      const previousSuggestion = suggestedValues.current[key]
      const mayReplace = !current || (previousSuggestion !== null && current === previousSuggestion)
      if (!mayReplace) { suggestedValues.current[key] = null; return currentValue }
      suggestedValues.current[key] = value == null ? null : value.toFixed(2)
      return value == null ? '' : value.toFixed(2).replace('.', ',')
    }
    setNegotiatedValues({
      installation: update(negotiatedValues.installation, 'installation', product?.defaultInstallationValue),
      monthly: update(negotiatedValues.monthly, 'monthly', product?.defaultMonthlyValue),
    })
  }

  function dropCard(event: DragEvent<HTMLElement>, stage: FunnelStageView) {
    event.preventDefault()
    const token = event.dataTransfer.getData('text/plain')
    if (!token) return
    if (token.startsWith('lead:')) {
      if (stage.name !== '1º contato') {
        setMessage('Um lead pode avançar para 1º contato; depois, mova a oportunidade entre as etapas.')
        return
      }
      run(() => advanceLeadToFirstContact(token.slice(5)))
      return
    }
    const card = displayedCards.find(item => item.id === token)
    if (!card || card.stageId === stage.id) return
    if (card.status === 'won') {
      setMessage('Uma oportunidade WON não pode voltar para etapas abertas.')
      return
    }
    moveCardToStage(card, stage.id)
  }

  function selectStage(card: FunnelCardView, toStageId: string) {
    if (card.status === 'won') {
      setMessage('Uma oportunidade WON não pode voltar para etapas abertas.')
      return
    }
    moveCardToStage(card, toStageId)
  }

  function moveCardToStage(card: FunnelCardView, toStageId: string) {
    if (card.stageId === toStageId || movingCardIds.has(card.id)) return
    const previousStageId = card.stageId
    setMessage('')
    setMessageOk(null)
    setStageOverrides(current => ({ ...current, [card.id]: toStageId }))
    setMovingCardIds(current => new Set(current).add(card.id))
    void moveOpportunity(card.id, previousStageId, toStageId).then(result => {
      if (!result.ok) {
        setStageOverrides(current => {
          if (current[card.id] !== toStageId) return current
          const next = { ...current }
          delete next[card.id]
          return next
        })
      }
      setMessage(result.message)
      setMessageOk(result.ok)
    }).catch(() => {
      setStageOverrides(current => {
        if (current[card.id] !== toStageId) return current
        const next = { ...current }
        delete next[card.id]
        return next
      })
      setMessage('Não foi possível mover o card. Confira a conexão e tente novamente.')
      setMessageOk(false)
    }).finally(() => {
      setMovingCardIds(current => {
        const next = new Set(current)
        next.delete(card.id)
        return next
      })
    })
  }

  function submitClosure(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    run(() => closeOpportunity(closeCardId, closeType, String(form.get('reason') ?? '')))
  }

  function submitActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedCard || selectedCard.type !== 'opportunity') return
    const form = new FormData(event.currentTarget)
    const kind = String(form.get('kind') ?? 'note') as 'note'|'call'|'message'|'meeting'|'task'
    run(() => addOpportunityActivity(selectedCard.id, kind, String(form.get('title') ?? ''), String(form.get('details') ?? '')))
    event.currentTarget.reset()
  }

  const money = (value: number | null) => value == null
    ? '—'
    : value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  return <div>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <p className="text-sm text-muted">{cards.length} cartões no funil.</p>
      </div>
      <button type="button" onClick={openCreate} className="btn-base btn-primary btn-md">Nova oportunidade</button>
    </div>
    {message && <p role={messageOk ? 'status' : 'alert'} className={'mb-4 rounded-lg border px-4 py-3 text-sm ' + (messageOk ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900')}>{message}</p>}
    <div className="overflow-x-auto pb-5">
      <div className="flex min-h-[420px] items-start gap-4">
        {stages.map(stage => {
          const column = displayedCards.filter(card => card.stageId === stage.id)
          const stagePalette = ['#2878d0', '#18a7b5', '#805ad5', '#e59a19', '#15966a', '#dc5b82']
          const stageColor = stage.is_won ? '#15966a' : stagePalette[stage.position % stagePalette.length]
          return <section key={stage.id} onDragOver={event => event.preventDefault()} onDrop={event => dropCard(event, stage)}
            style={{ borderTopColor: stageColor }}
            className="crm-stage-column w-[300px] min-h-[400px] shrink-0 rounded-xl border border-t-4 border-slate-200 bg-slate-50/60 p-2">
            <header className="mb-2 flex items-center justify-between border-b border-slate-200 px-1 pb-2">
              <div><h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">{stage.name}</h2><p className="mt-0.5 text-[10px] text-muted">{column.length} {column.length === 1 ? 'cartão' : 'cartões'}</p></div>
              <span aria-label={'Etapa ' + (stage.position + 1)} className="h-2.5 w-2.5 rounded-full ring-3 ring-white/60" style={{ backgroundColor: stageColor }} />
            </header>
            <div className="grid gap-1.5">
              {column.map(card => { const waUrl = whatsappUrlForCard(card, stage.name); return <article key={card.id} tabIndex={0} onClick={event => { if (!(event.target as HTMLElement).closest('button,select,input,a,summary')) setSelectedCard(card) }} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); setSelectedCard(card) } }} draggable={card.status !== 'won'} onDragStart={event => event.dataTransfer.setData('text/plain', card.type === 'lead' ? 'lead:' + card.id : card.id)}
                className="crm-kanban-card rounded-lg border border-slate-200 bg-white p-2 shadow-sm transition-shadow hover:shadow-md max-w-full">
                <div className="mb-1.5 flex items-start justify-between gap-1.5">
                  <div className="min-w-0 flex-1"><p className="text-[9px] font-bold uppercase tracking-wide text-blue">{card.type === 'lead' ? 'Lead' : card.subjectType === 'customer' ? 'Cliente' : 'Oportunidade'}</p><h3 className="mt-0.5 text-sm font-bold break-words overflow-hidden max-h-[56px]">{card.subjectLabel}</h3></div>
                  <div className="flex items-center gap-1">{card.status === 'won' && <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">WON</span>}</div>
                </div>
                {card.type === 'opportunity' && card.title && <p className="mb-1.5 text-[11px] text-slate-600 line-clamp-1">{card.title}</p>}
                <dl className="grid gap-0.5 text-[10px] min-w-0">
                  {card.productName && <div className="flex justify-between gap-1 min-w-0"><dt className="text-slate-400 truncate">Produto</dt><dd className="text-right font-medium text-ink truncate min-w-0">{card.productName}</dd></div>}
                  {card.sellerName && <div className="flex justify-between gap-1 min-w-0"><dt className="text-slate-400 truncate">Vendedor</dt><dd className="text-right font-medium text-ink truncate min-w-0">{card.sellerName}</dd></div>}
                  {card.installationValue != null && card.installationValue > 0 && <div className="flex justify-between gap-1 min-w-0"><dt className="text-slate-400 truncate">Instalação</dt><dd className="text-right font-medium">{money(card.installationValue)}</dd></div>}
                  {card.monthlyValue != null && card.monthlyValue > 0 && <div className="flex justify-between gap-1 min-w-0"><dt className="text-slate-400 truncate">Mensalidade</dt><dd className="text-right font-medium">{money(card.monthlyValue)}</dd></div>}
                </dl>
                {card.history?.length ? <details className="mt-2 border-t border-slate-100 pt-2"><summary className="cursor-pointer text-xs font-semibold text-slate-600">Histórico ({card.history.length})</summary><ol className="mt-2 grid gap-2">{card.history.map(event => { const oldStage = (event.old_value as { stage_name?: string } | null)?.stage_name; const newStage = (event.new_value as { stage_name?: string } | null)?.stage_name; return <li key={event.id} className="text-[11px] text-muted line-clamp-1"><p>{new Date(event.created_at).toLocaleString('pt-BR')} · {event.event_type === 'stage_changed' ? 'Movimentação' : event.event_type === 'closed' ? 'Encerramento' : event.event_type === 'created' ? 'Criação' : 'Atualização'}{event.actor_id ? ' · usuário ' + event.actor_id.slice(0,8) : ''}</p>{oldStage || newStage ? <p>{oldStage || 'Início'} → {newStage || '—'}</p> : null}{event.note && <p>{event.note}</p>}</li>})}</ol></details> : null}
                <div className="mt-1.5 crm-action-group flex flex-wrap gap-1">
                  {waUrl ? <a href={waUrl} target="_blank" rel="noopener noreferrer" data-nexo-whatsapp-link="true" onClick={event => event.stopPropagation()} className="btn-base btn-success btn-sm">WhatsApp</a> : null}
                  {card.type === 'lead' ? (
                    <>
                      <button type="button" disabled={pending} onClick={() => run(() => advanceLeadToFirstContact(card.id))} className="mt-1 w-full rounded-lg bg-blue px-2.5 py-1.5 text-[10px] font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50">Avançar para 1º contato</button>
                      <button type="button" disabled={pending} onClick={() => openEdit(card)} className="mt-1 w-full rounded-lg bg-blue px-2.5 py-1.5 text-[10px] font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50">Ficha</button>
                    </>
                  ) : (
                    <>
                      <button type="button" disabled={pending} onClick={() => setSelectedCard(card)} className="btn-base btn-secondary btn-sm">Ficha</button>
                      <button type="button" disabled={pending} onClick={() => openEdit(card)} className="btn-base btn-secondary btn-sm">Editar</button>
                      {card.status === 'open' && (
                        <details className="relative inline-block">
                          <summary className="btn-base btn-ghost btn-sm" aria-controls={`move-menu-${card.id}`}>
                            {movingCardIds.has(card.id) ? 'Movendo…' : 'Mover para'}
                            <span className="ml-1 text-xs">▾</span>
                          </summary>
                          <ul id={`move-menu-${card.id}`} className="absolute right-0 mt-2 w-52 rounded-lg border border-slate-200 bg-white shadow-lg py-1 z-50">
                            <li className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Escolha qualquer etapa</li>
                            {stages.filter(s => s.id !== card.stageId).map(stage => (
                              <li key={stage.id}>
                                <button type="button" onClick={() => selectStage(card, stage.id)} disabled={movingCardIds.has(card.id)} className={`w-full text-left px-3 py-2 text-xs ${stage.is_won ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-700 hover:bg-slate-50'} disabled:opacity-50`}>{stage.name}</button>
                              </li>
                            ))}
                            {card.status === 'open' && (
                              <>
                                <li className="border-t border-slate-100 pt-2">
                                  <button type="button" onClick={() => { setCloseCardId(card.id); setCloseType('lost'); setMessage(''); setMessageOk(null) }} disabled={pending} className="w-full text-left px-3 py-2 text-xs text-rose-600 hover:bg-rose-50">Perdida</button>
                                </li>
                                <li>
                                  <button type="button" onClick={() => { setCloseCardId(card.id); setCloseType('rejected'); setMessage(''); setMessageOk(null) }} disabled={pending} className="w-full text-left px-3 py-2 text-xs text-amber-600 hover:bg-amber-50">Reprovada</button>
                                </li>
                              </>
                            )}
                          </ul>
                        </details>
                      )}
                    </>
                  )}
                </div>
              </article>})}
              {column.length === 0 && <p className="grid min-h-20 place-items-center rounded-lg border border-dashed border-slate-200 px-2 text-center text-[10px] text-muted">Vazio</p>}
            </div>
          </section>
        })}
      </div>
    </div>

    {formCard !== undefined && <div className="fixed inset-0 z-30 grid place-items-center overflow-y-auto bg-slate-950/40 p-4" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setFormCard(undefined) }}>
      <section role="dialog" aria-modal="true" aria-labelledby="opportunity-form-title" className="commercial-edit-modal my-auto max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-surface p-5 text-ink shadow-xl">
        <div className="mb-4 flex items-center justify-between"><h2 id="opportunity-form-title" className="text-lg font-bold">{formCard ? 'Editar oportunidade' : 'Nova oportunidade'}</h2><button type="button" onClick={() => setFormCard(undefined)} className="rounded border px-3 py-1 text-sm">Fechar</button></div>
        {message && <p role={messageOk ? 'status' : 'alert'} className={'mb-4 rounded-lg border px-3 py-2 text-sm ' + (messageOk ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800')}>{message}</p>}
        <form onSubmit={submitOpportunity} className="space-y-5">
          {formCard && <input type="hidden" name="id" value={formCard.id} />}
          {formCard && <input type="hidden" name="fromStageId" value={formCard.stageId} />}

          {/* Navegação por abas do formulário */}
          <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-2 mb-2">
            <button
              type="button"
              onClick={() => { setFormTab('principais') }}
              aria-pressed={formTab === 'principais'}
              className={`px-4 py-2.5 text-sm font-medium rounded-lg transition ${formTab === 'principais'
                ? 'bg-blue text-white border-blue'
                : 'text-slate-600 hover:bg-slate-50 border-transparent border-b-2 pb-[calc(2px+1px)]'}`}
            >
              Dados principais
            </button>
            <button
              type="button"
              onClick={() => { setFormTab('produto-valores') }}
              aria-pressed={formTab === 'produto-valores'}
              className={`px-4 py-2.5 text-sm font-medium rounded-lg transition ${formTab === 'produto-valores'
                ? 'bg-blue text-white border-blue'
                : 'text-slate-600 hover:bg-slate-50 border-transparent border-b-2 pb-[calc(2px+1px)]'}`}
            >
              Produto e valores
            </button>
            <button
              type="button"
              onClick={() => { setFormTab('datas') }}
              aria-pressed={formTab === 'datas'}
              className={`px-4 py-2.5 text-sm font-medium rounded-lg transition ${formTab === 'datas'
                ? 'bg-blue text-white border-blue'
                : 'text-slate-600 hover:bg-slate-50 border-transparent border-b-2 pb-[calc(2px+1px)]'}`}
            >
              Datas e prazo
            </button>
            <button
              type="button"
              onClick={() => { setFormTab('implantacao-contrato') }}
              aria-pressed={formTab === 'implantacao-contrato'}
              className={`px-4 py-2.5 text-sm font-medium rounded-lg transition ${formTab === 'implantacao-contrato'
                ? 'bg-blue text-white border-blue'
                : 'text-slate-600 hover:bg-slate-50 border-transparent border-b-2 pb-[calc(2px+1px)]'}`}
            >
              Implantação e contrato
            </button>
          </div>

          {/* ABA: Dados principais */}
          <section className={`card-base p-4 ${formTab !== 'principais' ? 'hidden' : ''}`} aria-labelledby="tab-principais-title">
            <h2 id="tab-principais-title" className="sr-only">Dados principais</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className={`${label} sm:col-span-2 lg:col-span-3`}>
                <label className="flex items-center gap-1.5 text-sm font-medium text-ink">
                  Cliente ou lead vinculado{required}
                  <select name="subject" required defaultValue={formCard ? formCard.subjectType + ':' + formCard.subjectId : ''} className={input} aria-label="Cliente ou lead vinculado">
                    <option value="">Selecione...</option>{subjects.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
                    {formCard && !subjects.some(item => item.value === formCard.subjectType + ':' + formCard.subjectId) && <option value={formCard.subjectType + ':' + (formCard.subjectType === 'person' ? formCard.personId : formCard.subjectId)}>{formCard.subjectLabel + (formCard.subjectType === 'person' ? ' · contato legado' : '')}</option>}
                  </select>
                </label>
                <p className="text-xs text-muted mt-1">Selecione o cliente, lead ou contato desta oportunidade.</p>
              </div>
              <label className={label}>
                Título da negociação{required}
                <input name="title" required minLength={2} maxLength={180} defaultValue={formCard?.title ?? ''} className={input} aria-label="Título da negociação" />
                <p className="text-xs text-muted mt-1">Nome curto que identifica esta negociação.</p>
              </label>
              <label className={label}>
                Vendedor responsável
                <select name="sellerId" defaultValue={formCard?.sellerId ?? ''} className={input} aria-label="Vendedor responsável">
                  <option value="">Sem responsável</option>{formCard?.sellerId && !sellers.some(item => item.id === formCard.sellerId) && <option value={formCard.sellerId}>{formCard.sellerName} (inativo — vínculo atual)</option>}{sellers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
                <p className="text-xs text-muted mt-1">Vendedor que acompanha esta oportunidade.</p>
              </label>
              <label className={label}>
                Etapa
                <select name="stageId" value={formStageId} onChange={event => setFormStageId(event.target.value)} className={input} aria-label="Etapa do funil">
                  {stages.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
                <p className="text-xs text-muted mt-1">Etapa atual do funil de vendas.</p>
              </label>
              <div className={`grid content-center gap-1 text-sm font-medium sm:col-span-2 lg:col-span-3`}>
                <span>Situação definida pela etapa</span>
                <span className="rounded-lg border border-slate-200 px-3 py-2.5 font-normal">{stages.find(item => item.id === formStageId)?.is_won ? 'Concluída (WON)' : 'Em andamento'}</span>
              </div>
              <label className={`${label} sm:col-span-2 lg:col-span-3`}>
                Observações{required}
                <textarea name="notes" rows={3} defaultValue={formCard?.notes ?? ''} className={input} aria-label="Observações da oportunidade" />
                <p className="text-xs text-muted mt-1">Observações gerais sobre esta negociação.</p>
              </label>
            </div>
          </section>

          {/* ABA: Produto e valores */}
          <section className={`card-base p-4 ${formTab !== 'produto-valores' ? 'hidden' : ''}`} aria-labelledby="tab-produto-valores-title">
            <h2 id="tab-produto-valores-title" className="sr-only">Produto e valores</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className={label}>
                Produto ou serviço
                <select name="productId" value={formProductId} onChange={event => suggestProductValues(event.currentTarget.value)} className={input} aria-label="Produto ou serviço">
                  <option value="">Não definido</option>{products.map(item => <option key={item.id} value={item.id}>{item.name}{item.kind === 'certificate' ? ' · Certificado digital' : ''}</option>)}
                </select>
                <p className="text-xs text-muted mt-1">Produto ou serviço principal negociado.</p>
              </label>
              <fieldset className={`${label} sm:col-span-2 lg:col-span-3`}>
                <legend className="px-1 text-sm font-semibold">Produtos e serviços adicionais</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{products.filter(item => item.id !== formProductId).map(item => <label key={item.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="additionalProductIds" value={item.id} checked={additionalProductIds.includes(item.id)} onChange={event => setAdditionalProductIds(current => event.target.checked ? [...current,item.id] : current.filter(id => id !== item.id))} />{item.name}</label>)}</div>
                {products.length < 2 && <p className="text-xs text-muted mt-2">Cadastre serviços no catálogo para selecioná-los aqui.</p>}
              </fieldset>
              <label className={label}>
                Valor de instalação
                <input name="installationValue" inputMode="decimal" value={negotiatedValues.installation} onChange={event => setNegotiatedValues(current => ({ ...current, installation: event.target.value }))} placeholder="0,00" className={input} aria-label="Valor de instalação" />
                <p className="text-xs text-muted mt-1">Valor único de instalação/implementação.</p>
              </label>
              <label className={label}>
                Valor da mensalidade
                <input name="monthlyValue" inputMode="decimal" value={negotiatedValues.monthly} onChange={event => setNegotiatedValues(current => ({ ...current, monthly: event.target.value }))} placeholder="0,00" className={input} aria-label="Valor da mensalidade" />
                <p className="text-xs text-muted mt-1">Valor recorrente mensal (se houver).</p>
              </label>
            </div>
          </section>

          {/* ABA: Datas e prazo */}
          <section className={`card-base p-4 ${formTab !== 'datas' ? 'hidden' : ''}`} aria-labelledby="tab-datas-title">
            <h2 id="tab-datas-title" className="sr-only">Datas e prazo</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className={label}>
                Data de abertura{required}
                <input name="openedAt" type="date" required defaultValue={formCard?.openedAt || today} className={input} aria-label="Data de abertura" />
                <p className="text-xs text-muted mt-1">Data em que a oportunidade foi aberta.</p>
              </label>
              <label className={label}>
                Previsão de fechamento
                <input name="expectedCloseDate" type="date" defaultValue={formCard?.expectedCloseDate ?? ''} className={input} aria-label="Previsão de fechamento" />
                <p className="text-xs text-muted mt-1">Data prevista para concluir a negociação.</p>
              </label>
              <label className={label}>
                Data de conversão
                <input name="convertedAt" type="date" defaultValue={formCard?.details?.convertedAt ?? ''} className={input} aria-label="Data de conversão" />
                <p className="text-xs text-muted mt-1">Data em que o lead foi convertido em oportunidade.</p>
              </label>
              <label className={label}>
                Dia de vencimento mensal
                <input name="monthlyDueDay" type="number" min="1" max="31" defaultValue={formCard?.details?.monthlyDueDay ?? ''} className={input} aria-label="Dia de vencimento mensal" />
                <p className="text-xs text-muted mt-1">Dia do mês para vencimento da mensalidade (1 a 31).</p>
              </label>
            </div>
          </section>

          {/* ABA: Implantação e contrato */}
          <section className={`card-base p-4 ${formTab !== 'implantacao-contrato' ? 'hidden' : ''}`} aria-labelledby="tab-implantacao-contrato-title">
            <h2 id="tab-implantacao-contrato-title" className="sr-only">Implantação e contrato</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <label className={label}>
                Responsável pela implantação
                <input name="implementationOwner" defaultValue={formCard?.details?.implementationOwner ?? ''} className={input} aria-label="Responsável pela implantação" />
                <p className="text-xs text-muted mt-1">Pessoa ou equipe responsável pela implantação.</p>
              </label>
              <label className={label}>
                Data de instalação
                <input name="installationDate" type="date" defaultValue={formCard?.details?.installationDate ?? ''} className={input} aria-label="Data de instalação" />
                <p className="text-xs text-muted mt-1">Data prevista ou realizada da instalação.</p>
              </label>
              <label className={label}>
                Data de treinamento
                <input name="trainingDate" type="date" defaultValue={formCard?.details?.trainingDate ?? ''} className={input} aria-label="Data de treinamento" />
                <p className="text-xs text-muted mt-1">Data prevista ou realizada do treinamento.</p>
              </label>
              <label className={label}>
                Limitador de notas
                <input name="invoiceLimit" type="number" min="0" step="1" defaultValue={formCard?.details?.invoiceLimit ?? ''} className={input} aria-label="Limitador de notas" />
                <p className="text-xs text-muted mt-1">Limite de notas fiscais (se aplicável).</p>
              </label>
              <label className={label}>
                Versão do sistema
                <input name="systemVersion" defaultValue={formCard?.details?.systemVersion ?? ''} className={input} aria-label="Versão do sistema" />
                <p className="text-xs text-muted mt-1">Versão do sistema instalado.</p>
              </label>
              <label className={label}>
                Versão NFC-e
                <input name="nfceVersion" defaultValue={formCard?.details?.nfceVersion ?? ''} className={input} aria-label="Versão NFC-e" />
                <p className="text-xs text-muted mt-1">Versão do módulo NFC-e.</p>
              </label>
              <label className={label}>
                Versão MDF-e
                <input name="mdfeVersion" defaultValue={formCard?.details?.mdfeVersion ?? ''} className={input} aria-label="Versão MDF-e" />
                <p className="text-xs text-muted mt-1">Versão do módulo MDF-e.</p>
              </label>
              <label className={label}>
                Situação do contrato
                <select name="contractStatus" defaultValue={formCard?.details?.contractStatus ?? 'pending'} className={input} aria-label="Situação do contrato">
                  <option value="pending">Pendente</option><option value="sent">Enviado</option><option value="signed">Assinado</option><option value="cancelled">Cancelado</option>
                </select>
                <p className="text-xs text-muted mt-1">Situação comercial do contrato.</p>
              </label>
              <label className={label}>
                Envio de boleto
                <input name="boletoDeliveryMethod" placeholder="E-mail, WhatsApp..." defaultValue={formCard?.details?.boletoDeliveryMethod ?? ''} className={input} aria-label="Envio de boleto" />
                <p className="text-xs text-muted mt-1">Método de envio do boleto (ex.: E-mail, WhatsApp).</p>
              </label>
              <label className={label}>
                Situação comercial da taxa
                <select name="installationFeeStatus" defaultValue={formCard?.details?.installationFeeStatus ?? 'pending'} className={input} aria-label="Situação da taxa de instalação">
                  <option value="pending">Pendente</option><option value="reported_paid">Informada como paga</option><option value="waived">Isenta</option><option value="cancelled">Cancelada</option>
                </select>
                <p className="text-xs text-muted mt-1">Situação da taxa de instalação.</p>
              </label>
              <label className={label}>
                Forma de pagamento da taxa
                <input name="installationFeePaymentMethod" defaultValue={formCard?.details?.installationFeePaymentMethod ?? ''} className={input} aria-label="Forma de pagamento da taxa" />
                <p className="text-xs text-muted mt-1">Forma de pagamento da taxa de instalação.</p>
              </label>
              <label className={label}>
                Data informada de pagamento
                <input name="installationFeePaidAt" type="date" defaultValue={formCard?.details?.installationFeePaidAt ?? ''} className={input} aria-label="Data informada de pagamento" />
                <p className="text-xs text-muted mt-1">Data informada como pagamento da taxa.</p>
              </label>
              <label className={`${label} sm:col-span-2 lg:col-span-3`}>
                Treinamentos necessários
                <textarea name="trainingsNeeded" rows={2} defaultValue={formCard?.details?.trainingsNeeded ?? ''} className={input} aria-label="Treinamentos necessários" />
                <p className="text-xs text-muted mt-1">Treinamentos que ainda são necessários.</p>
              </label>
              <label className={`${label} sm:col-span-2 lg:col-span-3`}>
                Observações técnicas
                <textarea name="technicalNotes" rows={3} defaultValue={formCard?.details?.technicalNotes ?? ''} className={input} aria-label="Observações técnicas" />
                <p className="text-xs text-muted mt-1">Observações técnicas da implantação.</p>
              </label>
              <p className="text-xs text-amber-800 sm:col-span-2 lg:col-span-3">Os status de contrato e taxa são informações comerciais manuais; não confirmam recebimentos financeiros.</p>
            </div>
          </section>

          {!profileReady && <p role="alert" className="msg-base msg-warning">A migration da ficha comercial ainda não foi aplicada. Gravações ficam bloqueadas.</p>}

          <div className="flex flex-wrap gap-3 justify-end">
            <button type="button" onClick={() => setFormCard(undefined)} className="btn-base btn-secondary btn-md">Cancelar</button>
            <button disabled={pending || !profileReady} className="btn-base btn-primary btn-md">Salvar oportunidade</button>
          </div>
        </form>
      </section>
    </div>}

    {selectedCard && <div className="fixed inset-0 z-40 bg-slate-950/45" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setSelectedCard(null) }}>
      <section role="dialog" aria-modal="true" aria-labelledby="commercial-profile-title" className="commercial-profile-panel absolute inset-y-0 right-0 flex w-full max-w-[1500px] flex-col bg-surface text-ink shadow-2xl">
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-700"><div><p className="text-xs font-bold uppercase tracking-wide text-blue">Ficha comercial · {selectedCard.type === 'lead' ? 'Lead' : selectedCard.status === 'won' ? 'Concluído (WON)' : 'Oportunidade'}</p><h2 id="commercial-profile-title" className="text-xl font-bold">{selectedCard.subjectLabel}</h2></div><div className="flex gap-2">{selectedCard.type === 'opportunity' && <button type="button" disabled={!profileReady} onClick={() => { openEdit(selectedCard); setSelectedCard(null) }} className="rounded-lg bg-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Editar ficha</button>}<button type="button" onClick={() => setSelectedCard(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Fechar</button></div></header>
        {!profileReady && selectedCard.type === 'opportunity' && <p role="alert" className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900">A migration 202610310005 ainda não foi aplicada. A ficha está em modo de leitura e nenhuma gravação detalhada é permitida.</p>}
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,.95fr)]">
          <div className="min-h-0 overflow-y-auto border-b border-slate-200 p-5 lg:border-b-0 lg:border-r dark:border-slate-700">
            <details open className="mb-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700"><summary className="cursor-pointer font-semibold">Dados cadastrais</summary><div className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><Info label="Razão social / nome" value={selectedCard.details?.name} /><Info label="Nome fantasia" value={selectedCard.details?.trade_name} /><Info label="CPF/CNPJ" value={selectedCard.details?.tax_id} /><Info label="IE" value={selectedCard.details?.state_registration} /><Info label="Inscrição municipal" value={selectedCard.details?.municipal_registration} /><Info label="Contato" value={selectedCard.details?.name} /><Info label="Telefone" value={selectedCard.details?.phone} /><Info label="WhatsApp" value={selectedCard.details?.whatsapp} /><Info label="E-mail" value={selectedCard.details?.email} /><Info label="Endereço" value={[selectedCard.details?.address_line,selectedCard.details?.address_number,selectedCard.details?.address_extra,selectedCard.details?.district,selectedCard.details?.city,selectedCard.details?.state,selectedCard.details?.postal_code].filter(Boolean).join(', ')} /><Info label="Ramo de atividade" value={selectedCard.details?.business_activity} /><Info label="Regime tributário" value={selectedCard.details?.tax_regime} />{selectedCard.details?.customerId && <a className="font-semibold text-blue hover:underline" href={'/clientes/' + selectedCard.details.customerId}>Abrir ficha 360° do cliente</a>}</div></details>
            <details open className="mb-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700"><summary className="cursor-pointer font-semibold">Negociação</summary><div className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><Info label="Título" value={selectedCard.title} /><Info label="Vendedor" value={selectedCard.sellerName} /><Info label="Produto principal" value={selectedCard.productName} /><Info label="Produtos/serviços adicionais" value={(selectedCard.additionalProductIds ?? []).map(id => products.find(p => p.id === id)?.name).filter(Boolean).join(', ')} /><Info label="Instalação" value={money(selectedCard.installationValue)} /><Info label="Mensalidade" value={money(selectedCard.monthlyValue)} /><Info label="Abertura" value={selectedCard.openedAt} /><Info label="Conversão" value={selectedCard.details?.convertedAt} /><Info label="Previsão de fechamento" value={selectedCard.expectedCloseDate} /><Info label="Vencimento mensal" value={selectedCard.details?.monthlyDueDay ? 'Dia ' + selectedCard.details.monthlyDueDay : ''} /><Info label="Etapa atual" value={stages.find(stage => stage.id === selectedCard.stageId)?.name} /><Info label="Situação do contrato" value={({pending:'Pendente',sent:'Enviado',signed:'Assinado',cancelled:'Cancelado'} as Record<string,string>)[selectedCard.details?.contractStatus] ?? 'Pendente'} /><Info label="Taxa de instalação (status comercial)" value={({pending:'Pendente',reported_paid:'Informada como paga',waived:'Isenta',cancelled:'Cancelada'} as Record<string,string>)[selectedCard.details?.installationFeeStatus] ?? 'Pendente'} /><Info label="Forma de envio do boleto" value={selectedCard.details?.boletoDeliveryMethod} /><Info label="Pagamento da taxa" value={[selectedCard.details?.installationFeePaymentMethod,selectedCard.details?.installationFeePaidAt].filter(Boolean).join(' · ')} /><Info label="Observações" value={selectedCard.notes} /></div><p className="mt-3 text-xs text-amber-800">Status comerciais manuais não confirmam recebimentos.</p></details>
            <details className="mb-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700"><summary className="cursor-pointer font-semibold">Contabilidade</summary>{selectedCard.details?.accountant ? <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><Info label="Escritório" value={selectedCard.details.accountant.trade_name || selectedCard.details.accountant.name} /><Info label="Contato responsável" value={selectedCard.details.accountant.contact_name} /><Info label="Telefone" value={selectedCard.details.accountant.phone || selectedCard.details.accountant.mobile_phone} /><Info label="E-mail" value={selectedCard.details.accountant.email} /><Info label="Endereço" value={[selectedCard.details.accountant.address_line,selectedCard.details.accountant.address_number,selectedCard.details.accountant.address_extra,selectedCard.details.accountant.district,selectedCard.details.accountant.city,selectedCard.details.accountant.state,selectedCard.details.accountant.postal_code].filter(Boolean).join(', ')} />{!accountantDetailsReady && <p className="text-amber-800 sm:col-span-2">Contato e endereço completos aguardam a migration de detalhes de contabilidade.</p>}</div> : <p className="mt-3 text-sm text-muted">Nenhuma contabilidade vinculada.</p>}</details>
            <details className="mb-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700"><summary className="cursor-pointer font-semibold">Implantação e configurações</summary><div className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><Info label="Responsável" value={selectedCard.details?.implementationOwner} /><Info label="Instalação" value={selectedCard.details?.installationDate} /><Info label="Treinamento" value={selectedCard.details?.trainingDate} /><Info label="Treinamentos necessários" value={selectedCard.details?.trainingsNeeded} /><Info label="Limitador de notas" value={selectedCard.details?.invoiceLimit} /><Info label="Versão do sistema" value={selectedCard.details?.systemVersion} /><Info label="Versão NFC-e" value={selectedCard.details?.nfceVersion} /><Info label="Versão MDF-e" value={selectedCard.details?.mdfeVersion} /><Info label="Observações técnicas" value={selectedCard.details?.technicalNotes} /></div></details>
          </div>
          <div className="flex min-h-0 flex-col p-5"><h3 className="mb-3 shrink-0 text-base font-bold">Comentários e atividades</h3><div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-slate-200 p-3 dark:border-slate-700">{selectedCard.type === 'lead' ? <p className="text-sm text-muted">Avance o lead para 1º contato para registrar atividades vinculadas à oportunidade.</p> : <ol className="grid gap-3">{[...(selectedCard.history ?? []).map(item => { const oldStage = (item.old_value as {stage_name?:string}|null)?.stage_name; const newStage = (item.new_value as {stage_name?:string}|null)?.stage_name; return {id:'event:'+item.id,at:item.created_at,type:'event',title:item.event_type==='stage_changed'?'Mudança de etapa':item.event_type==='closed'?'Encerramento':item.event_type==='created'?'Oportunidade criada':item.event_type==='products_updated'?'Produtos/serviços atualizados':'Alteração comercial',detail:[oldStage || '',oldStage || newStage ? `${oldStage || 'Origem'} → ${newStage || 'Destino'}` : '',item.note || ''].filter(Boolean).join(' · '),actor:item.actor_id} }),...(selectedCard.activities ?? []).map(item => ({id:'activity:'+item.id,at:item.created_at,type:item.kind,title:item.title,detail:item.details || '',actor:item.created_by}))].sort((a,b)=>b.at.localeCompare(a.at)).map(item => <li key={item.id} className="border-b border-slate-100 pb-3 text-sm last:border-0"><p className="font-semibold">{item.title}</p><p className="text-xs text-muted">{new Date(item.at).toLocaleString('pt-BR')}{item.actor ? ' · usuário ' + item.actor.slice(0,8) : ''}</p>{item.detail && <p className="mt-1 whitespace-pre-wrap">{item.detail}</p>}</li>)}</ol>}</div>{selectedCard.type === 'opportunity' && <form onSubmit={submitActivity} className="mt-3 grid shrink-0 gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700"><div className="grid gap-2 sm:grid-cols-[150px_1fr]"><select name="kind" className="rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="note">Comentário</option><option value="call">Ligação</option><option value="message">WhatsApp / mensagem</option><option value="meeting">Reunião</option><option value="task">Tarefa</option></select><input name="title" required minLength={2} maxLength={180} placeholder="Título" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" /></div><textarea name="details" rows={3} maxLength={5000} placeholder="Detalhes" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" /><button disabled={pending} className="justify-self-end rounded-lg bg-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Registrar</button></form>}</div>
        </div>
      </section>
    </div>}

    {closeCardId && <div className="fixed inset-0 z-30 grid place-items-center bg-slate-950/40 p-4">
      <section role="dialog" aria-modal="true" aria-labelledby="close-title" className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
        <h2 id="close-title" className="text-lg font-bold">Encerrar oportunidade</h2>
        {message && <p role="status" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{message}</p>}
        <form onSubmit={submitClosure} className="mt-4 grid gap-4">
          <label className="grid gap-1 text-sm font-medium">Resultado<select value={closeType} onChange={event => setCloseType(event.target.value as 'lost' | 'rejected')} className="rounded-lg border border-slate-200 px-3 py-2.5"><option value="lost">Perdida</option><option value="rejected">Reprovada</option></select></label>
          <label className="grid gap-1 text-sm font-medium">Motivo obrigatório<textarea name="reason" required minLength={3} maxLength={1000} rows={4} className="rounded-lg border border-slate-200 px-3 py-2.5" /></label>
          <div className="flex gap-3"><button disabled={pending} className="rounded-lg bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Confirmar encerramento</button><button type="button" onClick={() => setCloseCardId('')} className="rounded-lg border px-4 py-2.5 text-sm">Cancelar</button></div>
        </form>
      </section>
    </div>}
  </div>
}

