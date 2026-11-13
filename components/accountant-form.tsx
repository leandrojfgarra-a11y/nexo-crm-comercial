'use client'

import { useRef, useState } from 'react'
import { saveAccountant } from '@/app/contadores/actions'

export type AccountantFormValues = {
  id?: string; kind?: string | null; name?: string | null; trade_name?: string | null; tax_id?: string | null;
  contact_name?: string | null; email?: string | null; phone?: string | null; mobile_phone?: string | null; whatsapp?: string | null;
  postal_code?: string | null; address_line?: string | null; address_number?: string | null; address_extra?: string | null;
  district?: string | null; city?: string | null; state?: string | null; notes?: string | null; active?: boolean | null;
  relationship_type?: 'lead' | 'partner' | null;
}

const input = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-blue focus:ring-2 focus:ring-blue/15 disabled:bg-slate-100'
const label = 'flex flex-col gap-1.5 text-sm font-medium text-ink'
const section = 'card-base p-5'

export function AccountantForm({ initial = {}, detailsReady, relationshipReady }: { initial?: AccountantFormValues; detailsReady: boolean; relationshipReady: boolean }) {
  const formRef = useRef<HTMLFormElement>(null)
  const [lookup, setLookup] = useState('')
  const [lookingUp, setLookingUp] = useState(false)

  async function lookupCep() {
    const form = formRef.current
    const source = form?.elements.namedItem('postal_code') as HTMLInputElement | null
    const cep = source?.value.replace(/\D/g, '') ?? ''
    if (!/^\d{8}$/.test(cep)) { setLookup('Informe um CEP com 8 dígitos.'); return }
    setLookingUp(true)
    setLookup('Consultando CEP…')
    try {
      const response = await fetch(`/api/lookups/cep?cep=${encodeURIComponent(cep)}`, { cache: 'no-store' })
      const data = await response.json() as Record<string, string | null> & { error?: string }
      if (!response.ok) { setLookup(data.error ?? 'Não foi possível consultar o CEP.'); return }
      const conflicts = Object.entries(data).some(([name, value]) => {
        const field = form?.elements.namedItem(name) as HTMLInputElement | null
        return typeof value === 'string' && !!field?.value.trim() && field.value.trim() !== value
      })
      const replace = conflicts && window.confirm('Há dados de endereço preenchidos. Deseja substituí-los pelos dados retornados para este CEP?')
      let count = 0
      for (const [name, value] of Object.entries(data)) {
        const field = form?.elements.namedItem(name) as HTMLInputElement | null
        if (typeof value !== 'string' || !field || field.disabled || (field.value.trim() && !replace)) continue
        field.value = value
        field.dispatchEvent(new Event('input', { bubbles: true }))
        field.dispatchEvent(new Event('change', { bubbles: true }))
        count++
      }
      setLookup(`${count} campo(s) de endereço preenchido(s).`)
    } catch { setLookup('Não foi possível concluir a consulta do CEP. Tente novamente.') }
    finally { setLookingUp(false) }
  }

  return (
    <form ref={formRef} action={saveAccountant} className="space-y-5">
      {initial.id && <input type="hidden" name="accountant_id" value={initial.id} />}

      {/* Identificação */}
      <section className={section} aria-labelledby="accountant-identificacao-title">
        <h2 id="accountant-identificacao-title" className="sr-only">Identificação</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className={label}>
            Tipo
            <select name="kind" defaultValue={initial.kind ?? 'individual'} className={input} aria-label="Tipo de contabilidade">
              <option value="individual">Contador individual</option>
              <option value="office">Escritório contábil</option>
            </select>
          </label>
          <label className={`${label} sm:col-span-2`}>
            Nome / razão social<span className="text-blue ml-0.5" aria-hidden="true">*</span>
            <input name="name" required minLength={2} defaultValue={initial.name ?? ''} className={input} aria-label="Nome ou razão social" />
          </label>
          <label className={label}>
            Relacionamento comercial
            <select name="relationship_type" defaultValue={initial.relationship_type ?? (initial.id ? '' : 'lead')} disabled={!relationshipReady} className={input} aria-label="Relacionamento comercial">
              <option value="">Sem classificação</option>
              <option value="lead">Lead de parceria</option>
              <option value="partner">Parceiro</option>
            </select>
            {!relationshipReady && <p className="text-xs text-amber-800 mt-1 block">Aplique manualmente a migration <code>202611070001_accountant_relationship_type.sql</code> no Supabase para liberar esta seleção.</p>}
          </label>
          <label className={label}>
            Nome fantasia
            <input name="trade_name" defaultValue={initial.trade_name ?? ''} disabled={!detailsReady} className={input} aria-label="Nome fantasia" />
            <p className="text-xs text-muted mt-1 block">Nome de fantasia do escritório (opcional).</p>
          </label>
          <label className={label}>
            CPF / CNPJ<span className="text-blue ml-0.5" aria-hidden="true">*</span>
            <input name="tax_id" defaultValue={initial.tax_id ?? ''} className={input} aria-label="CPF ou CNPJ" />
          </label>
          <label className={label}>
            Contato responsável
            <input name="contact_name" defaultValue={initial.contact_name ?? ''} disabled={!detailsReady} className={input} aria-label="Contato responsável" />
            <p className="text-xs text-muted mt-1 block">Pessoa responsável pelo contato (opcional).</p>
          </label>
        </div>
      </section>

      {/* Contato */}
      <section className={section} aria-labelledby="accountant-contato-title">
        <h2 id="accountant-contato-title" className="sr-only">Contato</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className={label}>
            Telefone
            <input name="phone" type="tel" defaultValue={initial.phone ?? ''} className={input} aria-label="Telefone" />
          </label>
          <label className={label}>
            Celular
            <input name="mobile_phone" type="tel" defaultValue={initial.mobile_phone ?? ''} disabled={!detailsReady} className={input} aria-label="Celular" />
          </label>
          <label className={label}>
            WhatsApp
            <input name="whatsapp" type="tel" defaultValue={initial.whatsapp ?? ''} disabled={!detailsReady} className={input} aria-label="WhatsApp" />
          </label>
          <label className={label}>
            E-mail
            <input name="email" type="email" defaultValue={initial.email ?? ''} className={input} aria-label="E-mail" />
          </label>
        </div>
      </section>

      {/* Endereço */}
      <section className={section} aria-labelledby="accountant-endereco-title">
        <h2 id="accountant-endereco-title" className="sr-only">Endereço</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className={label}>
            <span className="flex items-center gap-1.5 text-sm font-medium text-ink">CEP</span>
            <div className="flex gap-2">
              <input name="postal_code" inputMode="numeric" defaultValue={initial.postal_code ?? ''} disabled={!detailsReady} className={input} aria-label="CEP" />
              <button type="button" onClick={lookupCep} disabled={!detailsReady || lookingUp} className="btn-base btn-secondary btn-sm disabled:opacity-50">{lookingUp ? 'Consultando…' : 'Consultar CEP'}</button>
            </div>
          </div>
          <label className={`${label} lg:col-span-2`}>
            Logradouro
            <input name="address_line" defaultValue={initial.address_line ?? ''} disabled={!detailsReady} className={input} aria-label="Logradouro" />
          </label>
          <label className={label}>
            Número
            <input name="address_number" defaultValue={initial.address_number ?? ''} disabled={!detailsReady} className={input} aria-label="Número" />
          </label>
          <label className={label}>
            Complemento
            <input name="address_extra" defaultValue={initial.address_extra ?? ''} disabled={!detailsReady} className={input} aria-label="Complemento" />
          </label>
          <label className={label}>
            Bairro
            <input name="district" defaultValue={initial.district ?? ''} disabled={!detailsReady} className={input} aria-label="Bairro" />
          </label>
          <label className={label}>
            Cidade
            <input name="city" defaultValue={initial.city ?? ''} disabled={!detailsReady} className={input} aria-label="Cidade" />
          </label>
          <label className={label}>
            UF
            <input name="state" maxLength={2} defaultValue={initial.state ?? ''} disabled={!detailsReady} className={input} aria-label="UF" />
          </label>
        </div>
        {lookup && <p role="status" className="msg-base mt-3 msg-info">{lookup}</p>}
      </section>

      {/* Controle */}
      <section className={section} aria-labelledby="accountant-controle-title">
        <h2 id="accountant-controle-title" className="sr-only">Controle</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className={label}>
            Situação
            <select name="active" defaultValue={String(initial.active ?? true)} className={input} aria-label="Situação">
              <option value="true">Ativo</option>
              <option value="false">Inativo</option>
            </select>
          </label>
          <label className={label}>
            Observações
            <textarea name="notes" rows={3} defaultValue={initial.notes ?? ''} className={input} aria-label="Observações" />
            <p className="text-xs text-muted mt-1 block">Observações sobre este contador ou escritório (opcional).</p>
          </label>
        </div>
        {!detailsReady && <p className="mt-3 msg-base msg-warning">Campos adicionais de contabilidade aguardam a migration complementar. Nome, tipo, CPF/CNPJ, telefone, e-mail e controle continuam disponíveis.</p>}
        {!relationshipReady && <p className="mt-3 msg-base msg-warning">A classificação entre lead de parceria e parceiro será liberada após aplicar a migration de relacionamento comercial.</p>}
      </section>

      <button type="submit" className="w-fit btn-base btn-primary btn-md">{initial.id ? 'Salvar contabilidade' : 'Cadastrar contabilidade'}</button>
    </form>
  )
}