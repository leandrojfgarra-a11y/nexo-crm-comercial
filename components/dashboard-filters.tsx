'use client'

import { useState } from 'react'

type SellerOption={id:string;name:string;active:boolean}
export function DashboardFilters({mode,month,start,end,sellerId,sellers}:{mode:'month'|'custom';month:string;start:string;end:string;sellerId:string;sellers:SellerOption[]}){
  const [rangeMode,setRangeMode]=useState(mode)
  return <form method="get" action="/" className={`grid w-full gap-3 rounded-xl border border-slate-200 bg-surface p-3 sm:p-4 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-4 xl:items-end`}>
    <div className="flex flex-col gap-1 sm:col-span-1 lg:col-span-1 xl:col-span-1">
      <label className="flex flex-col gap-1 text-sm font-medium text-ink">
        Período
        <select name="mode" value={rangeMode} onChange={e=>setRangeMode(e.target.value as 'month'|'custom')} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-blue focus:ring-2 focus:ring-blue/15"><option value="month">Mês</option><option value="custom">Personalizado</option></select>
      </label>
      {rangeMode==='month'?(
        <label className="flex flex-col gap-1 text-sm font-medium text-ink">
          Mês e ano
          <input type="month" name="month" defaultValue={month} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-blue focus:ring-2 focus:ring-blue/15"/>
        </label>
      ):(
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-medium text-ink">
            Data inicial
            <input type="date" name="start" required defaultValue={start} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-blue focus:ring-2 focus:ring-blue/15"/>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-ink">
            Data final
            <input type="date" name="end" required defaultValue={end} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-blue focus:ring-2 focus:ring-blue/15"/>
          </label>
        </div>
      )}
    </div>
    <label className="flex flex-col gap-1 text-sm font-medium text-ink sm:col-span-1 lg:col-span-1 xl:col-span-1">
      Vendedor
      <select name="seller" defaultValue={sellerId} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-blue focus:ring-2 focus:ring-blue/15"><option value="">Todos os vendedores</option>{sellers.map(s=><option key={s.id} value={s.id}>{s.name}{!s.active?' (inativo)':''}</option>)}</select>
    </label>
    <button className="btn-base btn-primary btn-md">Aplicar filtros</button>
  </form>
}