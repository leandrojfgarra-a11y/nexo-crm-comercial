import Link from 'next/link'
import { FunnelBoard, type FunnelCardView, type FunnelEventView, type FunnelOption, type FunnelStageView, type FunnelSubjectOption } from '@/components/funnel-board'
import { PageHeader, Panel, table, th, td } from '@/components/ui'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasOpportunityCommercialProfileSchema, hasSalesFunnelSchema, SALES_FUNNEL_PIPELINE_ID, SALES_FUNNEL_STAGES } from '@/lib/sales-funnel'
import { hasBusinessActivitySchema, hasCompleteAccountantSchema, hasCompleteCustomerSchema } from '@/lib/customer-schema'
import { hasProductCatalogSchema } from '@/lib/product-catalog'
import { resolveTenantContext } from '@/lib/tenant/context'

type SearchParams = Promise<{ q?: string; seller?: string; notice?: string }>

export default async function FunnelPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const supabase = await createAdminClient()
  const { companyId } = await resolveTenantContext(supabase)
  const ready = await hasSalesFunnelSchema(supabase)
  const profileReady = ready && await hasOpportunityCommercialProfileSchema(supabase)
  const customerSchemaReady = await hasCompleteCustomerSchema(supabase)
  const businessActivityReady = await hasBusinessActivitySchema(supabase)
  const accountantDetailsReady = await hasCompleteAccountantSchema(supabase)
  const productCatalogReady = await hasProductCatalogSchema(supabase)
  let stages: FunnelStageView[] = []
  let cards: FunnelCardView[] = []
  let subjects: FunnelSubjectOption[] = []
  let sellers: FunnelOption[] = []
  let products: FunnelOption[] = []
  let activeSellerRows: FunnelOption[] = []
  let dataError = false
  let dataErrorMessage = ''

  if (ready) {
    const [stageResult, leadResult, opportunityResult, sellerResult, productResult, customerResult] = await Promise.all([
      supabase.from('pipeline_stages').select('id,name,position,is_won').eq('pipeline_id', SALES_FUNNEL_PIPELINE_ID).eq('active', true).order('position'),
      supabase.from('leads').select('id,person_id,status,seller_id,interest_product_id,notes,created_at').eq('company_id', companyId).order('created_at', { ascending: false }).limit(500),
      supabase.from('opportunities').select(profileReady ? 'id,person_id,lead_id,customer_id,seller_id,product_id,title,installation_value,monthly_value,opened_at,expected_close_date,notes,stage_id,status,created_at,converted_at,monthly_due_day,implementation_owner,installation_date,training_date,trainings_needed,invoice_limit,system_version,nfce_version,mdfe_version,technical_notes,contract_status,boleto_delivery_method,installation_fee_status,installation_fee_payment_method,installation_fee_paid_at' : 'id,person_id,lead_id,customer_id,seller_id,product_id,title,installation_value,monthly_value,opened_at,expected_close_date,notes,stage_id,status,created_at').eq('company_id', companyId).eq('pipeline_id', SALES_FUNNEL_PIPELINE_ID).order('created_at', { ascending: false }).limit(1000),
      supabase.from('sellers').select('id,name,active').eq('company_id', companyId).order('name'),
      supabase.from('products').select(productCatalogReady ? 'id,name,active,kind,default_installation_value,default_monthly_value' : 'id,name,active').eq('company_id', companyId).order('name'),
      supabase.from('customers').select(customerSchemaReady ? 'id,person_id,status,accountant_id' : 'id,person_id,status').eq('company_id', companyId).order('created_at', { ascending: false }).limit(1000),
    ])
    stages = (stageResult.data ?? []) as FunnelStageView[]
    dataError = Boolean(stageResult.error || leadResult.error || opportunityResult.error || sellerResult.error || productResult.error || customerResult.error)
    const firstQueryError = stageResult.error || leadResult.error || opportunityResult.error || sellerResult.error || productResult.error || customerResult.error
    if (firstQueryError) dataErrorMessage = firstQueryError === customerResult.error
      ? `Falha ao consultar clientes: ${customerResult.error?.message ?? 'erro do Supabase.'}`
      : `Falha ao carregar dados do funil: ${firstQueryError.message}`
    if (!dataError && stages.length === SALES_FUNNEL_STAGES.length) {
      const leadRows = (leadResult.data ?? []) as any[]
      const allOpportunityRows = (opportunityResult.data ?? []) as any[]
      const opportunityRows = allOpportunityRows.filter(row => ['open','won'].includes(row.status))
      const customerRows = (customerResult.data ?? []) as any[]
      const sellerRows = sellerResult.data ?? []
      const productRows = (productResult.data ?? []) as any[]
      activeSellerRows = sellerRows.filter(item => item.active).map(item => ({ id: item.id, name: item.name }))
      products = (productRows as any[]).filter(item => item.active).map(item => ({
        id: item.id, name: item.name, kind: item.kind,
        defaultInstallationValue: item.default_installation_value == null ? null : Number(item.default_installation_value),
        defaultMonthlyValue: item.default_monthly_value == null ? null : Number(item.default_monthly_value),
      }))
      const personIds = [...new Set([
        ...customerRows.map(row => row.person_id).filter(Boolean),
        ...leadRows.map(row => row.person_id).filter(Boolean),
        ...opportunityRows.map(row => row.person_id).filter(Boolean),
      ])] as string[]
      const { data: people, error: peopleError } = personIds.length
        ? await supabase.from('people').select(['id,name,trade_name,email,phone,mobile_phone,whatsapp,tax_id,address_line,address_number,address_extra,district,city,state,postal_code',customerSchemaReady ? 'state_registration,municipal_registration,tax_regime' : '',businessActivityReady ? 'business_activity' : ''].filter(Boolean).join(',')).eq('company_id', companyId).in('id', personIds)
        : { data: [], error: null }
      const opportunityIds = opportunityRows.map(row => row.id)
      const { data: eventRows, error: eventError } = opportunityIds.length
        ? await supabase.from('opportunity_events').select('id,opportunity_id,event_type,old_value,new_value,note,actor_id,created_at').eq('company_id', companyId).in('opportunity_id', opportunityIds).order('created_at', { ascending: false }).limit(1200)
        : { data: [], error: null }
      const [activityResult, productLinkResult] = await Promise.all([
        opportunityIds.length ? supabase.from('activities').select('id,opportunity_id,person_id,kind,title,details,created_by,created_at').eq('company_id', companyId).in('opportunity_id', opportunityIds).order('created_at', { ascending: false }).limit(1500) : Promise.resolve({ data: [], error: null }),
        profileReady && opportunityIds.length ? supabase.from('opportunity_products').select('opportunity_id,product_id').eq('company_id', companyId).in('opportunity_id', opportunityIds) : Promise.resolve({ data: [], error: null }),
      ])
      const accountantIds = [...new Set(((customerResult.data ?? []) as Array<Record<string, any>>).map(row => row.accountant_id).filter(Boolean))] as string[]
      const accountantColumns = accountantDetailsReady ? 'id,name,trade_name,contact_name,email,phone,mobile_phone,whatsapp,address_line,address_number,address_extra,district,city,state,postal_code' : 'id,name,email,phone'
      const { data: accountantRows, error: accountantError } = customerSchemaReady && accountantIds.length
        ? await supabase.from('accountants').select(accountantColumns).eq('company_id', companyId).in('id', accountantIds)
        : { data: [], error: null }
      dataError = Boolean(peopleError || eventError || activityResult.error || productLinkResult.error || accountantError)
      const detailQueryError = peopleError || eventError || activityResult.error || productLinkResult.error || accountantError
      if (detailQueryError) dataErrorMessage = peopleError
        ? `Falha ao consultar os dados das pessoas vinculadas a clientes e leads: ${peopleError.message}`
        : `Falha ao carregar detalhes do funil: ${detailQueryError.message}`
      if (!dataError) {
        const personRows = (people ?? []) as any[]
        const personMap = new Map(personRows.map(row => [row.id, row]))
        const customerByPerson = new Map(customerRows.map(row => [row.person_id, row]))
        const leadById = new Map(leadRows.map(row => [row.id, row]))
        const sellerMap = new Map(sellerRows.map(row => [row.id, row.name]))
        const productMap = new Map(productRows.map((row: any) => [row.id, row.name]))
        const stageMap = new Map(stages.map(row => [row.id, row]))
        const accountantMap = new Map(((accountantRows ?? []) as any[]).map(row => [row.id, row]))
        const additionalByOpportunity = new Map<string, string[]>()
        for (const row of (productLinkResult.data ?? []) as any[]) additionalByOpportunity.set(row.opportunity_id, [...(additionalByOpportunity.get(row.opportunity_id) ?? []), row.product_id])
        const linkedPeople = new Set(opportunityRows.map(row => row.person_id))
        const linkedLeads = new Set(allOpportunityRows.map(row => row.lead_id).filter(Boolean))
        const search = (params.q ?? '').trim().toLocaleLowerCase('pt-BR')
        const sellerFilter = params.seller ?? ''

        for (const lead of leadRows) {
          if (!lead.person_id || ['converted','lost'].includes(lead.status) || linkedLeads.has(lead.id) || linkedPeople.has(lead.person_id)) continue
          if (sellerFilter && lead.seller_id !== sellerFilter) continue
          const person = personMap.get(lead.person_id)
          if (!person) continue
          const name = person.trade_name || person.name
          const productId = lead.interest_product_id ?? ''
          const haystack = [name,person.name,productMap.get(productId) ?? '',sellerMap.get(lead.seller_id) ?? ''].join(' ').toLocaleLowerCase('pt-BR')
          if (search && !haystack.includes(search)) continue
          const firstStage = stages.find(stage => stage.name === 'Leads')
          if (!firstStage) continue
          cards.push({
            id: lead.id, leadId: lead.id, type: 'lead', personId: lead.person_id, subjectId: lead.id, subjectType: 'lead',
            subjectLabel: name, sellerName: sellerMap.get(lead.seller_id) ?? '', sellerId: lead.seller_id ?? '',
            productName: productMap.get(productId) ?? '', productId,
            title: person.name, installationValue: null, monthlyValue: null,
            openedAt: String(lead.created_at).slice(0,10), expectedCloseDate: '', notes: lead.notes ?? '',
            stageId: firstStage.id, status: 'open',
            details: person as any,
          })
          subjects.push({ value: 'lead:' + lead.id, label: 'Lead · ' + (person.trade_name && person.trade_name !== person.name ? person.trade_name + ' — ' + person.name : person.name) })
        }

        for (const customer of customerRows) {
          const person = personMap.get(customer.person_id)
          if (person) subjects.push({ value: 'customer:' + customer.id, label: 'Cliente · ' + (person.trade_name && person.trade_name !== person.name ? person.trade_name + ' — ' + person.name : person.name) + (customer.status === 'active' ? '' : ' · inativo') })
        }

        for (const opportunity of opportunityRows) {
          const stage = stageMap.get(opportunity.stage_id)
          const person = personMap.get(opportunity.person_id)
          if (!stage || !person) continue
          const inferredCustomer = opportunity.customer_id ? customerRows.find(row => row.id === opportunity.customer_id) : customerByPerson.get(opportunity.person_id)
          const linkedLead = opportunity.lead_id ? leadById.get(opportunity.lead_id) : leadRows.find(row => row.person_id === opportunity.person_id)
          const subjectType: 'lead' | 'customer' | 'person' = opportunity.lead_id || (!inferredCustomer && linkedLead) ? 'lead' : inferredCustomer ? 'customer' : 'person'
          const subjectId = opportunity.lead_id ?? (inferredCustomer?.id ?? linkedLead?.id ?? opportunity.person_id)
          const label = person.trade_name || person.name
          const haystack = [label,person.name,opportunity.title,productMap.get(opportunity.product_id) ?? '',sellerMap.get(opportunity.seller_id) ?? ''].join(' ').toLocaleLowerCase('pt-BR')
          if (search && !haystack.includes(search)) continue
          if (sellerFilter && opportunity.seller_id !== sellerFilter) continue
          cards.push({
            id: opportunity.id, type: 'opportunity', leadId: opportunity.lead_id ?? undefined,
            subjectId, subjectType, personId: opportunity.person_id, subjectLabel: label,
            sellerName: sellerMap.get(opportunity.seller_id) ?? '', sellerId: opportunity.seller_id ?? '',
            productName: productMap.get(opportunity.product_id) ?? '', productId: opportunity.product_id ?? '',
            title: opportunity.title, installationValue: opportunity.installation_value == null ? null : Number(opportunity.installation_value),
            monthlyValue: opportunity.monthly_value == null ? null : Number(opportunity.monthly_value),
            openedAt: opportunity.opened_at ?? String(opportunity.created_at).slice(0,10),
            expectedCloseDate: opportunity.expected_close_date ?? '', notes: opportunity.notes ?? '',
            stageId: opportunity.stage_id, status: opportunity.status,
            history: (((eventRows ?? []) as any[]).filter(event => event.opportunity_id === opportunity.id).slice(0, 8)) as FunnelEventView[],
            activities: (((activityResult.data ?? []) as any[]).filter(item => item.opportunity_id === opportunity.id && item.person_id === opportunity.person_id)) as any[],
            additionalProductIds: additionalByOpportunity.get(opportunity.id) ?? [],
            details: {
              ...person, customerId: inferredCustomer?.id ?? null,
              accountant: inferredCustomer?.accountant_id ? accountantMap.get(inferredCustomer.accountant_id) ?? null : null,
              convertedAt: opportunity.converted_at ?? '', monthlyDueDay: opportunity.monthly_due_day ?? '',
              implementationOwner: opportunity.implementation_owner ?? '', installationDate: opportunity.installation_date ?? '',
              trainingDate: opportunity.training_date ?? '', trainingsNeeded: opportunity.trainings_needed ?? '', invoiceLimit: opportunity.invoice_limit ?? '',
              systemVersion: opportunity.system_version ?? '', nfceVersion: opportunity.nfce_version ?? '', mdfeVersion: opportunity.mdfe_version ?? '', technicalNotes: opportunity.technical_notes ?? '',
              contractStatus: opportunity.contract_status ?? 'pending', boletoDeliveryMethod: opportunity.boleto_delivery_method ?? '',
              installationFeeStatus: opportunity.installation_fee_status ?? 'pending', installationFeePaymentMethod: opportunity.installation_fee_payment_method ?? '', installationFeePaidAt: opportunity.installation_fee_paid_at ?? '',
              taxRegime: person.tax_regime ?? '', businessActivity: person.business_activity ?? '', stateRegistration: person.state_registration ?? '', municipalRegistration: person.municipal_registration ?? '',
            },
          })
        }
      }
    }
    if (ready && !dataError) sellers = activeSellerRows
  }

  return (
    <div>
      <PageHeader eyebrow="CRM · Pipeline" title="Funil de vendas" subtitle="Acompanhe os negócios, avance leads e registre cada mudança de etapa." action="Nova oportunidade" href="#nova-oportunidade" />
      {params.notice === 'lead-negotiation-started' && <p role="status" className="msg-base mt-4 msg-success">Cliente criado com os dados do lead. A oportunidade foi aberta em 1º contato e o registro original do lead foi preservado.</p>}
      {!ready && <div role="alert" className="msg-base mt-4 msg-warning">O funil está em modo de leitura bloqueada porque a migration 202610310004_sales_funnel ainda não está aplicada ou as sete etapas não estão configuradas. Nenhuma gravação foi habilitada.</div>}
      {dataError && <div role="alert" className="msg-base mt-4 msg-danger">{dataErrorMessage || 'Não foi possível carregar os dados do funil. Confira o schema e as políticas RLS.'}</div>}
      {ready && !dataError && <>
        <form method="get" className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          <label className="flex flex-col gap-1 text-sm font-medium text-ink sm:col-span-2 lg:col-span-2 xl:col-span-3">
            Buscar cartão
            <input name="q" defaultValue={params.q ?? ''} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-blue focus:ring-2 focus:ring-blue/15" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-ink sm:col-span-1 lg:col-span-1 xl:col-span-2">
            Vendedor
            <select name="seller" defaultValue={params.seller ?? ''} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-blue focus:ring-2 focus:ring-blue/15"><option value="">Todos os vendedores</option>{sellers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          </label>
          <div className="flex items-end gap-2 sm:col-span-1 lg:col-span-1 xl:col-span-1">
            <button type="submit" className="btn-base btn-primary btn-md">Filtrar</button>
            <Link href="/funil" className="btn-base btn-secondary btn-md">Limpar</Link>
          </div>
        </form>
        <section id="kanban" aria-label="Etapas do funil">
          <FunnelBoard stages={stages} cards={cards} subjects={subjects} sellers={sellers} products={products} today={new Date().toISOString().slice(0,10)} profileReady={profileReady} accountantDetailsReady={accountantDetailsReady} />
        </section>
      </>}
    </div>
  )
}
