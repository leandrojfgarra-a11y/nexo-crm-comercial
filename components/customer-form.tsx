'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { saveCustomer } from '@/app/clientes/actions'
import { createQuickAccountant } from '@/app/contadores/actions'
import { applyLookupValues } from '@/lib/apply-lookup-values'

export type CustomerFormValues = {
  id?: string; status?: string | null; customer_notes?: string | null; source?: string | null; seller_id?: string | null; accountant_id?: string | null;
  kind?: string | null; name?: string | null; trade_name?: string | null; tax_id?: string | null; email?: string | null; phone?: string | null; mobile_phone?: string | null; whatsapp?: string | null;
  postal_code?: string | null; address_line?: string | null; address_number?: string | null; address_extra?: string | null; district?: string | null; city?: string | null; state?: string | null;
  state_registration?: string | null; municipal_registration?: string | null; icms_contributor?: boolean | null; primary_cnae?: string | null; business_activity?: string | null; tax_regime?: string | null; registration_status?: string | null; opened_at?: string | null; person_notes?: string | null;
}
type Option = { id: string; name: string }
export type AccountantOption = Option & { kind?: string; trade_name?: string | null; tax_id?: string | null; contact_name?: string | null; email?: string | null; phone?: string | null; mobile_phone?: string | null; whatsapp?: string | null; postal_code?: string | null; address_line?: string | null; address_number?: string | null; address_extra?: string | null; district?: string | null; city?: string | null; state?: string | null; active?: boolean }

const input = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-blue focus:ring-2 focus:ring-blue/15 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500'
const label = 'flex flex-col gap-1 text-sm font-medium text-ink'
const section = 'card-base p-5'
const required = <span className="text-blue ml-0.5" aria-hidden="true">*</span>

const tabs = [
  { key: 'identificacao', label: 'Identificação' },
  { key: 'fiscal', label: 'Dados Fiscais' },
  { key: 'contato-endereco', label: 'Contato e Endereço' },
  { key: 'relacionamento', label: 'Relacionamento Comercial' },
] as const

