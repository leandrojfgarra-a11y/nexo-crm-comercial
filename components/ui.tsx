import Link from 'next/link'

export function PageHeader({ eyebrow, title, subtitle, action, href }: { eyebrow: string; title: string; subtitle: string; action?: string; href?: string }) { return <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-blue">{eyebrow}</p><h1 className="mt-1 page-title">{title}</h1><p className="mt-1 page-subtitle">{subtitle}</p></div>{action && href && <Link href={href} className="btn-base btn-primary btn-md">{action}</Link>}</div> }

export function Card({ label, value, detail, accent = 'bg-blue', compact = false }: { label: string; value: string; detail: string; accent?: string; compact?: boolean }) { return <article className={`card-base ${compact ? 'p-4' : 'p-5'}`}><div className={`absolute inset-x-0 top-0 h-[3px] ${accent}`} /><p className="text-sm font-medium text-muted">{label}</p><p className={`font-bold tracking-tight ${compact ? 'mt-1 text-2xl' : 'mt-2 text-[32px]'}`}>{value}</p><p className="mt-1 text-sm text-muted">{detail}</p></article> }

export function Panel({ title, children, aside }: { title: string; children: React.ReactNode; aside?: string }) { return <section className="panel-base"><div className="panel-header"><h2 className="text-base font-bold">{title}</h2>{aside && <span className="text-xs text-muted">{aside}</span>}</div>{children}</section> }

export function EmptyRows({ columns, message }: { columns: number; message: string }) { return <tr><td colSpan={columns} className="px-5 py-12 text-center text-sm text-muted">{message}</td></tr> }

export const table = 'table-base w-full min-w-[700px] text-left'; export const th = 'bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500'; export const td = 'px-5 py-4';