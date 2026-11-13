'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { deleteCommercialGoal, saveCommercialGoal } from '@/app/metas/actions'

export type GoalRow = {
  id:string; period_month:string; goal_type:'general'|'seller'|'product'|'category'; seller_id:string|null; product_id:string|null
  category_name:string|null; quantity_target:number; achieved:number; target_label:string
}
export type GoalSeller = {id:string;name:string;active:boolean}
export type GoalProduct = {id:string;name:string;kind:string;active:boolean;commercial_category:string|null}
export type GoalTrendPoint = {label:string;value:number}

const labels: Record<GoalRow['goal_type'],string> = {general:'Vendas gerais',seller:'Vendedor',product:'Produto/serviço',category:'Categoria'}
const inputClass='w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue'

export function CommercialGoals({period,sellers,products,categories,goals,monthlySalesCount,weeklyTrend,monthlyTrend,loadError,salesError}: {
  period:string;sellers:GoalSeller[];products:GoalProduct[];categories:string[];goals:GoalRow[];monthlySalesCount:number;weeklyTrend:GoalTrendPoint[];monthlyTrend:GoalTrendPoint[];loadError:string|null;salesError:string|null
}) {
  const router=useRouter()
  const [pending,startTransition]=useTransition()
  const [type,setType]=useState<GoalRow['goal_type']>('general')
  const [message,setMessage]=useState('')
  const [messageOk,setMessageOk]=useState<boolean|null>(null)

  function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form=new FormData(event.currentTarget)
    const payload={
      periodMonth:String(form.get('periodMonth')??''),type:String(form.get('type')??''),sellerId:String(form.get('sellerId')??''),
      productId:String(form.get('productId')??''),categoryName:String(form.get('categoryName')??''),quantity:String(form.get('quantity')??''),
    }
    const formElement=event.currentTarget
    setMessage('');setMessageOk(null)
    startTransition(async()=>{
      const result=await saveCommercialGoal(payload)
      setMessage(result.message);setMessageOk(result.ok)
      if(result.ok){formElement.reset();setType('general');router.refresh()}
    })
  }

  const saveQuantity=(id:string,quantity:string)=>startTransition(async()=>{
    const result=await saveCommercialGoal({id,periodMonth:period,type:'general',sellerId:'',productId:'',categoryName:'',quantity})
    setMessage(result.message);setMessageOk(result.ok);if(result.ok)router.refresh()
  })

  const removeGoal=(goal:GoalRow)=>{
    if(!window.confirm(`Excluir a meta “${goal.target_label}” de ${period.slice(0,7)}? As vendas e o histórico comercial serão preservados.`))return
    startTransition(async()=>{
      const result=await deleteCommercialGoal(goal.id)
      setMessage(result.message);setMessageOk(result.ok);if(result.ok)router.refresh()
    })
  }

  const totalGoals=goals.filter(g=>g.goal_type==='general').reduce((n,g)=>n+g.quantity_target,0)
  const totalSales=monthlySalesCount
  const pct=(goal:GoalRow)=>goal.quantity_target>0?Math.min(100,Math.round(goal.achieved/goal.quantity_target*100)):(goal.achieved>0?100:0)

  return <div className="grid gap-6">
    {(loadError||salesError)&&<div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">{loadError||salesError}</div>}
    {message&&<p role={messageOk?'status':'alert'} className={'rounded-lg border p-3 text-sm '+(messageOk?'border-emerald-200 bg-emerald-50 text-emerald-800':'border-red-200 bg-red-50 text-red-800')}>{message}</p>}
    <section className="grid gap-4 sm:grid-cols-3">
      <article className="rounded-xl border border-slate-200 bg-surface p-4 shadow-sm"><p className="text-xs font-semibold text-muted">Meta geral planejada</p><p className="mt-1 text-2xl font-bold tracking-tight">{totalGoals}</p><p className="text-xs text-muted">vendas no mês</p></article>
      <article className="rounded-xl border border-slate-200 bg-surface p-4 shadow-sm"><p className="text-xs font-semibold text-muted">Vendas WON vigentes</p><p className="mt-1 text-2xl font-bold tracking-tight">{salesError?'—':totalSales}</p><p className="text-xs text-muted">cada oportunidade conta uma vez</p></article>
      <article className="rounded-xl border border-slate-200 bg-surface p-4 shadow-sm"><p className="text-xs font-semibold text-muted">Metas cadastradas</p><p className="mt-1 text-2xl font-bold tracking-tight">{goals.length}</p><p className="text-xs text-muted">no período selecionado</p></article>
    </section>
    <section className="grid gap-4 xl:grid-cols-2">
      <Trend title="Vendas WON por semana" points={weeklyTrend} unavailable={Boolean(salesError)}/>
      <Trend title="Vendas WON por mês (últimos seis meses)" points={monthlyTrend} unavailable={Boolean(salesError)}/>
    </section>
    <section className="rounded-xl border border-slate-200 bg-surface p-5">
      <h2 className="mb-4 text-lg font-bold">Cadastrar meta mensal</h2>
      <form onSubmit={submit} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <input type="hidden" name="periodMonth" value={period}/>
        <label className="grid gap-1.5 text-sm font-medium">Tipo de meta<select name="type" value={type} onChange={e=>setType(e.target.value as GoalRow['goal_type'])} className={inputClass}><option value="general">Vendas gerais</option><option value="seller">Por vendedor</option><option value="product">Por produto/serviço</option><option value="category">Por categoria comercial</option></select></label>
        {type==='seller'&&<label className="grid gap-1.5 text-sm font-medium">Vendedor<select name="sellerId" required className={inputClass}><option value="">Selecione...</option>{sellers.map(s=><option key={s.id} value={s.id}>{s.name}{!s.active?' (inativo)':''}</option>)}</select></label>}
        {type==='product'&&<label className="grid gap-1.5 text-sm font-medium">Produto ou serviço<select name="productId" required className={inputClass}><option value="">Selecione...</option>{products.map(p=><option key={p.id} value={p.id}>{p.name}{!p.active?' (inativo)':''}</option>)}</select></label>}
        {type==='category'&&<label className="grid gap-1.5 text-sm font-medium">Categoria comercial<input name="categoryName" list="goal-categories" required maxLength={120} placeholder="Ex.: Fiscal" className={inputClass}/><datalist id="goal-categories">{categories.map(c=><option key={c} value={c}/>)}</datalist></label>}
        <label className="grid gap-1.5 text-sm font-medium">Quantidade planejada<input name="quantity" type="number" min="0" max="1000000" step="1" required className={inputClass}/><span className="text-xs font-normal text-muted">Meta por quantidade de vendas, não por valor financeiro.</span></label>
        <button disabled={pending||Boolean(loadError)||Boolean(salesError)} className="self-end rounded-lg bg-blue px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{pending?'Salvando...':'Cadastrar meta'}</button>
      </form>
    </section>
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-surface">
      <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-bold">Progresso das metas</h2><p className="mt-1 text-sm text-muted">Atingimento calculado com vendas do ciclo WON vigente, pela data efetiva do fechamento.</p></div>
      {goals.length===0?<p className="p-10 text-center text-sm text-muted">Nenhuma meta cadastrada para este mês.</p>:<div className="divide-y divide-slate-100">{goals.map(goal=>{
        const progress=pct(goal),remaining=Math.max(0,goal.quantity_target-goal.achieved)
        return <article key={goal.id} className="grid gap-4 p-5 lg:grid-cols-[minmax(190px,1fr)_repeat(4,minmax(70px,auto))_minmax(150px,1fr)_auto] lg:items-center">
          <div><p className="text-xs font-semibold uppercase tracking-wide text-muted">{labels[goal.goal_type]}</p><p className="mt-1 font-semibold">{goal.target_label}</p></div>
          <Metric label="Planejado" value={goal.quantity_target}/><Metric label="Realizado" value={salesError?'—':goal.achieved}/><Metric label="Restante" value={salesError?'—':remaining}/><Metric label="Atingimento" value={salesError?'—':`${progress}%`}/>
          <div className="grid gap-2"><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue transition-all" style={{width:`${progress}%`}}/></div><form onSubmit={e=>{e.preventDefault();const d=new FormData(e.currentTarget);saveQuantity(goal.id,String(d.get('quantity')??''))}} className="flex items-center gap-2"><input aria-label="Editar quantidade planejada" name="quantity" type="number" min="0" max="1000000" step="1" defaultValue={goal.quantity_target} className="w-28 rounded border border-slate-300 px-2 py-1 text-sm"/><button disabled={pending||Boolean(loadError)} className="text-xs font-semibold text-blue disabled:opacity-50">Salvar meta</button></form></div>
          <button type="button" disabled={pending||Boolean(loadError)} onClick={()=>removeGoal(goal)} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">Excluir</button>
        </article>
      })}</div>}
    </section>
  </div>
}

function Metric({label,value}:{label:string;value:string|number}){return <div><p className="text-xs text-muted">{label}</p><p className="mt-1 font-semibold">{value}</p></div>}

function Trend({title,points,unavailable}:{title:string;points:GoalTrendPoint[];unavailable:boolean}){
  const max=Math.max(1,...points.map(point=>point.value))
  return <section className="rounded-xl border border-slate-200 bg-surface p-4 shadow-sm" aria-label={title}>
    <h2 className="font-bold">{title}</h2>
    {unavailable?<p className="mt-4 text-sm text-muted">Dados indisponíveis enquanto as vendas vigentes não puderem ser consultadas.</p>:<div className="mt-3 flex h-28 items-end justify-around gap-3 border-b border-slate-200 px-2">
      {points.map(point=><div key={point.label} className="flex h-full flex-1 flex-col items-center justify-end gap-2" title={`${point.label}: ${point.value} venda(s)`}>
        <span className="text-xs font-semibold">{point.value}</span><div className="w-full max-w-12 rounded-t bg-blue" style={{height:`${Math.max(point.value?6:0,point.value/max*82)}%`}} aria-hidden="true"/><span className="pb-2 text-[11px] text-muted">{point.label}</span>
      </div>)}
    </div>}
  </section>
}
