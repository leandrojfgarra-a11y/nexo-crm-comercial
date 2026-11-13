import { createTenantClient } from '@/lib/tenant/authorized-client'
import { DashboardFilters } from '@/components/dashboard-filters'
import { ManagerDashboard, type DashboardMetrics, type GoalProgress, type ManagerChartPoint, type SellerResult } from '@/components/manager-dashboard'
import { PageHeader } from '@/components/ui'

type SearchParams=Promise<{mode?:string;month?:string;start?:string;end?:string;seller?:string}>
type PageResult<T>={data:T[]|null;error:{message:string}|null}
type Opportunity={id:string;status:string;seller_id:string|null;opened_at:string;installation_value:number|string|null;monthly_value:number|string|null}
type Proposal={id:string;opportunity_id:string|null;status:string;created_at:string}
type ActiveSale={id:string;opportunity_id:string;seller_id:string|null;seller_name_snapshot:string|null;effective_closed_at:string;cycle_number:number;installation_value:number|string|null;monthly_value:number|string|null}
type CurrentWonOpportunity={id:string;seller_id:string|null;installation_value:number|string|null;monthly_value:number|string|null}
type SaleItem={closed_sale_id:string;cycle_number:number;product_id_snapshot:string;product_name_snapshot:string;category_snapshot:string|null}
type Seller={id:string;name:string;active?:boolean;installation_commission_percent:number|string|null;monthly_commission_percent:number|string|null;monthly_commission_mode:string|null;monthly_commission_competencies:number|null}
type Goal={id:string;period_month:string;goal_type:string;seller_id:string|null;product_id:string|null;category_name:string|null;quantity_target:number}
type DashboardProduct={id:string;name:string}

