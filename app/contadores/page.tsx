import Link from 'next/link'
import { AccountantForm, type AccountantFormValues } from '@/components/accountant-form'
import { PageHeader } from '@/components/ui'
import { hasAccountantRelationshipSchema, hasCompleteAccountantSchema } from '@/lib/customer-schema'
import { createAdminClient } from '@/lib/supabase/admin'
import { messageForAccountantRelationship } from '@/lib/whatsapp-messages'
import { resolveTenantContext, TenantContextError } from '@/lib/tenant/context'
import { formatAccountantDocument } from '@/lib/accountant-documents'
import styles from './accountants.module.css'

type Params = Promise<{ edit?: string; notice?: string; relationship?: string }>
const notices: Record<string, string> = { created: 'Contabilidade cadastrada.', updated: 'Cadastro da contabilidade atualizado.', 'not-found': 'A contabilidade não existe ou não pertence a esta empresa.', invalid: 'Confira o tipo e o nome informado.', 'tax-required': 'CNPJ obrigatório para pessoa jurídica.', 'tax-invalid': 'CPF/CNPJ inválido.', 'email-invalid': 'E-mail inválido.', duplicate: 'Já existe uma contabilidade cadastrada com este documento.', 'save-error': 'Não foi possível salvar. Confira o schema e as políticas administrativas.' }
const phoneForWhatsApp = (value: string) => {
  let digits = value.replace(/\D/g, '')
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`
  return digits.length >= 12 && digits.length <= 15 ? digits : ''
}
const accountantPhone = (item: AccountantFormValues) => [item.whatsapp, item.mobile_phone, item.phone].map(value => phoneForWhatsApp(value ?? '')).find(Boolean) ?? ''

export default async function AccountantsPage({ searchParams }: { searchParams: Params }) {
  const params = await searchParams
  const noticeIsSuccess = params.notice === 'created' || params.notice === 'updated'
  const supabase = await createAdminClient()
  let tenant: Awaited<ReturnType<typeof resolveTenantContext>>
  try {
    tenant = await resolveTenantContext(supabase)
  } catch (error) {
    if (!(error instanceof TenantContextError)) throw error
    return (
      <div className={styles.page}>
        <PageHeader
          eyebrow="Relacionamento"
          title="Contadores e escritórios"
          subtitle="Mantenha um cadastro centralizado e vincule a mesma contabilidade a vários clientes."
        />
        <p role="alert" className="msg-base mt-4 msg-danger">{error.message} Nenhum cadastro foi carregado.</p>
      </div>
    )
  }
  const [detailsReady, relationshipReady] = await Promise.all([hasCompleteAccountantSchema(supabase), hasAccountantRelationshipSchema(supabase)])
  const columns = [
    'id,kind,name,tax_id,email,phone,notes,active',
    detailsReady ? 'trade_name,contact_name,mobile_phone,whatsapp,postal_code,address_line,address_number,address_extra,district,city,state' : '',
    relationshipReady ? 'relationship_type' : '',
  ].filter(Boolean).join(',')
  const { data: accountantRows, error } = await supabase.from('accountants')
    .select(columns).eq('company_id', tenant.companyId).order('name')
  const allAccountants = (accountantRows ?? []) as unknown as AccountantFormValues[]
  const relationship = relationshipReady && ['lead', 'partner', 'unclassified', 'all'].includes(params.relationship ?? '') ? params.relationship! : relationshipReady ? 'lead' : 'all'
  const accountants = relationship === 'all' ? allAccountants : relationship === 'unclassified'
    ? allAccountants.filter(item => !item.relationship_type)
    : allAccountants.filter(item => item.relationship_type === relationship)
  const editing = params.edit ? allAccountants.find(item => item.id === params.edit) : null
  const initial = editing as unknown as AccountantFormValues | null
  const leadCount = allAccountants.filter(item => item.relationship_type === 'lead').length
  const partnerCount = allAccountants.filter(item => item.relationship_type === 'partner').length
  const unclassifiedCount = allAccountants.filter(item => !item.relationship_type).length

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Relacionamento</p>
          <h1 className={styles.pageTitle}>Contadores e escritórios</h1>
          <p className={styles.pageSubtitle}>Mantenha um cadastro centralizado e vincule a mesma contabilidade a vários clientes.</p>
        </div>
        <Link href="#cadastro" className="btn-base btn-primary btn-sm">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          Nova contabilidade
        </Link>
      </header>

      {params.notice && <p role={noticeIsSuccess ? 'status' : 'alert'} className={`${styles.notice} ${noticeIsSuccess ? styles.noticeSuccess : styles.noticeDanger}`}>{notices[params.notice] ?? params.notice}</p>}
      {error && <p role="alert" className={`${styles.notice} ${styles.noticeDanger}`}>Cadastro de contabilidades indisponível. Confirme a migration inicial e as permissões administrativas.</p>}
      {!detailsReady && <p className={`${styles.notice} ${styles.noticeWarning}`}>Campos de contato e endereço completo aguardam a migration complementar local. Nenhum SQL foi executado.</p>}
      {!relationshipReady && <p className={`${styles.notice} ${styles.noticeWarning}`}>As abas Leads e Parceiros e as mensagens por relacionamento serão liberadas após aplicar manualmente a migration de classificação. Os cadastros existentes permanecem preservados.</p>}

      {!error && (
        <>
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2>Contabilidades cadastradas</h2>
              <span>{accountants.length} registros</span>
            </div>
            <nav aria-label="Filtrar contabilidades por relacionamento" className={styles.filters}>
              {[
                { id: 'lead', label: `Leads (${leadCount})` }, { id: 'partner', label: `Parceiros (${partnerCount})` }, { id: 'unclassified', label: `Sem classificação (${unclassifiedCount})` }, { id: 'all', label: `Todos (${allAccountants.length})` },
              ].map(view => (
                <Link
                  key={view.id}
                  href={`/contadores?relationship=${view.id}`}
                  aria-current={relationship === view.id ? 'page' : undefined}
                  className={`btn-base btn-secondary btn-sm ${relationship === view.id ? 'bg-blue text-white border-blue' : 'border-transparent hover:bg-slate-50 text-ink'} ${!relationshipReady && view.id !== 'all' ? 'pointer-events-none opacity-50' : ''}`}
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    {view.id === 'lead' ? <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></> : view.id === 'partner' ? <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="m16 11 2 2 4-4" /></> : view.id === 'unclassified' ? <><circle cx="12" cy="12" r="9" /><path d="M12 8v4m0 4h.01" /></> : <><circle cx="9" cy="7" r="4" /><path d="M2 21a7 7 0 0 1 14 0m1-9h5m-2.5-2.5v5" /></>}
                  </svg>
                  {view.label}
                </Link>
              ))}
            </nav>

            {!accountants.length ? (
              <div className="px-4 py-6 text-center">
                <div className={styles.emptyIcon}>
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </div>
                <p className="text-xs font-medium text-ink">{allAccountants.length === 0 ? 'Nenhuma contabilidade cadastrada.' : 'Nenhuma contabilidade nesta aba.'}</p>
                <p className="mt-0.5 text-[11px] text-muted">{allAccountants.length === 0 ? 'Cadastre um contador ou escritório para começar.' : 'Não há registros para o filtro selecionado.'}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className={styles.table}>
                  <thead>
                    <tr>{['Contador / escritório','Documento','Contato','Relacionamento','Situação','Ações'].map(name => <th key={name}>{name}</th>)}</tr>
                  </thead>
                  <tbody>
                    {accountants.map(item => {
                      const phone = accountantPhone(item)
                      const greetingName = item.contact_name || item.trade_name || item.name || 'tudo bem'
                      const message = messageForAccountantRelationship(item.relationship_type, { contactName: greetingName, companyName: item.trade_name || item.name })
                      const whatsappHref = phone ? `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}` : null
                      const relationshipName = item.relationship_type === 'partner' ? 'Parceiro' : item.relationship_type === 'lead' ? 'Lead' : 'Sem classificação'
                      return (
                        <tr key={item.id}>
                          <td className={styles.nameCell}>
                            <span className="text-[13px]">{item.name}</span>
                            {item.trade_name && <span className="block text-[11px] font-normal text-muted">{item.trade_name}</span>}
                            <span className="mt-0.5 block text-[10px] font-normal text-muted">{item.kind === 'office' ? 'Pessoa jurídica · escritório' : 'Pessoa física · contador individual'}</span>
                          </td>
                          <td className={styles.documentCell}>{formatAccountantDocument(item.tax_id, item.kind) || '—'}</td>
                          <td className={styles.contactCell}>
                            <div className="space-y-0.5 text-xs">
                              {item.contact_name && <span className="block font-medium">{item.contact_name}</span>}
                              {item.phone && <span className="block whitespace-nowrap">Telefone: {item.phone}</span>}
                              {item.mobile_phone && <span className="block whitespace-nowrap">Celular: {item.mobile_phone}</span>}
                              {item.whatsapp && <span className="block whitespace-nowrap">WhatsApp: {item.whatsapp}</span>}
                              {item.email && <span className="block break-all">{item.email}</span>}
                              {!item.contact_name && !item.phone && !item.mobile_phone && !item.whatsapp && !item.email && <span className="text-muted">—</span>}
                            </div>
                          </td>
                          <td>
                            <span className={`badge ${item.relationship_type === 'partner' ? 'badge-info' : item.relationship_type === 'lead' ? 'badge-success' : 'badge-neutral'}`}>{relationshipName}</span>
                          </td>
                          <td>
                            <span className={`badge ${item.active ? 'badge-success' : 'badge-neutral'}`}>{item.active ? 'Ativo' : 'Inativo'}</span>
                          </td>
                          <td>
                            <div className="crm-action-group flex flex-wrap gap-1">
                              <Link href={`/contadores?edit=${item.id}&relationship=${relationship}#cadastro`} className="btn-base btn-secondary btn-sm">
                                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m14 5 5 5M4 20l4.5-1 10-10a2.12 2.12 0 0 0-3-3l-10 10L4 20Z" /></svg>
                                Editar
                              </Link>
                              {whatsappHref ? (
                                <a href={whatsappHref} target="_blank" rel="noopener noreferrer" data-nexo-whatsapp-link="true" className="btn-base btn-success btn-sm">
                                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 11.5a8.4 8.4 0 0 1-12.4 7.4L4 20l1.1-3.4A8.5 8.5 0 1 1 20 11.5Z" /><path d="M8.5 8.5c.3 2.2 2.8 4.7 5 5l1.2-1.2 2 1c-.2 1.5-1.2 2.2-2.5 2.2-3.4-.3-6.5-3.4-6.8-6.8 0-1.3.7-2.3 2.2-2.5l1 2-1.1 1.3Z" /></svg>
                                  Abrir WhatsApp
                                </a>
                              ) : (
                                <span className="text-[11px] text-muted" title="Cadastre um telefone com DDD">Sem telefone válido</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section id="cadastro" className={`${styles.formPanel} mt-3`}>
            <header className={styles.formHeader}>
              <p className={styles.eyebrow}>Cadastro central</p>
              <h2>{editing ? 'Editar contabilidade' : 'Nova contabilidade'}</h2>
              <p>{initial?.name ?? 'Cadastre o profissional ou escritório contábil.'}</p>
            </header>
            <AccountantForm initial={initial ?? {}} detailsReady={detailsReady} relationshipReady={relationshipReady} />
          </section>
        </>
      )}
    </div>
  )
}
