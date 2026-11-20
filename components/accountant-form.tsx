'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { saveAccountant } from '@/app/contadores/actions'
import { AppButton, AppInput, AppSelect, AppTextarea, FormActions, FormField, FormSection } from '@/components/design-system'
import { formatAccountantDocument, normalizeAccountantDocument } from '@/lib/accountant-documents'
import { ACCOUNTANT_CNPJ_FIELD_NAMES, hasAccountantCnpjConflicts, mapAccountantCnpjFields, shouldApplyAccountantCnpjField, type AccountantCnpjField } from '@/lib/accountant-cnpj-lookup'
import { validCnpj } from '@/lib/crm-validation'
import type { AccountantKind } from '@/lib/accountant-identity'

export type AccountantFormValues = {
  id?: string; kind?: string | null; name?: string | null; trade_name?: string | null; tax_id?: string | null;
  contact_name?: string | null; email?: string | null; phone?: string | null; mobile_phone?: string | null; whatsapp?: string | null;
  postal_code?: string | null; address_line?: string | null; address_number?: string | null; address_extra?: string | null;
  district?: string | null; city?: string | null; state?: string | null; notes?: string | null; active?: boolean | null;
  relationship_type?: 'lead' | 'partner' | null;
}

type LookupState = { text: string; tone: 'info' | 'danger' | 'success' } | null

