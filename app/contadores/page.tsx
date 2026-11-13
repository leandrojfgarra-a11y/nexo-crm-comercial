import Link from 'next/link'
import { AccountantForm, type AccountantFormValues } from '@/components/accountant-form'
import { PageHeader, Panel, table, th, td } from '@/components/ui'
import { hasAccountantRelationshipSchema, hasCompleteAccountantSchema } from '@/lib/customer-schema'
import { createAdminClient } from '@/lib/supabase/admin'
import { messageForAccountantRelationship } from '@/lib/whatsapp-messages'
import { resolveTenantContext, TenantContextError } from '@/lib/tenant/context'

type Params = Promise<{ edit?: string; notice?: string; relationship?: string }>
const notices: Record<string, string> = { created: 'Contabilidade cadastrada.', updated: 'Cadastro da contabilidade atualizado.', 'not-found': 'A contabilidade não existe ou não pertence a esta empresa.', invalid: 'Confira o tipo e o nome informado.', 'tax-invalid': 'CPF/CNPJ inválido.', 'email-invalid': 'E-mail inválido.', duplicate: 'Já existe uma contabilidade cadastrada com este documento.', 'save-error': 'Não foi possível salvar. Confira o schema e as políticas administrativas.' }
const phoneForWhatsApp = (value: string) => {
  let digits = value.replace(/\D/g, '')
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`
  return digits.length >= 12 && digits.length <= 15 ? digits : ''
}
const accountantPhone = (item: AccountantFormValues) => [item.whatsapp, item.mobile_phone, item.phone].map(value => phoneForWhatsApp(value ?? '')).find(Boolean) ?? ''

export default async function AccountantsPage({ searchParams }: { searchParams: Params }) {
  const params = await searchParams
  const supabase = await createAdminClient()
  let tenant: Awaited<ReturnType<typeof resolveTenantContext>>
  try {
    tenant = await resolveTenantContext(supabase)
  } catch (error) {
    if (!(error instanceof TenantContextError)) throw error
    return (
      <div>
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
    <div>
      <PageHeader
        eyebrow="Relacionamento"
        title="Contadores e escritórios"
        subtitle="Mantenha um cadastro centralizado e vincule a mesma contabilidade a vários clientes."
        action="Nova contabilidade"
        href="#cadastro"
      />

      {params.notice && <p role="status" className="msg-base mt-4 msg-success">{notices[params.notice] ?? params.notice}</p>}
      {error && <p role="alert" className="msg-base mt-4 msg-danger">Cadastro de contabilidades indisponível. Confirme a migration inicial e as permissões administrativas.</p>}
      {!detailsReady && <p className="msg-base mt-4 msg-warning">Campos de contato e endereço completo aguardam a migration complementar local. Nenhum SQL foi executado.</p>}
      {!relationshipReady && <p className="msg-base mt-4 msg-warning">As abas Leads e Parceiros e as mensagens por relacionamento serão liberadas após aplicar manualmente a migration de classificação. Os cadastros existentes permanecem preservados.</p>}

      {!error && (
        <>
          <Panel title="Contabilidades cadastradas" aside={`${accountants.length} registros`}>
            <nav aria-label="Filtrar contabilidades por relacionamento" className="flex flex-wrap gap-2 border-b border-slate-200 p-4 sm:grid-cols-4">
              {[
                { id: 'lead', label: `Leads (${leadCount})` }, { id: 'partner', label: `Parceiros (${partnerCount})` }, { id: 'unclassified', label: `Sem classificação (${unclassifiedCount})` }, { id: 'all', label: `Todos (${allAccountants.length})` },
              ].map(view => (
                <Link
                  key={view.id}
                  href={`/contadores?relationship=${view.id}`}
                  aria-current={relationship === view.id ? 'page' : undefined}
                  className={`btn-base btn-secondary btn-sm ${relationship === view.id ? 'bg-blue text-white border-blue' : 'border-transparent hover:bg-slate-50 text-ink'} ${!relationshipReady && view.id !== 'all' ? 'pointer-events-none opacity-50' : ''}`}
                >
                  {view.label}
                </Link>
              ))}
            </nav>

            {!accountants.length ? (
              <p className="p-6 text-center text-sm text-muted">Nenhuma contabilidade nesta aba.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className={`${table} w-full min-w-[1000px]`}>
                  <thead>
                    <tr>{['Contador / escritório','Contato responsável','CPF/CNPJ','Telefone / WhatsApp','E-mail','Relacionamento','Situação','Ações'].map(name => <th key={name} className={th}>{name}</th>)}</tr>
                  </thead>
                  <tbody>
                    {accountants.map(item => {
                      const phone = accountantPhone(item)
                      const greetingName = item.contact_name || item.trade_name || item.name || 'tudo bem'
                      const message = messageForAccountantRelationship(item.relationship_type, { contactName: greetingName, companyName: item.trade_name || item.name })
                      const whatsappHref = phone ? `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}` : null
                      const relationshipName = item.relationship_type === 'partner' ? 'Parceiro' : item.relationship_type === 'lead' ? 'Lead' : 'Sem classificação'
                      return (
                        <tr key={item.id} className="border-t border-slate-100 hover:bg-slate-50/50 transition-colors">
                          <td className={`${td} font-semibold`}>
                            {item.name}
                            {item.trade_name && <span className="block text-xs font-normal text-muted">{item.trade_name}</span>}
                          </td>
                          <td className={td}>{item.contact_name ?? '—'}</td>
                          <td className={td}>{item.tax_id ?? '—'}</td>
                          <td className={td}>{[item.phone, item.mobile_phone, item.whatsapp].filter(Boolean).join(' · ') || '—'}</td>
                          <td className={td}>{item.email ?? '—'}</td>
                          <td className={td}>
                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.relationship_type === 'partner' ? 'bg-blue-50 text-blue-800' : item.relationship_type === 'lead' ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{relationshipName}</span>
                          </td>
                          <td className={td}>
                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.active ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{item.active ? 'Ativo' : 'Inativo'}</span>
                          </td>
                          <td className={`${td} crm-action-group`}>
                            <Link href={`/contadores?edit=${item.id}&relationship=${relationship}#cadastro`} className="btn-base btn-secondary btn-sm">Editar</Link>
                            {whatsappHref ? (
                              <a href={whatsappHref} target="_blank" rel="noopener noreferrer" data-nexo-whatsapp-link="true" className="btn-base btn-success btn-sm">Abrir WhatsApp</a>
                            ) : (
                              <span className="text-xs text-muted" title="Cadastre um telefone com DDD">Sem telefone válido</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <section id="cadastro" className="mt-6 card-base p-5">
            <PageHeader
              eyebrow="Cadastro central"
              title={editing ? 'Editar contabilidade' : 'Nova contabilidade'}
              subtitle={initial?.name ?? 'Cadastre o profissional ou escritório contábil.'}
            />
            <AccountantForm initial={initial ?? {}} detailsReady={detailsReady} relationshipReady={relationshipReady} />
          </section>
        </>
      )}
    </div>
  )
}
