'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createProposalShareLink, reviewProposalAcceptance, updateProposalStatus } from '@/app/propostas/actions'
import { ProposalEditor, type ProposalCustomer, type ProposalOpportunity, type ProposalProduct, type ProposalDraft } from '@/components/proposal-editor'

export type ProposalDetailData = {
  proposal: { id: string; proposalNumber: string; status: string; validUntil: string | null; currentVersion: number | null; customerId: string; opportunityId: string | null }
  customer: ProposalCustomer
  current: ProposalDraft & { versionId: string; version: number; currency: string; subtotal: number; total: number; monthlyTotal: number; createdAt: string; sentAt: string | null }
  versions: { version: number; title: string; total: number; monthlyTotal: number; createdAt: string; sentAt: string | null }[]
  acceptances: { id: string; version: number; status: string; declaredName: string | null; declaredEmail: string | null; declaredAt: string; reviewedAt: string | null }[]
  activeLinkExpiry: string | null
  opportunities: ProposalOpportunity[]
  products: ProposalProduct[]
  pricingReady: boolean
  templateReady: boolean
}

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const statusLabels: Record<string, string> = { draft: 'Rascunho', sent: 'Enviada', accepted: 'Aceita', rejected: 'Recusada', expired: 'Expirada', cancelled: 'Cancelada', pending_internal_confirmation: 'Aguardando confirmação interna', confirmed: 'Confirmado', rejected_internal: 'Recusado internamente' }
const statusColors: Record<string, string> = { draft: 'bg-slate-50 text-slate-600', sent: 'bg-blue-50 text-blue-800', accepted: 'bg-emerald-50 text-emerald-800', rejected: 'bg-rose-50 text-rose-800', expired: 'bg-amber-50 text-amber-800', cancelled: 'bg-slate-100 text-slate-500', pending_internal_confirmation: 'bg-blue-50 text-blue-800', confirmed: 'bg-emerald-50 text-emerald-800', rejected_internal: 'bg-rose-50 text-rose-800' }

