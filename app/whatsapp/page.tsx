import { createTenantClient } from '@/lib/tenant/authorized-client'
import { WhatsAppWorkspace, type WhatsAppLead } from '@/components/whatsapp-workspace'

type Product = { id: string; name: string }
type Seller = { id: string; name: string }
type ActivityRow = { id: string; person_id: string | null; kind: string; title: string; details: string | null; created_at: string }

export default async function WhatsAppPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const query = await searchParams
  const { supabase, tenant } = await createTenantClient()
  const [{ data: leads, error: leadsError }, { data: products }, { data: sellers }] = await Promise.all([
    supabase.from('leads').select('id,person_id,status,seller_id,interest_product_id,created_at').eq('company_id',tenant.companyId).order('created_at', { ascending: false }).limit(1000),
    supabase.from('products').select('id,name').eq('company_id',tenant.companyId).order('name'),
    supabase.from('sellers').select('id,name').eq('company_id',tenant.companyId).order('name'),
  ])

  const leadRows = leads ?? []
  const personIds = [...new Set(leadRows.map(lead => lead.person_id).filter((id): id is string => Boolean(id)))]
  const [{ data: people, error: peopleError }, { data: activities, error: activitiesError }] = personIds.length
    ? await Promise.all([
      supabase.from('people').select('id,name,trade_name,phone,whatsapp,email,business_activity,primary_cnae,opened_at').eq('company_id',tenant.companyId).in('id', personIds),
      supabase.from('activities').select('id,person_id,kind,title,details,created_at').eq('company_id',tenant.companyId).in('person_id', personIds).order('created_at', { ascending: false }).limit(2000),
    ])
    : [{ data: [], error: null }, { data: [], error: null }]

  const peopleById = new Map((people ?? []).map(person => [person.id, person]))
  const productNames = new Map(((products ?? []) as Product[]).map(product => [product.id, product.name]))
  const sellerNames = new Map(((sellers ?? []) as Seller[]).map(seller => [seller.id, seller.name]))
  const activityByPerson = new Map<string, ActivityRow[]>()
  for (const activity of activities ?? []) {
    if (!activity.person_id) continue
    const current = activityByPerson.get(activity.person_id) ?? []
    if (current.length < 5) current.push(activity)
    activityByPerson.set(activity.person_id, current)
  }

  const contacts: WhatsAppLead[] = leadRows.flatMap(lead => {
    const person = lead.person_id ? peopleById.get(lead.person_id) : null
    if (!person) return []
    return [{
      id: lead.id,
      personId: person.id,
      name: person.trade_name || person.name,
      legalName: person.name,
      phone: person.whatsapp || person.phone || '',
      email: person.email || '',
      activity: person.business_activity || person.primary_cnae || '',
      openedAt: person.opened_at || '',
      status: lead.status,
      sellerId: lead.seller_id || '',
      sellerName: lead.seller_id ? sellerNames.get(lead.seller_id) || 'Vendedor' : '',
      productId: lead.interest_product_id || '',
      productName: lead.interest_product_id ? productNames.get(lead.interest_product_id) || 'Produto/serviço' : '',
      createdAt: lead.created_at,
      activities: (activityByPerson.get(person.id) ?? []).map(item => ({ id: item.id, title: item.title, details: item.details || '', createdAt: item.created_at })),
    }]
  })

  const notice = query.notice === 'saved' ? { tone: 'success' as const, text: 'Interação adicionada ao histórico do lead com data e hora.' }
    : query.notice === 'status-failed' ? { tone: 'error' as const, text: 'A interação foi salva, mas não foi possível atualizar o status do lead.' }
    : query.notice === 'invalid' ? { tone: 'error' as const, text: 'Confira o título e o limite de 5.000 caracteres.' }
      : query.notice === 'save-failed' ? { tone: 'error' as const, text: 'Não foi possível registrar a interação. Tente novamente.' }
        : null

  return <WhatsAppWorkspace contacts={contacts} products={(products ?? []) as Product[]} notice={notice} loadError={Boolean(leadsError || peopleError || activitiesError)} />
}
