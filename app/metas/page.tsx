import { PageHeader } from '@/components/ui'
import { CommercialGoals, type GoalProduct, type GoalRow, type GoalSeller } from '@/components/commercial-goals'
import { createTenantClient } from '@/lib/tenant/authorized-client'

type SearchParams=Promise<{month?:string}>
const monthPattern=/^\d{4}-(0[1-9]|1[0-2])$/
const fmtMonth=(month:string)=>new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${month}-01T00:00:00Z`))

export default async function GoalsPage({searchParams}:{searchParams:SearchParams}) {
  const params=await searchParams
  const now=new Date()
  const monthParts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'}).formatToParts(now)
  const currentMonth=`${monthParts.find(p=>p.type==='year')?.value}-${monthParts.find(p=>p.type==='month')?.value}`
  const period=monthPattern.test(params.month??'')?params.month!:currentMonth
  const [year,monthNumber]=period.split('-').map(Number)
  const nextMonth=new Date(Date.UTC(year,monthNumber,1))
  const rangeStart=new Date(`${period}-01T00:00:00-03:00`).toISOString()
  const rangeEnd=new Date(Date.UTC(nextMonth.getUTCFullYear(),nextMonth.getUTCMonth(),1,3)).toISOString()
  const trendStart=new Date(Date.UTC(year,monthNumber-6,1,3)).toISOString()
  const {supabase,tenant}=await createTenantClient()
  const [goalResult,sellerResult,productResult]=await Promise.all([
    supabase.from('commercial_goals').select('id,period_month,goal_type,seller_id,product_id,category_name,quantity_target').eq('company_id',tenant.companyId).eq('period_month',`${period}-01`).order('goal_type'),
    supabase.from('sellers').select('id,name,active').eq('company_id',tenant.companyId).order('name'),
    supabase.from('products').select('id,name,kind,active,commercial_category').eq('company_id',tenant.companyId).order('name'),
  ])
  const loadError=goalResult.error?'Tabela de metas indisponível. Aplique manualmente a migration 202610310010.':sellerResult.error||productResult.error?'Não foi possível carregar o cadastro de vendedores/produtos para configurar metas específicas.':null
  const sellers=(sellerResult.data??[]) as GoalSeller[]
  const products=(productResult.data??[]) as GoalProduct[]
  let allSales:{id:string;opportunity_id:string;seller_id:string|null;effective_closed_at:string;cycle_number:number}[]=[]
  let salesError:string|null=null
  for(let offset=0;!salesError;offset+=1000){
    const {data,error}=await supabase.from('active_closed_sales').select('id,opportunity_id,seller_id,effective_closed_at,cycle_number')
      .gte('effective_closed_at',trendStart).lt('effective_closed_at',rangeEnd).order('effective_closed_at').range(offset,offset+999)
    if(error){salesError='Não foi possível apurar as vendas vigentes. Confirme se a migration 009 e a view active_closed_sales estão disponíveis.';break}
    allSales=allSales.concat(data??[])
    if((data??[]).length<1000)break
  }
  const periodOf=(timestamp:string)=>{
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'}).formatToParts(new Date(timestamp))
    return `${parts.find(p=>p.type==='year')?.value}-${parts.find(p=>p.type==='month')?.value}`
  }
  const dayOf=(timestamp:string)=>Number(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',day:'2-digit'}).format(new Date(timestamp)))
  const rawSales=allSales.filter(s=>periodOf(s.effective_closed_at)===period)
  const weeklyTrend=Array.from({length:5},(_,index)=>({label:`Sem. ${index+1}`,value:rawSales.filter(s=>Math.min(4,Math.floor((dayOf(s.effective_closed_at)-1)/7))===index).length}))
  const monthlyTrend=Array.from({length:6},(_,index)=>{
    const dt=new Date(Date.UTC(year,monthNumber-1-(5-index),1))
    const key=`${dt.getUTCFullYear()}-${String(dt.getUTCMonth()+1).padStart(2,'0')}`
    return {label:new Intl.DateTimeFormat('pt-BR',{month:'short',timeZone:'UTC'}).format(dt),value:allSales.filter(s=>periodOf(s.effective_closed_at)===key).length}
  })
  let itemRows:{closed_sale_id:string;cycle_number:number;product_id_snapshot:string;category_snapshot:string|null}[]=[]
  let itemError:string|null=null
  for(let offset=0;offset<rawSales.length;offset+=500){
    const batch=rawSales.slice(offset,offset+500)
    if(!batch.length)continue
    for(let offset=0;!itemError;offset+=1000){
      const {data,error}=await supabase.from('closed_sale_items').select('closed_sale_id,cycle_number,product_id_snapshot,category_snapshot')
        .eq('company_id',tenant.companyId).in('closed_sale_id',batch.map(s=>s.id)).range(offset,offset+999)
      if(error){itemError='Não foi possível apurar as metas por produto/categoria.';break}
      itemRows=itemRows.concat(data??[])
      if((data??[]).length<1000)break
    }
  }
  const salesErrorFinal=salesError??itemError
  const saleCycles=new Map(rawSales.map(s=>[s.id,s.cycle_number]))
  const currentItems=itemRows.filter(item=>saleCycles.get(item.closed_sale_id)===item.cycle_number)
  const goals:GoalRow[]=(goalResult.data??[]).map(goal=>{
    let target_label='Vendas gerais'
    let achieved=rawSales.length
    if(goal.goal_type==='seller'){
      target_label=sellers.find(s=>s.id===goal.seller_id)?.name??'Vendedor não encontrado'
      achieved=rawSales.filter(s=>s.seller_id===goal.seller_id).length
    } else if(goal.goal_type==='product'){
      target_label=products.find(p=>p.id===goal.product_id)?.name??'Produto/serviço não encontrado'
      const salesWithProduct=new Set(currentItems.filter(item=>item.product_id_snapshot===goal.product_id).map(item=>item.closed_sale_id))
      achieved=salesWithProduct.size
    } else if(goal.goal_type==='category'){
      target_label=goal.category_name??'Categoria'
      const category=target_label.trim().toLocaleLowerCase('pt-BR')
      const salesWithCategory=new Set(currentItems.filter(item=>(item.category_snapshot??'').trim().toLocaleLowerCase('pt-BR')===category).map(item=>item.closed_sale_id))
      achieved=salesWithCategory.size
    }
    return {...goal,target_label,achieved} as GoalRow
  })
  const categories=[...new Set(products.map(p=>p.commercial_category?.trim()).filter((c):c is string=>Boolean(c)))].sort((a,b)=>a.localeCompare(b,'pt-BR'))
  return <>
    <PageHeader eyebrow="Planejamento comercial" title="Metas Comerciais" subtitle={`Planeje e acompanhe vendas WON vigentes em ${fmtMonth(period)}.`}/>
    <form method="get" className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-surface p-4">
      <label className="grid gap-1 text-sm font-medium">Mês de referência<input type="month" name="month" defaultValue={period} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"/></label>
      <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">Filtrar</button>
      <span className="text-sm text-muted">Os meses têm metas independentes; consultar outro mês não altera metas anteriores.</span>
    </form>
    <CommercialGoals period={period} sellers={sellers} products={products} categories={categories} goals={goals} monthlySalesCount={rawSales.length} weeklyTrend={weeklyTrend} monthlyTrend={monthlyTrend} loadError={loadError} salesError={salesErrorFinal}/>
  </>
}