export function ProposalDetail({ data }: { data: ProposalDetailData }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState('')
  const [messageOk, setMessageOk] = useState<boolean | null>(null)
  const [sharePath, setSharePath] = useState('')
  const [showVersionForm, setShowVersionForm] = useState(false)
  const proposal = data.proposal
  const current = data.current
  const editable = ['draft', 'sent', 'rejected', 'expired'].includes(proposal.status)

  function run(task: () => Promise<{ ok: boolean; message: string; urlPath?: string }>) {
    setMessage(''); setMessageOk(null)
    startTransition(async () => { const result = await task(); setMessage(result.message); setMessageOk(result.ok); if (result.urlPath) setSharePath(`${window.location.origin}${result.urlPath}`); if (result.ok) router.refresh() })
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(sharePath); setMessage('Link copiado.'); setMessageOk(true) }
    catch { setMessage('Não foi possível copiar automaticamente. Selecione e copie o link exibido.'); setMessageOk(false) }
  }

  return <div className="space-y-5">
    <section className="card-base p-5">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><Link href="/propostas" className="text-sm font-semibold text-blue hover:underline">← Voltar para propostas</Link><p className="mt-4 text-xs font-semibold uppercase tracking-wide text-blue">{proposal.proposalNumber} · Versão {current.version}</p><h1 className="mt-1 text-lg font-bold">{current.title}</h1><p className="mt-1 text-sm text-muted">{data.customer.name} · <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColors[proposal.status] ?? statusColors.draft}`}>{statusLabels[proposal.status] ?? proposal.status}</span></p></div><div className="flex flex-wrap gap-2"><Link href={`/propostas/${proposal.id}/imprimir`} target="_blank" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">Visualizar / PDF</Link>{editable && <button disabled={pending} onClick={() => setShowVersionForm(value => !value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">{showVersionForm ? 'Fechar nova versão' : 'Nova versão'}</button>}{proposal.status === 'draft' && <button disabled={pending} onClick={() => run(() => updateProposalStatus(proposal.id, 'sent'))} className="rounded-lg bg-blue px-3 py-2 text-sm font-semibold text-white">Marcar como enviada</button>}{proposal.status === 'sent' && <button disabled={pending} onClick={() => run(() => createProposalShareLink(proposal.id))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">Gerar link</button>}</div></div>
      {message && <p role={messageOk ? 'status' : 'alert'} className={`msg-base mt-4 ${messageOk ? 'msg-success' : 'msg-danger'}`}>{message}</p>}
      {sharePath && <div className="mt-3 flex flex-wrap gap-2"><input readOnly value={sharePath} aria-label="Link público da proposta" className="min-w-[260px] flex-1 rounded-lg border border-slate-300 bg-surface px-3 py-2 text-sm"/><button onClick={copyLink} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">Copiar link</button></div>}
      {data.activeLinkExpiry && <p className="mt-2 text-xs text-muted">Há um link ativo até {new Date(data.activeLinkExpiry).toLocaleString('pt-BR')}.</p>}
    </section>
    {showVersionForm && editable && <ProposalEditor key={`version-${current.version}`} customers={[data.customer]} opportunities={data.opportunities} products={data.products} proposalId={proposal.id} pricingReady={data.pricingReady} templateReady={data.templateReady} initial={{ customerId: proposal.customerId, opportunityId: proposal.opportunityId ?? '', title: current.title, validUntil: proposal.validUntil ?? '', terms: current.terms, discount: current.discount, items: current.items, brandName: current.brandName, brandTagline: current.brandTagline, logoUrl: current.logoUrl, introText: current.introText, firstBillingDate: current.firstBillingDate, consultantName: current.consultantName, consultantPhone: current.consultantPhone, consultantEmail: current.consultantEmail, consultantCity: current.consultantCity }} />}
    <section className="card-base p-4">
      <div className="grid gap-3 md:grid-cols-5">
        <Price label="Instalação + taxas" value={money(current.subtotal)} />
        <Price label="Desconto implantação" value={money(Number(current.discount))} />
        <Price label="Total de implantação" value={money(current.total)} />
        <Price label="Mensalidade recorrente" value={`${money(current.monthlyTotal)} / mês`} />
        <Price label="Validade" value={proposal.validUntil ? new Date(`${proposal.validUntil}T00:00:00`).toLocaleDateString('pt-BR') : 'Não definida'} />
      </div>
    </section>
    <section className="card-base p-5">
      <div className="border-b border-slate-100 pb-4"><h2 className="font-bold">Itens da versão atual</h2></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-600"><tr>{['Descrição','Qtd.','Instalação unitária','Taxa extra','Mensalidade unitária','Implantação do item','Mensalidade do item'].map(title => <th key={title} className="px-5 py-3">{title}</th>)}</tr></thead><tbody>{current.items.map((item,index)=><tr key={index} className="border-t border-slate-100"><td className="px-5 py-3">{item.description}</td><td className="px-5 py-3">{Number(item.quantity).toLocaleString('pt-BR')}</td><td className="px-5 py-3">{money(Number(item.installationPrice))}</td><td className="px-5 py-3">{item.extraDescription ? <>{item.extraDescription}<span className="block">{money(Number(item.extraPrice))}</span></> : money(Number(item.extraPrice))}</td><td className="px-5 py-3">{money(Number(item.monthlyPrice))}</td><td className="px-5 py-3">{money(Number(item.quantity)*(Number(item.installationPrice)+Number(item.extraPrice)))}</td><td className="px-5 py-3">{money(Number(item.quantity)*Number(item.monthlyPrice))}</td></tr>)}</tbody></table></div>{current.terms && <div className="border-t border-slate-100 p-4"><h3 className="font-semibold">Condições comerciais</h3><p className="mt-2 whitespace-pre-wrap text-sm">{current.terms}</p></div>}</section>
    <section className="grid gap-5 xl:grid-cols-2">
      <Panel title="Histórico de versões">{data.versions.length ? data.versions.map(version=><div key={version.version} className="flex items-center justify-between gap-3 border-t border-slate-100 py-3"><div><p className="font-semibold">Versão {version.version} · {version.title}</p><p className="text-xs text-muted">{new Date(version.createdAt).toLocaleString('pt-BR')}{version.sentAt ? ` · enviada ${new Date(version.sentAt).toLocaleString('pt-BR')}` : ''}</p></div><span className="text-right text-sm font-semibold">{money(version.total)}<span className="block text-xs font-normal text-muted">+ {money(version.monthlyTotal)}/mês</span></span></div>) : <p className="pt-3 text-sm text-muted">Nenhuma versão encontrada.</p>}</Panel>
      <Panel title="Aceites e confirmação interna">{data.acceptances.length ? data.acceptances.map(item=><div key={item.id} className="border-t border-slate-100 py-3"><p className="font-semibold">{statusLabels[item.status] ?? item.status} · versão {item.version}</p><p className="mt-1 text-sm">{item.declaredName || 'Nome não informado'}{item.declaredEmail ? ` · ${item.declaredEmail}` : ''}</p><p className="text-xs text-muted">{new Date(item.declaredAt).toLocaleString('pt-BR')}</p>{item.status === 'pending_internal_confirmation' && <div className="mt-3 flex gap-2"><button disabled={pending} onClick={() => run(() => reviewProposalAcceptance(item.id, 'confirmed'))} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white">Confirmar aceite</button><button disabled={pending} onClick={() => run(() => reviewProposalAcceptance(item.id, 'rejected'))} className="rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-700">Recusar</button></div>}</div>) : <p className="pt-3 text-sm text-muted">Nenhuma manifestação de aceite recebida.</p>}</Panel>
    </section>
    {editable && <div className="flex justify-end"><button disabled={pending} onClick={() => { if (window.confirm(`Cancelar a proposta ${proposal.proposalNumber}?`)) run(() => updateProposalStatus(proposal.id, 'cancelled')) }} className="rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-700">Cancelar proposta</button></div>}
  </div>
}

function Price({label,value}:{label:string;value:string}) { return <article className="rounded-xl border border-slate-200 bg-surface p-4"><p className="text-sm text-muted">{label}</p><p className="mt-1 font-bold">{value}</p></article> }
function Panel({title,children}:{title:string;children:React.ReactNode}) { return <section className="rounded-xl border border-slate-200 bg-surface p-5"><h2 className="mb-2 font-bold">{title}</h2>{children}</section> }