const monthPattern=/^\d{4}-(0[1-9]|1[0-2])$/
const datePattern=/^\d{4}-\d{2}-\d{2}$/
const number=(v:number|string|null|undefined)=>{const n=Number(v??0);return Number.isFinite(n)?n:0}
const monthParts=(date:Date)=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'}).formatToParts(date)
const currentMonthKey=(date:Date)=>{const p=monthParts(date);return `${p.find(x=>x.type==='year')?.value}-${p.find(x=>x.type==='month')?.value}`}
const localDateKey=(iso:string)=>{const p=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(iso));return `${p.find(x=>x.type==='year')?.value}-${p.find(x=>x.type==='month')?.value}-${p.find(x=>x.type==='day')?.value}`}
const localMonthKey=(iso:string)=>localDateKey(iso).slice(0,7)
function plusDays(date:string,days:number){const [y,m,d]=date.split('-').map(Number);return new Date(Date.UTC(y,m-1,d+days)).toISOString().slice(0,10)}
function firstOfMonth(month:string){return `${month}-01`}
function addMonths(month:string,delta:number){const [y,m]=month.split('-').map(Number);const date=new Date(Date.UTC(y,m-1+delta,1));return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}`}
function spStart(date:string){return new Date(`${date}T03:00:00.000Z`).toISOString()}
function validDate(value:string){if(!datePattern.test(value))return false;const d=new Date(`${value}T00:00:00Z`);return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===value}

async function allPages<T>(request:(from:number,to:number)=>PromiseLike<PageResult<T>>):Promise<{rows:T[];error:string|null}>{
  const rows:T[]=[]
  for(let offset=0;offset<100000;offset+=1000){const result=await request(offset,offset+999);if(result.error)return {rows,error:result.error.message};const page=result.data??[];rows.push(...page);if(page.length<1000)return {rows,error:null}}
  return {rows,error:'A consulta excedeu o limite de paginação do painel.'}
}
function weekKey(date:string){const [y,m,d]=date.split('-').map(Number);const dt=new Date(Date.UTC(y,m-1,d));const weekday=dt.getUTCDay()||7;dt.setUTCDate(dt.getUTCDate()-weekday+1);return dt.toISOString().slice(0,10)}
function weeklyPoints(sales:ActiveSale[],start:string,end:string):ManagerChartPoint[]{
  const counts=new Map<string,number>()
  for(const sale of sales){const key=weekKey(localDateKey(sale.effective_closed_at));counts.set(key,(counts.get(key)??0)+1)}
  const [sy,sm,sd]=start.split('-').map(Number);const [ey,em,ed]=end.split('-').map(Number);const cursor=new Date(Date.UTC(sy,sm-1,sd));const finish=new Date(Date.UTC(ey,em-1,ed));cursor.setUTCDate(cursor.getUTCDate()-((cursor.getUTCDay()+6)%7))
  const points:ManagerChartPoint[]=[];while(cursor<=finish){const key=cursor.toISOString().slice(0,10);points.push({label:new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',timeZone:'UTC'}).format(cursor),value:counts.get(key)??0});cursor.setUTCDate(cursor.getUTCDate()+7)}return points
}

export default async function Dashboard({searchParams}:{searchParams:SearchParams}){
  const params=await searchParams;const today=new Date();const thisMonth=currentMonthKey(today)
  const {supabase,tenant}=await createTenantClient()
  const companyId=tenant.companyId
  const [sellerBase,sellerRulesResult]=await Promise.all([
    supabase.from('sellers').select('id,name,active').eq('company_id',companyId).order('name').limit(5000),
    supabase.from('sellers').select('id,name,installation_commission_percent,monthly_commission_percent,monthly_commission_mode,monthly_commission_competencies').eq('company_id',companyId),
  ])
  const sellerOptions=(sellerBase.data??[]) as {id:string;name:string;active:boolean}[]
  const sellerName=new Map(sellerOptions.map(s=>[s.id,s.name]))
  const productResult=await supabase.from('products').select('id,name').eq('company_id',companyId).limit(10000)
  const productName=new Map(((productResult.data??[]) as DashboardProduct[]).map(product=>[product.id,product.name]))
  const mode=params.mode==='custom'?'custom':'month';const requestedMonth=monthPattern.test(params.month??'')?params.month!:thisMonth
  let startDate=mode==='custom'&&validDate(params.start??'')?params.start!:firstOfMonth(requestedMonth)
  let endDate=mode==='custom'&&validDate(params.end??'')?params.end!:new Date(Date.UTC(Number(requestedMonth.slice(0,4)),Number(requestedMonth.slice(5,7)),0)).toISOString().slice(0,10)
  let filterError:string|null=null
  if(mode==='custom'&&(!validDate(params.start??'')||!validDate(params.end??'')||params.start!>params.end!)){filterError='Informe um intervalo válido. Os dados foram carregados para o mês atual.';startDate=firstOfMonth(thisMonth);endDate=new Date(Date.UTC(Number(thisMonth.slice(0,4)),Number(thisMonth.slice(5,7)),0)).toISOString().slice(0,10)}
  const sellerId=params.seller&&sellerOptions.some(s=>s.id===params.seller)?params.seller:''
  if(params.seller&&!sellerId)filterError='O vendedor selecionado não foi encontrado; o painel mostra todos os vendedores.'
  const startAt=spStart(startDate),endAt=spStart(plusDays(endDate,1))
  const trendStart=mode==='month'?spStart(firstOfMonth(addMonths(requestedMonth,-5))):startAt

  const opportunityPage=allPages<Opportunity>((from,to)=>{
    let q=supabase.from('opportunities').select('id,status,seller_id,opened_at,installation_value,monthly_value').eq('company_id',companyId).gte('opened_at',startDate).lte('opened_at',endDate).order('opened_at').range(from,to)
    if(sellerId)q=q.eq('seller_id',sellerId);return q
  })
  const currentOpenOpportunityPage=allPages<Opportunity>((from,to)=>{
    let q=supabase.from('opportunities').select('id,status,seller_id,opened_at,installation_value,monthly_value').eq('company_id',companyId).eq('status','open').order('opened_at').range(from,to)
    if(sellerId)q=q.eq('seller_id',sellerId);return q
  })
  const proposalPage=allPages<Proposal>((from,to)=>supabase.from('proposals').select('id,opportunity_id,status,created_at').eq('company_id',companyId).gte('created_at',startAt).lt('created_at',endAt).order('created_at').range(from,to))
  const salesPage=allPages<ActiveSale>((from,to)=>{
    let q=supabase.from('active_closed_sales').select('id,opportunity_id,seller_id,seller_name_snapshot,effective_closed_at,cycle_number,installation_value,monthly_value').gte('effective_closed_at',trendStart).lt('effective_closed_at',endAt).order('effective_closed_at').range(from,to)
    return q
  })
  const goalsPage=allPages<Goal>((from,to)=>supabase.from('commercial_goals').select('id,period_month,goal_type,seller_id,product_id,category_name,quantity_target').eq('company_id',companyId).gte('period_month',firstOfMonth(startDate.slice(0,7))).lte('period_month',firstOfMonth(endDate.slice(0,7))).order('period_month').range(from,to))
  const [opportunityResult,currentOpenResult,proposalResult,salesResult,goalResult]=await Promise.all([opportunityPage,currentOpenOpportunityPage,proposalPage,salesPage,goalsPage])
  const closedSales=salesResult.rows
  const closedOpportunityIds=[...new Set(closedSales.map(sale=>sale.opportunity_id))]
  const currentWonPages=await Promise.all(Array.from({length:Math.ceil(closedOpportunityIds.length/500)},(_,index)=>{
    const ids=closedOpportunityIds.slice(index*500,(index+1)*500)
    return allPages<CurrentWonOpportunity>((from,to)=>supabase.from('opportunities').select('id,seller_id,installation_value,monthly_value').eq('company_id',companyId).in('id',ids).eq('status','won').range(from,to))
  }))
  const currentWonError=currentWonPages.find(result=>result.error)?.error??null
  const currentWonById=new Map(currentWonPages.flatMap(result=>result.rows).map(opportunity=>[opportunity.id,opportunity]))
  const allSales=closedSales.map(sale=>{
    const current=currentWonById.get(sale.opportunity_id)
    if(!current)return sale
    return {...sale,seller_id:current.seller_id,seller_name_snapshot:current.seller_id?sellerName.get(current.seller_id)??sale.seller_name_snapshot:null,installation_value:current.installation_value,monthly_value:current.monthly_value}
  }).filter(sale=>!sellerId||sale.seller_id===sellerId)
  const errors:string[]=[]
  if(sellerBase.error)errors.push(`Vendedores indisponíveis: ${sellerBase.error.message}`)
  if(productResult.error)errors.push(`Produtos indisponíveis para identificar metas: ${productResult.error.message}`)
  if(opportunityResult.error)errors.push(`Oportunidades indisponíveis: ${opportunityResult.error}`)
  if(currentOpenResult.error)errors.push(`Oportunidades em negociação indisponíveis: ${currentOpenResult.error}`)
  if(proposalResult.error)errors.push(`Propostas indisponíveis: ${proposalResult.error}`)
  if(salesResult.error)errors.push('Vendas fechadas indisponíveis. Confirme a migration 009 e a view active_closed_sales.')
  if(currentWonError)errors.push('Não foi possível sincronizar os valores atuais das oportunidades concluídas.')
  if(goalResult.error)errors.push('Metas indisponíveis. Confirme a migration 010.')
  if(sellerRulesResult.error)errors.push('Estimativas de comissão indisponíveis; as regras de vendedor não puderam ser consultadas.')
  if(filterError)errors.push(filterError)

  const opportunities=opportunityResult.rows
  const salesInRange=allSales.filter(s=>{const d=localDateKey(s.effective_closed_at);return d>=startDate&&d<=endDate})
  const statuses={open:0,won:0,lost:0,cancelled:0}
  for(const opp of opportunities)if(Object.hasOwn(statuses,opp.status))statuses[opp.status as keyof typeof statuses]++
  const currentOpenOpps=currentOpenResult.rows
  const metrics:DashboardMetrics={
    opportunities:{...statuses,inNegotiation:currentOpenOpps.length,negotiatedInstallation:currentOpenOpps.reduce((n,o)=>n+number(o.installation_value),0),negotiatedMonthly:currentOpenOpps.reduce((n,o)=>n+number(o.monthly_value),0)},
    proposals:{analysis:0,accepted:0,rejected:0},
    sales:{count:salesInRange.length,installation:salesInRange.reduce((n,s)=>n+number(s.installation_value),0),monthly:salesInRange.reduce((n,s)=>n+number(s.monthly_value),0)},
    commissions:{installation:0,monthly:0,available:!sellerRulesResult.error},
  }
  let proposals=proposalResult.rows
  if(sellerId){
    const proposalOppIds=[...new Set(proposals.map(p=>p.opportunity_id).filter((id):id is string=>Boolean(id)))]
    const attributed=new Set<string>()
    for(let i=0;i<proposalOppIds.length;i+=500){const ids=proposalOppIds.slice(i,i+500);const {data,error}=await supabase.from('opportunities').select('id').eq('company_id',companyId).in('id',ids).eq('seller_id',sellerId);if(error)errors.push('Não foi possível atribuir propostas ao vendedor selecionado.');for(const row of data??[])attributed.add(row.id)}
    proposals=proposals.filter(p=>p.opportunity_id&&attributed.has(p.opportunity_id))
  }
  metrics.proposals.analysis=proposals.filter(p=>p.status==='draft'||p.status==='sent').length
  metrics.proposals.accepted=proposals.filter(p=>p.status==='accepted').length
  metrics.proposals.rejected=proposals.filter(p=>p.status==='rejected').length

  const rules=(sellerRulesResult.data??[]) as Seller[];const ruleBySeller=new Map(rules.map(s=>[s.id,s]))
  for(const sale of salesInRange){const rule=sale.seller_id?ruleBySeller.get(sale.seller_id):undefined;if(!rule)continue
    metrics.commissions.installation+=number(sale.installation_value)*number(rule.installation_commission_percent)/100
    const competencies=rule.monthly_commission_mode==='recurring'?Math.max(1,Number(rule.monthly_commission_competencies??1)):1
    if(rule.monthly_commission_mode!=='none')metrics.commissions.monthly+=number(sale.monthly_value)*number(rule.monthly_commission_percent)/100*competencies
  }

  let saleItems:SaleItem[]=[]
  let itemsAvailable=true
  for(let i=0;i<salesInRange.length;i+=300){const ids=salesInRange.slice(i,i+300).map(s=>s.id);const r=await allPages<SaleItem>((from,to)=>supabase.from('closed_sale_items').select('closed_sale_id,cycle_number,product_id_snapshot,product_name_snapshot,category_snapshot').eq('company_id',companyId).in('closed_sale_id',ids).range(from,to));if(r.error){itemsAvailable=false;errors.push('Itens das vendas indisponíveis para produtos e metas por produto/categoria.')}saleItems.push(...r.rows)}
  const cycleBySale=new Map(salesInRange.map(s=>[s.id,s.cycle_number]));const currentItems=saleItems.filter(item=>cycleBySale.get(item.closed_sale_id)===item.cycle_number)
  const itemSaleMap=new Map<string,Set<string>>(),itemName=new Map<string,string>()
  for(const item of currentItems){if(!itemSaleMap.has(item.product_id_snapshot))itemSaleMap.set(item.product_id_snapshot,new Set());itemSaleMap.get(item.product_id_snapshot)!.add(item.closed_sale_id);itemName.set(item.product_id_snapshot,item.product_name_snapshot)}
  const productPoints=[...itemSaleMap].map(([id,set])=>({label:itemName.get(id)??'Produto/serviço',value:set.size})).sort((a,b)=>b.value-a.value).slice(0,12)

  const sellerAgg=new Map<string,{name:string;count:number;installation:number;monthly:number}>()
  for(const sale of salesInRange){const id=sale.seller_id??'none';if(!sellerAgg.has(id))sellerAgg.set(id,{name:sale.seller_name_snapshot??(id==='none'?'Sem vendedor':sellerName.get(id)??'Vendedor histórico'),count:0,installation:0,monthly:0});const row=sellerAgg.get(id)!;row.count++;row.installation+=number(sale.installation_value);row.monthly+=number(sale.monthly_value)}
  const sellerResults:SellerResult[]=[...sellerAgg.values()].map(s=>({label:s.name,count:s.count,installation:s.installation,monthly:s.monthly})).sort((a,b)=>b.count-a.count)
  const monthlySeries:ManagerChartPoint[]=[];let cursor=mode==='month'?addMonths(requestedMonth,-5):startDate.slice(0,7);const lastMonth=endDate.slice(0,7)
  while(cursor<=lastMonth){monthlySeries.push({label:new Intl.DateTimeFormat('pt-BR',{month:'short',year:'2-digit',timeZone:'UTC'}).format(new Date(`${firstOfMonth(cursor)}T00:00:00Z`)),value:allSales.filter(s=>localMonthKey(s.effective_closed_at)===cursor).length});cursor=addMonths(cursor,1)}
  const weekly=weeklyPoints(salesInRange,startDate,endDate)

  const goals=goalResult.rows.filter(g=>!sellerId||g.goal_type!=='seller'||g.seller_id===sellerId)
  const goalProgress:GoalProgress[]=goals.map(goal=>{
    const key=goal.period_month.slice(0,7),monthSales=salesInRange.filter(s=>localMonthKey(s.effective_closed_at)===key)
    let label=goal.goal_type==='general'?'Todas as vendas':goal.goal_type==='category'?goal.category_name??'Categoria':goal.goal_type==='product'?productName.get(goal.product_id??'')??'Produto/serviço não encontrado':sellerName.get(goal.seller_id??'')??'Vendedor não encontrado',type=goal.goal_type==='general'?'Geral':goal.goal_type==='seller'?'Vendedor':goal.goal_type==='product'?'Produto/serviço':'Categoria',realized=monthSales.length
    if(goal.goal_type==='seller'){realized=monthSales.filter(s=>s.seller_id===goal.seller_id).length}
    if(goal.goal_type==='product'){realized=new Set(currentItems.filter(i=>monthSales.some(s=>s.id===i.closed_sale_id)&&i.product_id_snapshot===goal.product_id).map(i=>i.closed_sale_id)).size}
    if(goal.goal_type==='category')realized=new Set(currentItems.filter(i=>monthSales.some(s=>s.id===i.closed_sale_id)&&(i.category_snapshot??'').trim().toLocaleLowerCase('pt-BR')===(goal.category_name??'').trim().toLocaleLowerCase('pt-BR')).map(i=>i.closed_sale_id)).size
    return {id:goal.id,label:`${label} · ${key}`,type,planned:goal.quantity_target,realized,remaining:Math.max(0,goal.quantity_target-realized),percent:goal.quantity_target?Math.round(realized/goal.quantity_target*100):(realized?100:0)}
  })
  const rangeLabel=mode==='month'?new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${requestedMonth}-01T00:00:00Z`)):`${new Date(`${startDate}T00:00:00Z`).toLocaleDateString('pt-BR')} a ${new Date(`${endDate}T00:00:00Z`).toLocaleDateString('pt-BR')}`
  return <div className="grid gap-5">
    <PageHeader eyebrow="Gestão comercial" title="Painel gerencial" subtitle={`Indicadores de ${rangeLabel}${sellerId?` · ${sellerName.get(sellerId)??'Vendedor'}`:''}. Vendas consideram os ciclos WON vigentes.`} action="Abrir funil" href="/funil"/>
    <DashboardFilters mode={mode} month={requestedMonth} start={startDate} end={endDate} sellerId={sellerId} sellers={sellerOptions}/>
    <ManagerDashboard rangeLabel={`${rangeLabel}${sellerId?` · ${sellerName.get(sellerId)??'Vendedor'}`:''}`} metrics={metrics} weekly={weekly} monthly={monthlySeries} sellers={sellerResults} products={productPoints} goals={goalProgress} errors={errors} sellerFiltered={Boolean(sellerId)} available={{opportunities:!opportunityResult.error&&!currentOpenResult.error,proposals:!proposalResult.error&&!errors.some(x=>x.startsWith('Não foi possível atribuir propostas')),sales:!salesResult.error,items:itemsAvailable,goals:!goalResult.error&&itemsAvailable&&!productResult.error&&!sellerBase.error,commissions:!sellerRulesResult.error&&!salesResult.error}}/>
  </div>
}