export function CustomerForm({ initial = {}, sellers = [], accountants = [], schemaReady, accountantDetailsReady = false, businessActivityReady = false, mode }: {
  initial?: CustomerFormValues
  sellers?: Option[]
  accountants?: AccountantOption[]
  schemaReady: boolean
  accountantDetailsReady?: boolean
  businessActivityReady?: boolean
  mode: 'create' | 'edit'
}) {
  const formRef = useRef<HTMLFormElement>(null)
  const [activeTab, setActiveTab] = useState<'identificacao' | 'fiscal' | 'contato-endereco' | 'relacionamento'>('identificacao')
  const [lookup, setLookup] = useState('')
  const [lookupError, setLookupError] = useState(false)
  const [isLookingUpCnpj, setIsLookingUpCnpj] = useState(false)
  const [ieBusy, setIeBusy] = useState(false)
  const [ieMessage, setIeMessage] = useState('')
  const [ieOptions, setIeOptions] = useState<{number:string;state:string|null;active:boolean|null;regime:string|null}[]>([])
  const [ieChoice, setIeChoice] = useState('')
  const [accountantList, setAccountantList] = useState<AccountantOption[]>(accountants)
  const [selectedAccountantId, setSelectedAccountantId] = useState(initial.accountant_id ?? '')
  const [accountantSearch, setAccountantSearch] = useState('')
  const [quickOpen, setQuickOpen] = useState(false)
  const [quickBusy, setQuickBusy] = useState(false)
  const [quickError, setQuickError] = useState('')
  const [quickCepBusy, setQuickCepBusy] = useState(false)
  const showLookupMessage = (message: string, isError = false) => { setLookup(message); setLookupError(isError) }

  async function lookupData(kind: 'cnpj' | 'cep') {
    const form = formRef.current
    if (!form) return
    const sourceName = kind === 'cnpj' ? 'tax_id' : 'postal_code'
    const source = form.elements.namedItem(sourceName) as HTMLInputElement | null
    const number = source?.value.replace(kind === 'cnpj' ? /[^0-9a-z]/gi : /\D/g, '') ?? ''
    if (!number) { showLookupMessage(kind === 'cnpj' ? 'Informe o CNPJ antes da consulta.' : 'Informe o CEP antes da consulta.', true); return }
    if (kind === 'cnpj') setIsLookingUpCnpj(true)
    showLookupMessage('Consultando…')
    try {
      const response = await fetch(`/api/lookups/${kind}?${kind}=${encodeURIComponent(number)}`, { cache: 'no-store' })
      const contentType = response.headers.get('content-type') ?? ''
      if (!contentType.includes('application/json')) {
        showLookupMessage(response.redirected ? 'Sessão expirada ou acesso negado. Entre novamente com o administrador do Nexo.' : 'A rota de consulta retornou uma resposta inesperada. Tente novamente.', true)
        return
      }
      const data = await response.json() as Record<string, string | null> & { error?: string; inscriptions?: { number: string; state: string | null; active: boolean | null; regime: string | null }[]; ie_lookup_error?: string; supplemental_sources?: string[] }
      if (!response.ok) { showLookupMessage(data.error ?? `A consulta falhou (HTTP ${response.status}).`, true); return }
      const fields = Object.entries(data).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0)
      const conflicts = fields.some(([name, value]) => {
        const field = form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null
        const existing = field?.value.trim() ?? ''
        const normalizedExisting = name === 'tax_id' ? existing.replace(/[^0-9a-z]/gi, '').toUpperCase() : existing
        const normalizedResult = name === 'tax_id' ? value.replace(/[^0-9a-z]/gi, '').toUpperCase() : value
        return !!field && existing !== '' && normalizedExisting !== normalizedResult
      })
      const overwrite = conflicts && window.confirm('A consulta encontrou dados diferentes dos já preenchidos. Deseja substituir os campos que têm dados? Campos vazios serão preenchidos de qualquer forma.')
      const filled = applyLookupValues(form, data, overwrite)
      const provider = typeof data.provider === 'string' ? ` Fonte consultada: ${data.provider}${data.supplemental_sources?.length ? `; complemento por ${data.supplemental_sources.join(', ')}` : ''}.` : ''
      let ieStatus = ''
      if (kind === 'cnpj') {
        try {
          let options = data.inscriptions
          let ieError: string | undefined
          if (!options) {
            const ieResponse = await fetch(`/api/lookups/ie?cnpj=${encodeURIComponent(number)}`, { cache: 'no-store' })
            const ieData = await ieResponse.json() as { error?: string; inscriptions?: typeof data.inscriptions }
            options = ieResponse.ok ? ieData.inscriptions : undefined
            ieError = ieData.error ?? `HTTP ${ieResponse.status}`
          }
          if (options && data.ie_lookup_error) {
            ieStatus = ` Consulta de IE não concluída: ${data.ie_lookup_error}. O campo segue disponível para preenchimento manual.`
          } else if (options) {
            if (options.length === 1) { applyIe(options[0].number); ieStatus = ' IE localizada pela fonte pública.' }
            else if (options.length > 1) { setIeOptions(options); setIeChoice('0'); ieStatus = ` ${options.length} IEs localizadas; selecione a UF correta no campo fiscal.` }
            else ieStatus = ' A fonte não retornou IE; isso não indica isenção e o campo segue manual.'
          } else ieStatus = ` Consulta de IE não concluída: ${ieError ?? 'fonte indisponível'}`
        } catch { ieStatus = ' Consulta de IE indisponível; o campo segue manual.' }
      }
      showLookupMessage((filled ? `${filled} campo(s) preenchido(s). Confira os dados antes de salvar.${provider}` : `Consulta concluída. Os campos existentes foram preservados; nenhum campo vazio compatível foi encontrado.${provider}`) + ieStatus)
    } catch { showLookupMessage('Não foi possível concluir a consulta. Verifique a conexão com o servidor e tente novamente.', true) }
    finally { if (kind === 'cnpj') setIsLookingUpCnpj(false) }
  }

  async function lookupIE() {
    const form = formRef.current
    const tax = form?.elements.namedItem('tax_id') as HTMLInputElement | null
    const cnpj = tax?.value.replace(/[^0-9A-Z]/gi, '').toUpperCase() ?? ''
    setIeOptions([]); setIeMessage('')
    if (!/^[0-9A-Z]{14}$/.test(cnpj)) { setIeMessage('Informe um CNPJ válido antes de consultar a IE.'); return }
    setIeBusy(true)
    try {
      const response = await fetch(`/api/lookups/ie?cnpj=${encodeURIComponent(cnpj)}`, {cache:'no-store'})
      const data = await response.json() as {error?:string;provider?:string;inscriptions?:{number:string;state:string|null;active:boolean|null;regime:string|null}[]}
      if (!response.ok) { setIeMessage(data.error ?? `Consulta indisponível (HTTP ${response.status}). A IE pode ser preenchida manualmente.`); return }
      const options = data.inscriptions ?? []
      if (!options.length) { setIeMessage('A fonte não retornou Inscrição Estadual. Isso não indica isenção; o campo continua disponível para preenchimento manual.'); return }
      setIeOptions(options); setIeChoice('0')
      if (options.length === 1) applyIe(options[0].number)
      else setIeMessage(`${options.length} inscrições encontradas em diferentes UFs. Selecione a inscrição correta.`)
    } catch { setIeMessage('Não foi possível concluir a consulta de IE. O campo continua disponível para preenchimento manual.') }
    finally { setIeBusy(false) }
  }

  function applyIe(value: string) {
    const field = formRef.current?.elements.namedItem('state_registration') as HTMLInputElement | null
    if (!field) return
    if (field.value.trim() && field.value.trim() !== value && !window.confirm('A IE encontrada é diferente da já digitada. Deseja substituí-la?')) return
    field.value = value; field.dispatchEvent(new Event('input',{bubbles:true})); field.dispatchEvent(new Event('change',{bubbles:true}))
    setIeMessage('Inscrição Estadual preenchida. Confira a UF e os dados antes de salvar.')
  }

  async function createAccountant() {
    const form = formRef.current
    if (!form || !accountantDetailsReady) return
    setQuickBusy(true); setQuickError('')
    const result = await createQuickAccountant(new FormData(form))
    setQuickBusy(false)
    if (result.error || !result.accountant) { setQuickError(result.error ?? 'Não foi possível criar a contabilidade.'); return }
    const created = result.accountant as AccountantOption
    setAccountantList(current => [...current, created].sort((a,b) => a.name.localeCompare(b.name,'pt-BR')))
    setSelectedAccountantId(created.id); setQuickOpen(false); setAccountantSearch('')
  }

  async function lookupQuickCep() {
    const form = formRef.current
    const cep = (form?.elements.namedItem('quick_accountant_postal_code') as HTMLInputElement | null)?.value.replace(/\D/g,'') ?? ''
    if (cep.length !== 8) { setQuickError('Informe um CEP válido com 8 dígitos.'); return }
    setQuickCepBusy(true); setQuickError('')
    try {
      const response = await fetch(`/api/lookups/cep?cep=${cep}`,{cache:'no-store'})
      const data = await response.json() as Record<string,string|null> & {error?:string}
      if (!response.ok) { setQuickError(data.error ?? 'Não foi possível consultar o CEP.'); return }
      const mapping:Record<string,string>={postal_code:'postal_code',address_line:'address_line',address_extra:'address_extra',district:'district',city:'city',state:'state'}
      for (const [key,value] of Object.entries(mapping)) {
        const field=form?.elements.namedItem(`quick_accountant_${key}`) as HTMLInputElement|null
        const incoming=data[value]
        if(field && typeof incoming==='string' && incoming && (!field.value || (field.value!==incoming && window.confirm(`Substituir o campo ${key.replaceAll('_',' ')} pelo dado do CEP?`)))) field.value=incoming
      }
    } catch { setQuickError('Não foi possível consultar o CEP.') }
    finally { setQuickCepBusy(false) }
  }

  const selectedAccountant = accountantList.find(item => item.id === selectedAccountantId)
  const filteredAccountants = accountantList.filter(item => `${item.name} ${item.trade_name ?? ''} ${item.tax_id ?? ''} ${item.email ?? ''} ${item.phone ?? ''} ${item.whatsapp ?? ''}`.toLocaleLowerCase('pt-BR').includes(accountantSearch.toLocaleLowerCase('pt-BR')))

  const isEdit = mode === 'edit'

  return (
    <form ref={formRef} action={saveCustomer} className="space-y-5">
      {isEdit && initial.id && <input type="hidden" name="customer_id" value={initial.id} />}

      {/* Navegação por abas */}
      <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-2 mb-4">
        {tabs.map(tab => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            aria-pressed={activeTab === tab.key}
            className={`px-4 py-2.5 text-sm font-medium rounded-lg transition ${activeTab === tab.key
              ? 'bg-blue text-white border-blue'
              : 'text-slate-600 hover:bg-slate-50 border-transparent border-b-2 pb-[calc(2px+1px)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Mensagem de consulta (lookup) */}
      {lookup && <p role={lookupError ? 'alert' : 'status'} aria-live="polite" className={`msg-base ${lookupError ? 'msg-danger' : 'msg-success'}`}>{lookup}</p>}

      {/* Conteúdo das abas */}
      <div className="space-y-6">
        {/* ABA 1: Identificação */}
        <section
          id="tab-identificacao"
          className={`section ${activeTab !== 'identificacao' ? 'hidden' : ''}`}
          aria-labelledby="tab-identificacao-title"
        >
          <h2 id="tab-identificacao-title" className="sr-only">Identificação</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className={`${label} sm:col-span-2 lg:col-span-3`}>
              <label className="text-sm font-medium text-ink">
                Tipo de pessoa{required}
              </label>
              <select name="kind" required defaultValue={initial.kind ?? 'individual'} className={input} aria-label="Tipo de pessoa">
                <option value="individual">Pessoa física</option>
                <option value="company">Pessoa jurídica</option>
              </select>
            </div>
            <div className={`${label} sm:col-span-2 lg:col-span-3`}>
              <label className="text-sm font-medium text-ink">
                Nome completo / razão social{required}
              </label>
              <input name="name" required minLength={2} defaultValue={initial.name ?? ''} className={input} aria-label="Nome completo ou razão social" />
            </div>
            <label className={label}>
              Nome fantasia
              <input name="trade_name" defaultValue={initial.trade_name ?? ''} className={input} aria-label="Nome fantasia" />
            </label>
            <div className={label}>
              <span className="flex items-center gap-1.5 text-sm font-medium text-ink">CPF / CNPJ{required}</span>
              <div className="flex gap-2 mt-1">
                <input name="tax_id" inputMode="text" autoComplete="off" defaultValue={initial.tax_id ?? ''} className={input} aria-label="CPF ou CNPJ" />
                <button type="button" onClick={() => lookupData('cnpj')} disabled={isLookingUpCnpj} aria-busy={isLookingUpCnpj} className="flex shrink-0 items-center gap-2 rounded-lg border border-blue/30 px-3 text-sm font-semibold text-blue hover:bg-blue/5 disabled:cursor-wait disabled:opacity-70">{isLookingUpCnpj && <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-blue/30 border-t-blue" />}{isLookingUpCnpj ? 'Consultando…' : 'Consultar CNPJ'}</button>
              </div>
            </div>
            <label className={label}>
              Situação cadastral
              <input name="registration_status" defaultValue={initial.registration_status ?? ''} disabled={!schemaReady} placeholder={schemaReady ? '' : 'Disponível após a migration'} className={input} aria-label="Situação cadastral" />
            </label>
            <label className={label}>
              Data de abertura
              <input name="opened_at" type="date" defaultValue={initial.opened_at ?? ''} disabled={!schemaReady} className={input} aria-label="Data de abertura" />
            </label>
          </div>
        </section>

        {/* ABA 2: Dados Fiscais */}
        <section
          id="tab-fiscal"
          className={`section ${activeTab !== 'fiscal' ? 'hidden' : ''}`}
          aria-labelledby="tab-fiscal-title"
        >
          <h2 id="tab-fiscal-title" className="sr-only">Dados Fiscais</h2>
          <div className="mt-4 grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className={`${label} min-w-0`}>
              <span className="flex items-center gap-1.5 text-sm font-medium text-ink">Inscrição Estadual</span>
              <div className="flex min-w-0 gap-2 mt-1">
                <input name="state_registration" defaultValue={initial.state_registration ?? ''} disabled={!schemaReady} className={`${input} min-w-0`} aria-label="Inscrição Estadual" />
                <button type="button" disabled={ieBusy || !schemaReady} onClick={lookupIE} className="shrink-0 rounded-lg border border-blue/30 px-3 text-sm font-semibold text-blue disabled:opacity-50">{ieBusy ? 'Consultando…' : 'Consultar IE'}</button>
              </div>
              {ieOptions.length > 1 && <div className="flex min-w-0 gap-2 mt-1"><select aria-label="Inscrição Estadual por UF" value={ieChoice} onChange={event=>setIeChoice(event.target.value)} className={`${input} min-w-0`}>{ieOptions.map((item,index)=><option key={`${item.state}-${item.number}-${index}`} value={String(index)}>{item.number} · {item.state ?? 'UF não informada'} · {item.active === null ? 'Situação não informada' : item.active ? 'Ativa' : 'Inativa'}{item.regime ? ` · ${item.regime}` : ''}</option>)}</select><button type="button" onClick={()=>{const choice=ieOptions[Number(ieChoice)];if(choice)applyIe(choice.number)}} className="shrink-0 rounded-lg border border-slate-300 px-3 text-sm font-semibold">Usar</button></div>}
              {ieMessage && <span role="status" className="text-xs text-slate-600 mt-1 block">{ieMessage}</span>}
            </div>
            <label className={`${label} min-w-0`}>
              Inscrição Municipal
              <input name="municipal_registration" defaultValue={initial.municipal_registration ?? ''} disabled={!schemaReady} className={input} aria-label="Inscrição Municipal" />
            </label>
            <label className={`${label} min-w-0`}>
              Contribuinte de ICMS
              <select name="icms_contributor" defaultValue={initial.icms_contributor === true ? 'yes' : initial.icms_contributor === false ? 'no' : ''} disabled={!schemaReady} className={input} aria-label="Contribuinte de ICMS">
                <option value="">Não informado</option>
                <option value="yes">Sim</option>
                <option value="no">Não</option>
              </select>
            </label>
            <label className={`${label} min-w-0`}>
              CNAE principal
              <input name="primary_cnae" defaultValue={initial.primary_cnae ?? ''} disabled={!schemaReady} className={input} aria-label="CNAE principal" />
            </label>
            <label className={`${label} min-w-0`}>
              Ramo de atividade
              <input name="business_activity" maxLength={150} defaultValue={initial.business_activity ?? ''} disabled={!businessActivityReady} placeholder={businessActivityReady ? 'Ex.: Açougue / Casa de carnes' : 'Disponível após a migration'} className={input} aria-label="Ramo de atividade" />
            </label>
            <label className={`${label} min-w-0`}>
              Regime tributário
              <select name="tax_regime" defaultValue={initial.tax_regime ?? ''} disabled={!schemaReady} className={input} aria-label="Regime tributário">
                <option value="">Não informado</option>
                <option>Simples Nacional</option>
                <option>Lucro Presumido</option>
                <option>Lucro Real</option>
                <option>MEI</option>
                <option>Outro</option>
              </select>
            </label>
          </div>
          {!schemaReady && <p className="mt-3 msg-base msg-warning">Campos fiscais aguardam a migration complementar. Nenhum valor desses campos será gravado até ela ser aplicada.</p>}
        </section>

        {/* ABA 3: Contato e Endereço */}
        <section
          id="tab-contato-endereco"
          className={`section ${activeTab !== 'contato-endereco' ? 'hidden' : ''}`}
          aria-labelledby="tab-contato-endereco-title"
        >
          <h2 id="tab-contato-endereco-title" className="sr-only">Contato e Endereço</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className={label}>
              Telefone
              <input name="phone" type="tel" defaultValue={initial.phone ?? ''} className={input} aria-label="Telefone" />
            </label>
            <label className={label}>
              Celular
              <input name="mobile_phone" type="tel" defaultValue={initial.mobile_phone ?? ''} disabled={!schemaReady} className={input} aria-label="Celular" />
            </label>
            <label className={label}>
              WhatsApp
              <input name="whatsapp" type="tel" defaultValue={initial.whatsapp ?? ''} className={input} aria-label="WhatsApp" />
            </label>
            <label className={label}>
              E-mail
              <input name="email" type="email" autoComplete="email" defaultValue={initial.email ?? ''} className={input} aria-label="E-mail" />
            </label>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className={label}>
              <span className="flex items-center gap-1.5 text-sm font-medium text-ink">CEP</span>
              <div className="flex gap-2 mt-1">
                <input name="postal_code" inputMode="numeric" defaultValue={initial.postal_code ?? ''} className={input} aria-label="CEP" />
                <button type="button" onClick={() => lookupData('cep')} className="shrink-0 rounded-lg border border-slate-300 px-3 text-sm font-semibold hover:bg-slate-50">Consultar</button>
              </div>
            </div>
            <label className={`${label} lg:col-span-2`}>
              Logradouro
              <input name="address_line" defaultValue={initial.address_line ?? ''} className={input} aria-label="Logradouro" />
            </label>
            <label className={label}>
              Número
              <input name="address_number" defaultValue={initial.address_number ?? ''} className={input} aria-label="Número" />
            </label>
            <label className={label}>
              Complemento
              <input name="address_extra" defaultValue={initial.address_extra ?? ''} className={input} aria-label="Complemento" />
            </label>
            <label className={label}>
              Bairro
              <input name="district" defaultValue={initial.district ?? ''} className={input} aria-label="Bairro" />
            </label>
            <label className={label}>
              Cidade
              <input name="city" defaultValue={initial.city ?? ''} className={input} aria-label="Cidade" />
            </label>
            <label className={label}>
              UF
              <input name="state" maxLength={2} defaultValue={initial.state ?? ''} className={input} aria-label="UF" />
            </label>
          </div>
        </section>

        {/* ABA 4: Relacionamento Comercial */}
        <section
          id="tab-relacionamento"
          className={`section ${activeTab !== 'relacionamento' ? 'hidden' : ''}`}
          aria-labelledby="tab-relacionamento-title"
        >
          <h2 id="tab-relacionamento-title" className="sr-only">Relacionamento Comercial</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className={`${label} sm:col-span-2`}>
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink">Contador / escritório</span>
                <input type="hidden" name="accountant_id" value={selectedAccountantId} />
                <input value={accountantSearch} onChange={event=>setAccountantSearch(event.target.value)} placeholder="Pesquisar nome, documento ou contato" disabled={!schemaReady} className={input} aria-label="Pesquisar contador ou escritório" />
                <select aria-label="Selecionar contador ou escritório" value={selectedAccountantId} onChange={event=>setSelectedAccountantId(event.target.value)} disabled={!schemaReady} className={input}>
                  <option value="">Sem vínculo</option>
                  {filteredAccountants.map(item => <option key={item.id} value={item.id}>{item.name}{item.trade_name ? ` · ${item.trade_name}` : ''}{!item.active ? ' (inativo)' : ''}</option>)}
                </select>
              </div>
              {selectedAccountant && <div className="grid gap-2 rounded-lg border border-blue/15 bg-blue/5 p-4 text-sm sm:grid-cols-2 mt-3"><p className="font-semibold sm:col-span-2">{selectedAccountant.name}{selectedAccountant.trade_name ? ` · ${selectedAccountant.trade_name}` : ''}</p><p>Responsável: {selectedAccountant.contact_name || 'Não informado'}</p><p>Telefone: {selectedAccountant.phone || 'Não informado'}</p><p>Celular / WhatsApp: {[selectedAccountant.mobile_phone,selectedAccountant.whatsapp].filter(Boolean).join(' / ') || 'Não informado'}</p><p>E-mail: {selectedAccountant.email || 'Não informado'}</p><p className="sm:col-span-2">Endereço: {[selectedAccountant.address_line,selectedAccountant.address_number,selectedAccountant.address_extra,selectedAccountant.district,selectedAccountant.city,selectedAccountant.state,selectedAccountant.postal_code].filter(Boolean).join(', ') || 'Não informado'}</p><Link href={`/contadores?edit=${selectedAccountant.id}#cadastro`} className="font-semibold text-blue hover:underline sm:col-span-2">Abrir cadastro da contabilidade</Link></div>}
              <button type="button" onClick={()=>{setQuickOpen(value=>!value);setQuickError('')}} disabled={!schemaReady || !accountantDetailsReady} className="mt-3 w-fit rounded-lg border border-blue/30 px-3 py-2 text-sm font-semibold text-blue disabled:opacity-50">+ Nova contabilidade</button>
              {!accountantDetailsReady && schemaReady && <span className="text-xs text-amber-800 mt-1 block">O cadastro rápido completo depende da migration complementar de contabilidades.</span>}
              {quickOpen && <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 mt-4"><h3 className="font-semibold sm:col-span-2">Nova contabilidade (cadastro central)</h3><label className={label}>Tipo<select name="quick_accountant_kind" defaultValue="office" className={input}><option value="individual">Contador individual</option><option value="office">Escritório contábil</option></select></label><label className={label}>Nome / razão social<input name="quick_accountant_name" required minLength={2} className={input}/></label><label className={label}>Nome fantasia<input name="quick_accountant_trade_name" className={input}/></label><label className={label}>CPF / CNPJ<input name="quick_accountant_tax_id" className={input}/></label><label className={label}>Contato responsável<input name="quick_accountant_contact_name" className={input}/></label><label className={label}>Telefone<input name="quick_accountant_phone" className={input}/></label><label className={label}>Celular<input name="quick_accountant_mobile_phone" className={input}/></label><label className={label}>WhatsApp<input name="quick_accountant_whatsapp" className={input}/></label><label className={label}>E-mail<input name="quick_accountant_email" type="email" className={input}/></label><div className={label}><span>CEP</span><div className="flex gap-2"><input name="quick_accountant_postal_code" className={input}/><button type="button" onClick={lookupQuickCep} disabled={quickCepBusy} className="rounded-lg border px-3 text-sm">{quickCepBusy?'…':'Consultar'}</button></div></div><label className={label}>Logradouro<input name="quick_accountant_address_line" className={input}/></label><label className={label}>Número<input name="quick_accountant_address_number" className={input}/></label><label className={label}>Complemento<input name="quick_accountant_address_extra" className={input}/></label><label className={label}>Bairro<input name="quick_accountant_district" className={input}/></label><label className={label}>Cidade<input name="quick_accountant_city" className={input}/></label><label className={label}>UF<input name="quick_accountant_state" maxLength={2} className={input}/></label><div className="flex flex-wrap items-center gap-3 sm:col-span-2 xl:col-span-3"><button disabled={!schemaReady || quickBusy} className="rounded-lg bg-blue px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{quickBusy ? 'Salvando...' : 'Salvar contabilidade'}</button><button type="button" onClick={()=>setQuickOpen(false)} className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold">Cancelar</button></div></div>}
            </div>
            <label className={label}>
              Vendedor responsável
              <select name="seller_id" defaultValue={initial.seller_id ?? ''} disabled={!schemaReady} className={input} aria-label="Vendedor responsável">
                <option value="">Sem responsável</option>
                {sellers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label className={label}>
              Origem do cliente
              <input name="source" defaultValue={initial.source ?? ''} disabled={!schemaReady} placeholder="Indicação, site, evento…" className={input} aria-label="Origem do cliente" />
            </label>
            <label className={label}>
              Situação do cliente
              <select name="status" defaultValue={initial.status ?? 'active'} className={input} aria-label="Situação do cliente">
                <option value="active">Ativo</option>
                <option value="inactive">Inativo</option>
              </select>
            </label>
            <label className={`${label} sm:col-span-2`}>
              Observações comerciais
              <textarea name="customer_notes" rows={3} defaultValue={initial.customer_notes ?? ''} className={input} aria-label="Observações comerciais" />
            </label>
            <label className={`${label} sm:col-span-2 lg:col-span-3`}>
              Observações cadastrais
              <textarea name="person_notes" rows={3} defaultValue={initial.person_notes ?? ''} className={input} aria-label="Observações cadastrais" />
            </label>
          </div>
        </section>
      </div>

      {/* Rodapé com botões padronizados */}
      <div className="mt-6 flex flex-wrap gap-3 justify-end">
        <Link href={isEdit ? `/clientes/${initial.id}` : '/clientes'} className="btn-base btn-secondary btn-md">Voltar</Link>
        <button type="submit" className="btn-base btn-primary btn-md">{isEdit ? 'Salvar alterações' : 'Cadastrar cliente'}</button>
      </div>
    </form>
  )
}