function AccountantSubmitButton({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus()
  return <AppButton type="submit" loading={pending} loadingText="Salvando…" startIcon={<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4h12l3 3v13H4V4h1Z" /><path d="M8 4v6h8V4M8 20v-6h8v6" /></svg>} className="w-full sm:w-auto">{editing ? 'Salvar contabilidade' : 'Cadastrar contabilidade'}</AppButton>
}

export function AccountantForm({ initial = {}, detailsReady, relationshipReady }: { initial?: AccountantFormValues; detailsReady: boolean; relationshipReady: boolean }) {
  const formRef = useRef<HTMLFormElement>(null)
  const [lookup, setLookup] = useState<LookupState>(null)
  const [lookingUp, setLookingUp] = useState(false)
  const [cnpjLookup, setCnpjLookup] = useState<LookupState>(null)
  const [lookingUpCnpj, setLookingUpCnpj] = useState(false)
  const [kind, setKind] = useState<AccountantKind>(initial.kind === 'office' ? 'office' : 'individual')
  const [taxIdRaw, setTaxIdRaw] = useState(initial.tax_id ?? '')

  async function lookupCep() {
    const form = formRef.current
    const source = form?.elements.namedItem('postal_code') as HTMLInputElement | null
    const cep = source?.value.replace(/\D/g, '') ?? ''
    if (!/^\d{8}$/.test(cep)) { setLookup({ text: 'Informe um CEP com 8 dígitos.', tone: 'danger' }); return }
    setLookingUp(true)
    setLookup({ text: 'Consultando CEP…', tone: 'info' })
    try {
      const response = await fetch(`/api/lookups/cep?cep=${encodeURIComponent(cep)}`, { cache: 'no-store' })
      const data = await response.json() as Record<string, string | null> & { error?: string }
      if (!response.ok) { setLookup({ text: data.error ?? 'Não foi possível consultar o CEP.', tone: 'danger' }); return }
      const conflicts = Object.entries(data).some(([name, value]) => {
        const fieldEl = form?.elements.namedItem(name) as HTMLInputElement | null
        return typeof value === 'string' && !!fieldEl?.value.trim() && fieldEl.value.trim() !== value
      })
      const replace = conflicts && window.confirm('Há dados de endereço preenchidos. Deseja substituí-los pelos dados retornados para este CEP?')
      let count = 0
      for (const [name, value] of Object.entries(data)) {
        const fieldEl = form?.elements.namedItem(name) as HTMLInputElement | null
        if (typeof value !== 'string' || !fieldEl || fieldEl.disabled || (fieldEl.value.trim() && !replace)) continue
        fieldEl.value = value
        fieldEl.dispatchEvent(new Event('input', { bubbles: true }))
        fieldEl.dispatchEvent(new Event('change', { bubbles: true }))
        count++
      }
      setLookup({ text: `${count} campo(s) de endereço preenchido(s).`, tone: 'success' })
    } catch { setLookup({ text: 'Não foi possível concluir a consulta do CEP. Tente novamente.', tone: 'danger' }) }
    finally { setLookingUp(false) }
  }

  async function lookupCnpj() {
    const field = formRef.current?.elements.namedItem('tax_id') as HTMLInputElement | null
    const cnpj = normalizeAccountantDocument(field?.value ?? '', 'office')
    if (!validCnpj(cnpj)) {
      setCnpjLookup({ text: 'Informe um CNPJ válido para consultar.', tone: 'danger' })
      return
    }

    setLookingUpCnpj(true)
    setCnpjLookup({ text: 'Consultando dados cadastrais do CNPJ…', tone: 'info' })
    try {
      const response = await fetch(`/api/lookups/cnpj?cnpj=${encodeURIComponent(cnpj)}`, { cache: 'no-store' })
      const data = await response.json() as Record<string, unknown> & { error?: string }
      if (!response.ok) {
        setCnpjLookup({ text: data.error ?? (response.status === 404 ? 'CNPJ não encontrado.' : 'Não foi possível consultar o CNPJ.'), tone: 'danger' })
        return
      }

      const fields = mapAccountantCnpjFields(data, cnpj)
      const currentValues: Partial<Record<AccountantCnpjField, string>> = {}
      for (const name of ACCOUNTANT_CNPJ_FIELD_NAMES) {
        const input = formRef.current?.elements.namedItem(name) as HTMLInputElement | null
        if (input && !input.disabled) currentValues[name] = input.value
      }
      const conflicts = hasAccountantCnpjConflicts(currentValues, fields)
      const replace = conflicts && window.confirm('Há dados cadastrais preenchidos. Deseja substituí-los pelos dados retornados para este CNPJ?')
      let count = 0
      for (const name of ACCOUNTANT_CNPJ_FIELD_NAMES) {
        const value = fields[name]
        const input = formRef.current?.elements.namedItem(name) as HTMLInputElement | null
        if (!input || input.disabled || !value || !shouldApplyAccountantCnpjField(input.value, value, replace)) continue
        input.value = value
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new Event('change', { bubbles: true }))
        if (name === 'tax_id') setTaxIdRaw(normalizeAccountantDocument(value, 'office'))
        count++
      }
      setCnpjLookup({ text: `${count} campo(s) preenchido(s) com dados públicos. Revise as informações antes de salvar.`, tone: 'success' })
    } catch {
      setCnpjLookup({ text: 'Serviço de consulta indisponível ou tempo limite excedido. Você pode preencher os dados manualmente.', tone: 'danger' })
    } finally {
      setLookingUpCnpj(false)
    }
  }

  return (
    <form ref={formRef} action={saveAccountant} className="mx-auto w-full max-w-5xl space-y-3">
      {initial.id && <input type="hidden" name="accountant_id" value={initial.id} />}

      <FormSection title="Identificação" description="Dados principais do contador ou escritório contábil." contentClassName="lg:grid-cols-12">
        <FormField label="Pessoa" className="lg:col-span-3" control={
          <AppSelect name="kind" value={kind} onChange={event => setKind(event.currentTarget.value as AccountantKind)} aria-label="Tipo de pessoa">
            <option value="individual">Pessoa Física · contador individual</option><option value="office">Pessoa Jurídica · escritório contábil</option>
          </AppSelect>
        } />
        <FormField label={kind === 'office' ? 'Razão social' : 'Nome'} required className="sm:col-span-2 lg:col-span-5" control={<AppInput name="name" required minLength={2} defaultValue={initial.name ?? ''} aria-label={kind === 'office' ? 'Razão social' : 'Nome'} />} />
        <FormField label="Nome fantasia" hint="Nome fantasia do escritório (opcional)." className="lg:col-span-4" control={<AppInput name="trade_name" defaultValue={initial.trade_name ?? ''} disabled={!detailsReady} aria-label="Nome fantasia" />} />
        <FormField label={kind === 'office' ? 'CNPJ' : 'CPF (opcional)'} required={kind === 'office'} className="lg:col-span-5" control={<AppInput name="tax_id" value={formatAccountantDocument(taxIdRaw, kind)} onChange={event => setTaxIdRaw(normalizeAccountantDocument(event.currentTarget.value, kind))} required={kind === 'office'} inputMode={kind === 'office' ? 'text' : 'numeric'} placeholder={kind === 'office' ? '00.000.000/0000-00' : '000.000.000-00'} aria-label={kind === 'office' ? 'CNPJ' : 'CPF opcional'} />} controlAddon={kind === 'office' ? <AppButton type="button" variant="secondary" size="sm" loading={lookingUpCnpj} loadingText="Consultando" onClick={lookupCnpj} startIcon={<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></svg>} className="shrink-0">Consultar CNPJ</AppButton> : undefined} />
        <FormField label="Relacionamento comercial" className="lg:col-span-4" control={
          <AppSelect name="relationship_type" defaultValue={initial.relationship_type ?? (initial.id ? '' : 'lead')} disabled={!relationshipReady} aria-label="Relacionamento comercial">
            <option value="">Sem classificação</option><option value="lead">Lead de parceria</option><option value="partner">Parceiro</option>
          </AppSelect>
        } />
        <FormField label="Contato responsável" hint="Pessoa responsável pelo contato (opcional)." className="sm:col-span-2 lg:col-span-4" control={<AppInput name="contact_name" defaultValue={initial.contact_name ?? ''} disabled={!detailsReady} aria-label="Contato responsável" />} />
        {cnpjLookup && <p role={cnpjLookup.tone === 'danger' ? 'alert' : 'status'} aria-live="polite" className={`sm:col-span-2 lg:col-span-12 msg-base mb-0 ${cnpjLookup.tone === 'danger' ? 'msg-danger' : cnpjLookup.tone === 'success' ? 'msg-success' : 'msg-info'}`}>{cnpjLookup.text}</p>}
        {!relationshipReady && <p className="sm:col-span-2 lg:col-span-12 text-xs [color:var(--warning-text)]">Aplique manualmente a migration <code>202611070001_accountant_relationship_type.sql</code> no Supabase para liberar esta seleção.</p>}
      </FormSection>

      <FormSection title="Contato" description="Canais para comunicação com o contador ou escritório." contentClassName="lg:grid-cols-4">
        <FormField label="Telefone" control={<AppInput name="phone" type="tel" defaultValue={initial.phone ?? ''} aria-label="Telefone" />} />
        <FormField label="Celular" control={<AppInput name="mobile_phone" type="tel" defaultValue={initial.mobile_phone ?? ''} disabled={!detailsReady} aria-label="Celular" />} />
        <FormField label="WhatsApp" control={<AppInput name="whatsapp" type="tel" defaultValue={initial.whatsapp ?? ''} disabled={!detailsReady} aria-label="WhatsApp" />} />
        <FormField label="E-mail" control={<AppInput name="email" type="email" defaultValue={initial.email ?? ''} aria-label="E-mail" />} />
      </FormSection>

      <FormSection title="Endereço" description="Localização e dados de correspondência." contentClassName="lg:grid-cols-12">
        <FormField label="CEP" className="lg:col-span-4" control={<AppInput name="postal_code" inputMode="numeric" defaultValue={initial.postal_code ?? ''} disabled={!detailsReady} aria-label="CEP" />} controlAddon={
          <AppButton type="button" variant="secondary" size="sm" onClick={lookupCep} disabled={!detailsReady || lookingUp} loading={lookingUp} loadingText="Consultando CEP" className="shrink-0">Consultar CEP</AppButton>
        } />
        <FormField label="Logradouro" className="sm:col-span-2 lg:col-span-6" control={<AppInput name="address_line" defaultValue={initial.address_line ?? ''} disabled={!detailsReady} aria-label="Logradouro" />} />
        <FormField label="Número" className="lg:col-span-2" control={<AppInput name="address_number" defaultValue={initial.address_number ?? ''} disabled={!detailsReady} aria-label="Número" />} />
        <FormField label="Complemento" className="lg:col-span-4" control={<AppInput name="address_extra" defaultValue={initial.address_extra ?? ''} disabled={!detailsReady} aria-label="Complemento" />} />
        <FormField label="Bairro" className="lg:col-span-4" control={<AppInput name="district" defaultValue={initial.district ?? ''} disabled={!detailsReady} aria-label="Bairro" />} />
        <FormField label="Cidade" className="lg:col-span-3" control={<AppInput name="city" defaultValue={initial.city ?? ''} disabled={!detailsReady} aria-label="Cidade" />} />
        <FormField label="UF" className="lg:col-span-1" control={<AppInput name="state" maxLength={2} defaultValue={initial.state ?? ''} disabled={!detailsReady} aria-label="UF" />} />
        {lookup && <p role={lookup.tone === 'danger' ? 'alert' : 'status'} aria-live="polite" className={`sm:col-span-2 lg:col-span-12 msg-base mb-0 ${lookup.tone === 'danger' ? 'msg-danger' : lookup.tone === 'success' ? 'msg-success' : 'msg-info'}`}>{lookup.text}</p>}
        {!detailsReady && <p className="sm:col-span-2 lg:col-span-12 msg-base mb-0 msg-warning">Campos adicionais de contabilidade aguardam a migration complementar. Nome, tipo, CPF/CNPJ, telefone, e-mail e controle continuam disponíveis.</p>}
      </FormSection>

      <FormSection title="Controle" description="Situação cadastral e observações internas." contentClassName="lg:grid-cols-12">
        <FormField label="Situação" className="lg:col-span-3" control={
          <AppSelect name="active" defaultValue={String(initial.active ?? true)} aria-label="Situação">
            <option value="true">Ativo</option><option value="false">Inativo</option>
          </AppSelect>
        } />
        <FormField label="Observações" hint="Observações sobre este contador ou escritório (opcional)." className="sm:col-span-2 lg:col-span-9" control={<AppTextarea name="notes" rows={2} defaultValue={initial.notes ?? ''} aria-label="Observações" />} />
        {!relationshipReady && <p className="sm:col-span-2 lg:col-span-12 msg-base mb-0 msg-warning">A classificação entre lead de parceria e parceiro será liberada após aplicar a migration de relacionamento comercial.</p>}
      </FormSection>

      <FormActions>
        <Link href="/contadores#cadastro" className="btn-base btn-secondary btn-md w-full sm:w-auto">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18" /></svg>
          Cancelar
        </Link>
        <AccountantSubmitButton editing={Boolean(initial.id)} />
      </FormActions>
    </form>
  )
}
