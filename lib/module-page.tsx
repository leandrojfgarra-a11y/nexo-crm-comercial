import { PageHeader, Panel, EmptyRows, table, th } from '@/components/ui'

export type ModulePageProps = {
  eyebrow: string; title: string; subtitle: string; action: string
  columns: string[]; filter: string; empty: string; fields?: string[]
}

export function ModulePage({ eyebrow, title, subtitle, action, columns, filter, empty, fields = ['Nome', 'E-mail', 'Telefone', 'Observações'] }: ModulePageProps) {
  return <>
    <PageHeader eyebrow={eyebrow} title={title} subtitle={subtitle} action={action} href="#cadastro" />
    <Panel title={title} aside="0 registros">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
        <input aria-label="Buscar" placeholder={filter} className="min-w-[220px] flex-1 rounded-lg border border-slate-200 bg-surface px-3 py-2.5 text-sm outline-none focus:border-blue" />
        <select aria-label="Status" className="rounded-lg border border-slate-200 bg-surface px-3 py-2.5 text-sm"><option>Todos os status</option><option>Ativos</option><option>Inativos</option></select>
        <button className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold">Filtrar</button>
      </div>
      <div className="overflow-x-auto"><table className={table}><thead><tr>{columns.map(c => <th className={th} key={c}>{c}</th>)}</tr></thead><tbody><EmptyRows columns={columns.length} message={empty} /></tbody></table></div>
    </Panel>
    <section id="cadastro" className="mt-5 rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="font-semibold">{action}</h2>
      <p className="mt-1 text-sm text-muted">Campos preparados para conexão com o banco. O salvamento será habilitado na etapa de integração.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {fields.map(field => <label className="grid gap-1.5 text-sm font-medium" key={field}>{field}<input name={field.toLowerCase().replaceAll(' ', '_')} className="rounded-lg border border-slate-200 bg-surface px-3 py-2.5 font-normal outline-none focus:border-blue" /></label>)}
        <button type="button" disabled className="w-fit rounded-lg bg-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-500">Aguardando integração com Supabase</button>
      </div>
    </section>
  </>
}
