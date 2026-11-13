import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { PrintButton } from '@/components/print-button'
import { hasProposalBrandingSchema, hasProposalPricingSchema } from '@/lib/proposal-schema'
import { resolveTenantContext } from '@/lib/tenant/context'

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default async function ProposalPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createAdminClient()
  const { companyId } = await resolveTenantContext(supabase)
  const db = supabase as any
  const [pricingReady, brandingReady] = await Promise.all([hasProposalPricingSchema(supabase), hasProposalBrandingSchema(supabase)])
  const { data: proposal } = await supabase.from('proposals').select('id,customer_id,proposal_number,status,valid_until,current_version').eq('id', id).eq('company_id', companyId).maybeSingle()
  if (!proposal || !proposal.current_version) notFound()
  const [{ data: customer }, { data: version }] = await Promise.all([
    supabase.from('customers').select('id,person_id').eq('company_id', companyId).eq('id', proposal.customer_id).maybeSingle(),
    db.from('proposal_versions').select(['id','version','title','terms','currency','subtotal','discount','total', ...(pricingReady ? ['monthly_total'] : []), ...(brandingReady ? ['brand_name','brand_tagline','logo_url','intro_text','first_billing_date','consultant_name','consultant_phone','consultant_email','consultant_city'] : [])].join(',')).eq('company_id', companyId).eq('proposal_id', id).eq('version', proposal.current_version).maybeSingle(),
  ])
  if (!customer || !version) notFound()
  const [{ data: person }, { data: items }] = await Promise.all([
    supabase.from('people').select('name,trade_name,email,phone,tax_id,address_line,address_number,address_extra,district,city,state,postal_code').eq('company_id', companyId).eq('id', customer.person_id).maybeSingle(),
    db.from('proposal_items').select(['description','quantity','unit_price','line_total','position', ...(pricingReady ? ['installation_unit_price','extra_description','extra_unit_price','monthly_unit_price','monthly_line_total'] : []), ...(brandingReady ? ['optional'] : [])].join(',')).eq('company_id', companyId).eq('version_id', version.id).order('position'),
  ])
  if (!person) notFound()
  const address = [person.address_line, person.address_number, person.address_extra, person.district, person.city, person.state, person.postal_code].filter(Boolean).join(', ')
  const normalizedItems = (items ?? []).map((item: any) => {
    const pricing = item as typeof item & { installation_unit_price?: number | string | null; extra_description?: string | null; extra_unit_price?: number | string | null; monthly_unit_price?: number | string | null }
    return { ...pricing, installation_unit_price: pricing.installation_unit_price ?? pricing.unit_price, extra_description: pricing.extra_description ?? null, extra_unit_price: pricing.extra_unit_price ?? 0, monthly_unit_price: pricing.monthly_unit_price ?? 0, optional: Boolean((item as any).optional) }
  })
  const monthlyTotal = Number((version as typeof version & { monthly_total?: number | string | null }).monthly_total ?? 0)
  const branding = version as typeof version & { brand_name?: string | null; brand_tagline?: string | null; logo_url?: string | null; intro_text?: string | null; first_billing_date?: string | null; consultant_name?: string | null; consultant_phone?: string | null; consultant_email?: string | null; consultant_city?: string | null }
  return <main className="proposal-print mx-auto max-w-4xl p-6 text-slate-900 print:max-w-none print:p-0">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden"><Link href={`/propostas/${id}`} className="text-sm font-semibold text-blue hover:underline">← Voltar para proposta</Link><PrintButton /></div>
    <article className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none">
      <header className="flex flex-wrap items-start justify-between gap-5 border-b border-cyan-700 pb-6"><div className="flex items-center gap-4">{branding.logo_url && <img src={branding.logo_url} alt={`Logo ${branding.brand_name || 'da empresa'}`} className="max-h-16 max-w-52 object-contain" />}<div><p className="text-xl font-bold uppercase tracking-wide text-slate-800">{branding.brand_name || 'Nexo CRM'}</p>{branding.brand_tagline && <p className="text-sm italic text-slate-500">{branding.brand_tagline}</p>}</div></div><div className="text-right"><p className="font-bold uppercase tracking-wide text-cyan-700">Proposta comercial</p><p className="text-sm text-slate-500">Personalizada e exclusiva</p></div></header>
      <div className="my-5 flex flex-wrap items-start justify-between gap-4 rounded-lg bg-slate-800 px-6 py-5 text-white"><div><p className="text-sm text-slate-200">A/C {person.trade_name || person.name}</p>{person.trade_name && <p className="text-sm text-slate-300">{person.name}</p>}<p className="mt-2 text-sm text-slate-200">{[person.email, person.phone].filter(Boolean).join(' · ')}</p>{address && <p className="text-sm text-slate-200">{address}</p>}</div><div className="text-sm"><p className="font-semibold text-amber-300">CNPJ / CPF</p><p>{person.tax_id || 'Não informado'}</p></div></div>
      {branding.intro_text && <p className="my-6 text-base leading-6">{branding.intro_text}</p>}
      <h2 className="mb-2 font-bold uppercase tracking-wide text-cyan-700">Investimento detalhado</h2>
      <table className="w-full border-collapse text-left text-sm"><thead><tr className="border-y border-slate-300 text-xs uppercase"><th className="py-3">Item / taxa extra</th><th className="py-3 text-right">Qtd.</th><th className="py-3 text-right">Instalação unitária</th><th className="py-3 text-right">Taxa extra unitária</th><th className="py-3 text-right">Mensalidade unitária</th><th className="py-3 text-right">Implantação do item</th><th className="py-3 text-right">Mensalidade do item</th></tr></thead><tbody>{normalizedItems.map((item: any,index: number)=><tr key={index} className="border-b border-slate-200"><td className="py-3 pr-3">{item.optional && <span className="mb-1 block text-xs font-bold uppercase text-amber-700">Opcional</span>}{item.description}{item.extra_description && <span className="block text-xs text-slate-600">Extra: {item.extra_description}</span>}</td><td className="py-3 text-right">{Number(item.quantity).toLocaleString('pt-BR')}</td><td className="py-3 text-right">{money(Number(item.installation_unit_price))}</td><td className="py-3 text-right">{money(Number(item.extra_unit_price))}</td><td className="py-3 text-right">{money(Number(item.monthly_unit_price))}</td><td className="py-3 text-right">{money(Number(item.quantity)*(Number(item.installation_unit_price)+Number(item.extra_unit_price)))}</td><td className="py-3 text-right">{money(Number(item.quantity)*Number(item.monthly_unit_price))}</td></tr>)}</tbody></table>
      <section className="ml-auto mt-5 grid max-w-xs gap-2 text-sm"><div className="flex justify-between"><span>Subtotal de implantação</span><strong>{money(Number(version.subtotal))}</strong></div><div className="flex justify-between"><span>Desconto na implantação</span><strong>{money(Number(version.discount))}</strong></div><div className="flex justify-between border-t border-slate-300 pt-2 text-lg"><span>Total de implantação</span><strong>{money(Number(version.total))}</strong></div><div className="flex justify-between border-t border-slate-200 pt-2 text-lg"><span>Mensalidade recorrente</span><strong>{money(monthlyTotal)} / mês</strong></div>{branding.first_billing_date && <div className="mt-2 border border-cyan-700 bg-sky-100 p-3 text-center text-slate-700">Primeira cobrança de mensalidade<br/><strong>{new Date(`${branding.first_billing_date}T00:00:00`).toLocaleDateString('pt-BR')}</strong></div>}</section>
      {version.terms && <section className="mt-8 border-t border-slate-200 pt-5"><h2 className="font-bold">Condições comerciais</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{version.terms}</p></section>}
      <div className="proposal-closing">
        {(branding.consultant_name || branding.consultant_phone || branding.consultant_email || branding.consultant_city) && <footer className="mt-10 border-t border-slate-200 pt-4 text-center text-sm text-slate-600"><strong>{branding.consultant_name}</strong><p>{[branding.consultant_phone, branding.consultant_email].filter(Boolean).join(' · ')}</p>{branding.consultant_city && <p>{branding.consultant_city}</p>}</footer>}
        <footer className="mt-4 border-t border-slate-200 pt-3 text-xs text-slate-500">Documento gerado pelo Nexo CRM. O envio e o aceite precisam seguir o processo comercial acordado.</footer>
      </div>
    </article>
    <style>{`@page { size: A4; margin: 12mm; }
      @media print {
        body { background: white !important; }
        .proposal-print { width: 100%; max-width: none; margin: 0; padding: 0; font-size: 10pt; }
        .proposal-print article { padding: 0 !important; }
        .proposal-print header { padding-bottom: 12px; }
        .proposal-print table { font-size: 8pt; }
        .proposal-print th, .proposal-print td { padding-top: 6px; padding-bottom: 6px; }
        .proposal-print .proposal-closing { break-inside: avoid; page-break-inside: avoid; }
        .proposal-print section { break-inside: avoid; page-break-inside: avoid; }
      }`}</style>
  </main>
}
