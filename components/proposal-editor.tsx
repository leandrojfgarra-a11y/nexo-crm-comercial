'use client'

import { useEffect, useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createProposal, createProposalVersion } from '@/app/propostas/actions'
import { createClient } from '@/lib/supabase/client'

export type ProposalCustomer = { id: string; personId: string; name: string; email: string; phone: string }
export type ProposalOpportunity = { id: string; personId: string; title: string; customerName: string; status?: string }
export type ProposalProduct = { id: string; name: string; kind: string; description: string; referencePrice: number; installationPrice: number; monthlyPrice: number; active?: boolean }
export type ProposalDraftItem = { productId: string; description: string; quantity: string; installationPrice: string; extraDescription: string; extraPrice: string; monthlyPrice: string; optional?: boolean }
export type ProposalDraft = { customerId: string; opportunityId: string; title: string; validUntil: string; terms: string; discount: string; items: ProposalDraftItem[]; brandName: string; brandTagline: string; logoUrl: string; introText: string; firstBillingDate: string; consultantName: string; consultantPhone: string; consultantEmail: string; consultantCity: string }

const input = 'w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-blue focus:ring-2 focus:ring-blue/15'
const label = 'flex flex-col gap-1 text-sm font-medium text-ink'
const section = 'card-base p-5'
const required = <span className="text-blue ml-0.5" aria-hidden="true">*</span>
const emptyItem = (): ProposalDraftItem => ({ productId: '', description: '', quantity: '1', installationPrice: '0', extraDescription: '', extraPrice: '0', monthlyPrice: '0', optional: false })
const numeric = (value: string) => { const parsed = Number(value.trim().replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.')); return Number.isFinite(parsed) && parsed > 0 ? parsed : 0 }

export function ProposalEditor({ customers, opportunities, products, proposalId, initial, pricingReady = true, templateReady = false }: {
  customers: ProposalCustomer[]; opportunities: ProposalOpportunity[]; products: ProposalProduct[]; proposalId?: string; initial?: ProposalDraft; pricingReady?: boolean; templateReady?: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [customerId, setCustomerId] = useState(initial?.customerId ?? '')
  const [selectedCustomer, setSelectedCustomer] = useState(initial?.customerId ?? '')
  const [opportunityId, setOpportunityId] = useState(initial?.opportunityId ?? '')
  const [items, setItems] = useState<ProposalDraftItem[]>(initial?.items ?? [emptyItem()])
  const [discount, setDiscount] = useState(initial?.discount ?? '0')
  const [message, setMessage] = useState('')
  const [ok, setOk] = useState<boolean | null>(null)
  const [brandName, setBrandName] = useState(initial?.brandName ?? 'GARRA AUTOMAÇÃO')
  const [brandTagline, setBrandTagline] = useState(initial?.brandTagline ?? 'Gestão Empresarial & Fiscal Inteligente')
  const [logoUrl, setLogoUrl] = useState(initial?.logoUrl ?? '')
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState('')
  const [introText, setIntroText] = useState(initial?.introText ?? 'É com satisfação que apresentamos esta proposta comercial personalizada, preparada para atender às necessidades da sua empresa.')
  const [firstBillingDate, setFirstBillingDate] = useState(initial?.firstBillingDate ?? '')
  const [consultantName, setConsultantName] = useState(initial?.consultantName ?? '')
  const [consultantPhone, setConsultantPhone] = useState(initial?.consultantPhone ?? '')
  const [consultantEmail, setConsultantEmail] = useState(initial?.consultantEmail ?? '')
  const [consultantCity, setConsultantCity] = useState(initial?.consultantCity ?? '')
  const [cloudBackupEnabled, setCloudBackupEnabled] = useState(Boolean(initial?.items.some(item => item.optional)))

  useEffect(() => {
    if (!logoFile) { setLogoPreview(''); return }
    const preview = URL.createObjectURL(logoFile)
    setLogoPreview(preview)
    return () => URL.revokeObjectURL(preview)
  }, [logoFile])

  const visibleOpportunities = opportunities.filter(item => item.personId === (customers.find(customer => customer.id === (selectedCustomer || customerId))?.personId ?? ''))
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    let uploadedPath = ''
    let finalLogoUrl = logoUrl
    const basePayload = {
      customerId: String(data.get('customerId') ?? ''), opportunityId: String(data.get('opportunityId') ?? ''),
      title: String(data.get('title') ?? ''), validUntil: String(data.get('validUntil') ?? ''), terms: String(data.get('terms') ?? ''),
      discount: String(data.get('discount') ?? '0'), items, brandName, brandTagline, introText, firstBillingDate,
      consultantName, consultantPhone, consultantEmail, consultantCity,
    }
    setMessage(''); setOk(null)
    startTransition(async () => {
      try {
        if (!templateReady) throw new Error('Aplique manualmente a migration 202611050002_proposal_branding_and_backup.sql antes de salvar este modelo.')
        if (logoFile) {
          const extension = logoFile.type === 'image/jpeg' ? 'jpg' : logoFile.type === 'image/png' ? 'png' : 'webp'
          const supabase = createClient()
          const { data: { user } } = await supabase.auth.getUser()
          let companyId = ''
          if (user) {
            const { data: membership, error: membershipError } = await supabase.from('crm_company_members').select('company_id').eq('user_id', user.id).maybeSingle()
            const missingTenantSchema = membershipError?.code === 'PGRST205' || membershipError?.code === '42P01'
            if (membershipError && !missingTenantSchema) throw new Error('Não foi possível confirmar a empresa deste acesso antes de carregar a logo.')
            if (!membershipError && !membership?.company_id) throw new Error('Este login ainda não está vinculado a uma empresa ativa.')
            companyId = membership?.company_id ?? ''
          }
          uploadedPath = companyId ? `logos/${companyId}/${crypto.randomUUID()}.${extension}` : `logos/${crypto.randomUUID()}.${extension}`
          const { error: uploadError } = await supabase.storage.from('nexo-proposal-assets').upload(uploadedPath, logoFile, { contentType: logoFile.type, cacheControl: '31536000', upsert: false })
          if (uploadError) throw new Error('Não foi possível carregar a logo. Confirme se a migration do modelo de propostas foi aplicada e tente novamente.')
          finalLogoUrl = supabase.storage.from('nexo-proposal-assets').getPublicUrl(uploadedPath).data.publicUrl
        }
        const payload = { ...basePayload, logoUrl: finalLogoUrl }
        const result = proposalId ? await createProposalVersion(proposalId, payload) : await createProposal(payload)
        if (!result.ok && uploadedPath) await createClient().storage.from('nexo-proposal-assets').remove([uploadedPath])
        setMessage(result.message); setOk(result.ok)
        if (result.ok && result.proposalId) router.push(`/propostas/${result.proposalId}`)
        if (result.ok) router.refresh()
      } catch (cause) {
        if (uploadedPath) await createClient().storage.from('nexo-proposal-assets').remove([uploadedPath]).catch(() => undefined)
        setMessage(cause instanceof Error ? cause.message : 'Não foi possível salvar a proposta.')
        setOk(false)
      }
    })
  }
  function chooseProduct(index: number, productId: string) {
    const product = products.find(item => item.id === productId)
    setItems(current => current.map((item, position) => position === index ? { ...item, productId, description: product?.name ?? '', installationPrice: product ? String(product.installationPrice) : item.installationPrice, monthlyPrice: product ? String(product.monthlyPrice) : item.monthlyPrice } : item))
  }
  function toggleCloudBackup(enabled: boolean) {
    setCloudBackupEnabled(enabled)
    setItems(current => {
      const regularItems = current.filter(item => !item.optional)
      const optionalItems = enabled ? current.filter(item => item.optional) : []
      return enabled
        ? [...regularItems, ...(optionalItems.length ? optionalItems : [{ ...emptyItem(), description: 'Backup em nuvem', optional: true }])]
        : regularItems.length ? regularItems : [emptyItem()]
    })
  }
  const totals = items.reduce((sum, item) => {
    const quantity = Math.max(0, Number(item.quantity.replace(',', '.')) || 0)
    sum.installation += quantity * numeric(item.installationPrice)
    sum.extra += quantity * numeric(item.extraPrice)
    sum.monthly += quantity * numeric(item.monthlyPrice)
    return sum
  }, { installation: 0, extra: 0, monthly: 0 })
  const oneTimeSubtotal = totals.installation + totals.extra
  const oneTimeTotal = Math.max(0, oneTimeSubtotal - numeric(discount))
  const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  return (
    <section id="cadastro" className="mt-5 card-base p-5">
      <div className="mb-4"><h2 className="text-lg font-bold">{proposalId ? 'Criar nova versão' : 'Nova proposta'}</h2><p className="mt-1 text-sm text-muted">Os valores e descrições ficam congelados em cada versão. Alterações no catálogo não modificam propostas já criadas.</p></div>
      {!pricingReady && <p role="alert" className="msg-base mt-4 msg-warning">Aplique a migration 202611020002_proposal_recurring_prices.sql para habilitar a gravação dos preços separados.</p>}
      {!templateReady && <p role="alert" className="msg-base mt-4 msg-warning">O modelo com logotipo, dados comerciais e backup opcional depende da migration 202611050002_proposal_branding_and_backup.sql. O SQL está preparado para aplicação manual.</p>}
      {message && <p role={ok ? 'status' : 'alert'} className={`msg-base mt-4 ${ok ? 'msg-success' : 'msg-danger'}`}>{message}</p>}
      <form onSubmit={submit} className="space-y-5">
        {/* Apresentação da proposta */}
        <fieldset className="grid gap-4 rounded-xl border border-slate-200 p-4 sm:grid-cols-2 xl:grid-cols-3">
          <legend className="px-1 text-sm font-bold">Apresentação da proposta</legend>
          <label className={label}>
            Empresa / marca<span className="text-blue ml-0.5" aria-hidden="true">*</span>
            <input value={brandName} onChange={event => setBrandName(event.target.value)} required minLength={2} maxLength={120} placeholder="Nome da empresa" className={input} aria-label="Empresa / marca" />
          </label>
          <label className={`${label} sm:col-span-2 xl:col-span-3`}>
            Frase institucional<input value={brandTagline} onChange={event => setBrandTagline(event.target.value)} maxLength={180} placeholder="Ex.: Gestão Empresarial e Fiscal Inteligente" className={input} aria-label="Frase institucional" />
          </label>
          <label className={`${label} sm:col-span-2 xl:col-span-3`}>
            Logo da empresa (PNG, JPG ou WebP; até 1,5 MB)
            <input type="file" accept="image/png,image/jpeg,image/webp" disabled={!templateReady || pending} onChange={event => { const file = event.currentTarget.files?.[0] ?? null; if (file && (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 1_572_864)) { setMessage('Escolha uma imagem PNG, JPG ou WebP de até 1,5 MB.'); setOk(false); event.currentTarget.value = ''; return } setMessage(''); setOk(null); setLogoFile(file) }} className={`${input} file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-blue`} aria-label="Logo da empresa" />
            {(logoPreview || logoUrl) && <img src={logoPreview || logoUrl} alt="Prévia do logotipo da proposta" className="mt-2 max-h-20 max-w-64 object-contain object-left" />}
          </label>
          <label className={`${label} sm:col-span-2 xl:col-span-3`}>
            Apresentação<textarea value={introText} onChange={event => setIntroText(event.target.value)} rows={3} maxLength={1200} placeholder="Texto inicial da proposta" className={input} aria-label="Apresentação" />
          </label>
          <label className={label}>
            Primeira cobrança da mensalidade<input type="date" value={firstBillingDate} onChange={event => setFirstBillingDate(event.target.value)} className={input} aria-label="Primeira cobrança da mensalidade" />
          </label>
          <label className={label}>
            Consultor responsável<input value={consultantName} onChange={event => setConsultantName(event.target.value)} maxLength={120} className={input} aria-label="Consultor responsável" />
          </label>
          <label className={label}>
            Telefone do consultor<input value={consultantPhone} onChange={event => setConsultantPhone(event.target.value)} maxLength={60} className={input} aria-label="Telefone do consultor" />
          </label>
          <label className={label}>
            E-mail do consultor<input type="email" value={consultantEmail} onChange={event => setConsultantEmail(event.target.value)} maxLength={254} className={input} aria-label="E-mail do consultor" />
          </label>
          <label className={label}>
            Cidade / UF<input value={consultantCity} onChange={event => setConsultantCity(event.target.value)} maxLength={120} placeholder="Juiz de Fora, MG" className={input} aria-label="Cidade / UF" />
          </label>
        </fieldset>

        {/* Dados da proposta */}
        <fieldset className="grid gap-4 rounded-xl border border-slate-200 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <legend className="px-1 text-sm font-bold">Dados da proposta</legend>
          <label className={label}>
            Cliente <span className="text-blue ml-0.5" aria-hidden="true">*</span>
            <select name="customerId" required value={selectedCustomer || customerId} onChange={event => { setSelectedCustomer(event.target.value); setCustomerId(event.target.value); setOpportunityId('') }} className={input} aria-label="Cliente">
              <option value="">Selecione um cliente ativo</option>{customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select>
          </label>
          <label className={label}>
            Oportunidade vinculada
            <select name="opportunityId" value={opportunityId} onChange={event => setOpportunityId(event.target.value)} className={input} aria-label="Oportunidade vinculada">
              <option value="">Sem vínculo</option>{visibleOpportunities.map(item => <option key={item.id} value={item.id}>{item.title}{item.status && item.status !== 'open' ? ` · ${item.status}` : ''}</option>)}</select>
          </label>
          <label className={label}>
            Validade
            <input name="validUntil" type="date" defaultValue={initial?.validUntil ?? ''} className={input} aria-label="Validade" />
          </label>
          <label className={`${label} md:col-span-2 xl:col-span-3`}>
            Título da proposta <span className="text-blue ml-0.5" aria-hidden="true">*</span>
            <input name="title" required minLength={2} maxLength={180} defaultValue={initial?.title ?? ''} placeholder="Ex.: Implantação e serviços" className={input} aria-label="Título da proposta" />
          </label>
        </fieldset>

        {/* Produtos e serviços */}
        <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 ${cloudBackupEnabled ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-surface'}`}>
          <input type="checkbox" checked={cloudBackupEnabled} disabled={!templateReady} onChange={event => toggleCloudBackup(event.target.checked)} className="mt-0.5 accent-blue" />
          <span><strong className="block">Backup em nuvem (opcional)</strong><span className="mt-1 block text-sm text-muted">Quando marcado, entra como item mensal separado. O valor pode ser ajustado na linha criada abaixo.</span></span>
        </label>

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3"><h3 className="font-semibold">Itens e valores</h3><button type="button" onClick={() => setItems(current => [...current, emptyItem()])} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">Adicionar item</button></div>
          <div className="grid min-w-[1000px] grid-cols-[150px_minmax(180px,1fr)_85px_145px_minmax(190px,1fr)_140px_145px_65px] gap-3 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase text-slate-600"><span>Catálogo</span><span>Descrição</span><span>Qtd.</span><span>Instalação (R$)</span><span>Taxa extra / descrição</span><span>Valor extra (R$)</span><span>Mensalidade (R$)</span><span /></div>
          {items.map((item, index) => <div key={index} className="grid min-w-[1000px] grid-cols-[150px_minmax(180px,1fr)_85px_145px_minmax(190px,1fr)_140px_145px_65px] items-center gap-3 border-t border-slate-100 p-4">
            <select aria-label={`Produto do item ${index + 1}`} value={item.productId} onChange={event => chooseProduct(index, event.target.value)} className={input}><option value="">Personalizado</option>{products.map(product => <option key={product.id} value={product.id}>{product.name}{product.active === false ? ' (inativo, já utilizado)' : ''}</option>)}</select>
            <div><input aria-label={`Descrição do item ${index + 1}`} required minLength={2} maxLength={500} readOnly={item.optional} value={item.description} onChange={event => setItems(current => current.map((row, i) => i === index ? { ...row, description: event.target.value } : row))} placeholder="Descrição" className={`${input} ${item.optional ? 'bg-slate-100' : ''}`} />{item.optional && <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">Opcional</span>}</div>
            <input aria-label={`Quantidade do item ${index + 1}`} required type="number" min="0.001" step="0.001" readOnly={item.optional} value={item.quantity} onChange={event => setItems(current => current.map((row, i) => i === index ? { ...row, quantity: event.target.value } : row))} className={`${input} ${item.optional ? 'bg-slate-100' : ''}`} />
            <input aria-label={`Preço de instalação do item ${index + 1}`} required inputMode="decimal" readOnly={item.optional} value={item.installationPrice} onChange={event => setItems(current => current.map((row, i) => i === index ? { ...row, installationPrice: event.target.value } : row))} placeholder="0,00" className={`${input} ${item.optional ? 'bg-slate-100' : ''}`} />
            <input aria-label={`Descrição da taxa extra do item ${index + 1}`} maxLength={180} readOnly={item.optional} value={item.extraDescription} onChange={event => setItems(current => current.map((row, i) => i === index ? { ...row, extraDescription: event.target.value } : row))} placeholder="Ex.: conversão de banco" className={`${input} ${item.optional ? 'bg-slate-100' : ''}`} />
            <input aria-label={`Valor extra do item ${index + 1}`} required inputMode="decimal" readOnly={item.optional} value={item.extraPrice} onChange={event => setItems(current => current.map((row, i) => i === index ? { ...row, extraPrice: event.target.value } : row))} placeholder="0,00" className={`${input} ${item.optional ? 'bg-slate-100' : ''}`} />
            <input aria-label={`Mensalidade do item ${index + 1}`} required inputMode="decimal" value={item.monthlyPrice} onChange={event => setItems(current => current.map((row, i) => i === index ? { ...row, monthlyPrice: event.target.value } : row))} placeholder="0,00" className={input} />
            <button type="button" disabled={items.length <= 1 && !item.optional} onClick={() => { if (item.optional) setCloudBackupEnabled(false); setItems(current => { const remaining = current.filter((_, i) => i !== index); return remaining.length ? remaining : [emptyItem()] }) }} aria-label={`Remover item ${index + 1}`} className="rounded-lg px-2 py-2 text-sm font-semibold text-red-700 disabled:opacity-30">Remover</button>
          </div>)}
        </div>

        {/* Resumo de preços */}
        <section aria-label="Resumo de preços" className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 xl:grid-cols-4">
          <Price label="Instalação" value={money(totals.installation)} />
          <Price label="Taxas extras" value={money(totals.extra)} />
          <Price label="Total de implantação" value={money(oneTimeTotal)} className="font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md" />
          <Price label="Mensalidade recorrente" value={`${money(totals.monthly)} / mês`} className="font-bold text-cyan-600 bg-cyan-50 px-2 py-1 rounded-md" />
        </section>

        {/* Condições comerciais */}
        <div className="grid gap-4 md:grid-cols-2">
          <label className={label}>
            Desconto na implantação (R$)
            <input name="discount" inputMode="decimal" value={discount} onChange={event => setDiscount(event.target.value)} placeholder="0,00" className={input} aria-label="Desconto na implantação" />
            <span className="text-xs font-normal text-muted mt-1">Aplicado somente à instalação e às taxas extras.</span>
          </label>
          <label className={label}>
            Condições comerciais
            <textarea name="terms" rows={3} maxLength={10000} defaultValue={initial?.terms ?? ''} placeholder="Prazo, forma de pagamento e condições" className={input} aria-label="Condições comerciais" />
          </label>
        </div>

        <div className="flex flex-wrap gap-3 justify-end">
          <button disabled={pending || customers.length === 0 || !pricingReady || !templateReady} className="btn-base btn-primary btn-md disabled:opacity-50">{pending ? 'Salvando…' : proposalId ? 'Criar nova versão' : 'Criar rascunho'}</button>
        </div>
        {customers.length === 0 && <p className="text-sm text-amber-800 mt-1 block">Cadastre um cliente ativo antes de criar uma proposta.</p>}
      </form>
    </section>
  )
}

function Price({label,value,className}:{label:string;value:string;className?:string}) { return <div className={className}><p className="text-xs text-muted">{label}</p><p className="mt-1 font-semibold">{value}</p></div> }

export function ProposalsWorkspace(props: { customers: ProposalCustomer[]; opportunities: ProposalOpportunity[]; products: ProposalProduct[]; pricingReady: boolean; templateReady: boolean }) {
  return <ProposalEditor {...props} />
}