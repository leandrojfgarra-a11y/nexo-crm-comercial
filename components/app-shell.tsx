'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { signOut } from '@/app/login/actions'

const nav = [
  { title: 'VISÃO GERAL', links: [['Painel', '/'], ['Funil de vendas', '/funil']] },
  { title: 'RELACIONAMENTO', links: [['Clientes', '/clientes'], ['Leads', '/leads'], ['WhatsApp', '/whatsapp'], ['E-mail', '/email'], ['Contadores', '/contadores'], ['Oportunidades', '/oportunidades']] },
  { title: 'COMERCIAL', links: [['Propostas', '/propostas'], ['Contratos', '/contratos'], ['Produtos e serviços', '/produtos'], ['Vendedores', '/vendedores'], ['Metas comerciais', '/metas'], ['Comissões', '/comissoes']] },
  { title: 'ADMINISTRAÇÃO', links: [['Usuários da equipe', '/usuarios']] },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const [dark, setDark] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    try { setDark(localStorage.getItem('nexo-theme') === 'dark') } catch { setDark(false) }
  }, [])

  useEffect(() => { setMobileNavOpen(false) }, [pathname])

  useEffect(() => {
    if (!mobileNavOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileNavOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [mobileNavOpen])

  function toggleTheme() {
    setDark(current => {
      const next = !current
      try { localStorage.setItem('nexo-theme', next ? 'dark' : 'light') } catch { /* tema continua funcional nesta sessão */ }
      return next
    })
  }

  const navItems = (mobile = false) => nav.map(group => <div key={group.title}><p className={`px-3 mb-2 mt-4 text-[10px] font-bold tracking-[.16em] ${mobile ? 'text-slate-500' : 'text-white/50'}`}>{group.title}</p>
    <div className="space-y-0.5">{group.links.map(([label, href]) => {
      const active = pathname === href || (href !== '/' && pathname.startsWith(href))
      return <Link key={href} href={href} aria-current={active ? 'page' : undefined} onClick={() => setMobileNavOpen(false)} className={mobile
        ? `block rounded-lg px-3 py-2.5 text-sm font-medium transition ${active ? 'bg-blue text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'}`
        : `block rounded-lg px-3 py-2.5 text-sm font-medium transition ${active ? 'bg-white/10 font-semibold text-white' : 'text-white/65 hover:bg-white/5 hover:text-white'}`}>{label}</Link>
    })}</div>
  </div>)

  if (pathname === '/login' || pathname === '/cadastro-empresa') return children
  if (pathname.startsWith('/p/')) return children
  // A rota de impressão deve conter somente o documento comercial.
  if (/^\/propostas\/[^/]+\/imprimir$/.test(pathname)) return children

  return <div className={dark ? 'dark-theme min-h-screen' : 'min-h-screen'}>
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-[260px] flex-col bg-navy text-white lg:flex shadow-lg">
      <div className="border-b border-white/10 px-6 py-6"><div className="flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-cyan text-xl font-black text-navy shadow-sm">N</div>
        <div><p className="text-[18px] font-bold tracking-tight">Nexo</p><p className="text-xs text-white/55">CRM Comercial</p></div>
      </div></div>
      <nav className="flex-1 space-y-6 overflow-y-auto px-4 py-6" aria-label="Navegação principal">{navItems()}</nav>
      <div className="border-t border-white/10 p-4"><div className="rounded-xl bg-white/[.06] p-3 border border-white/5"><p className="text-xs font-semibold">Espaço pessoal</p><p className="mt-1 text-[11px] text-white/45">Administrador Nexo</p></div></div>
    </aside>
    <div className="lg:pl-[250px]">
      <header className="app-topbar sticky top-0 z-10 flex h-[72px] items-center justify-between border-b border-slate-200/60 bg-white/95 backdrop-blur-md px-3 sm:px-5 md:px-9 shadow-sm">
        <div className="flex min-w-0 items-center gap-3"><button type="button" aria-label={mobileNavOpen ? 'Fechar menu' : 'Abrir menu'} aria-controls="nexo-mobile-navigation" aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen(!mobileNavOpen)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-ink lg:hidden">☰</button><div><p className="text-xs font-medium text-slate-500 uppercase tracking-[.12em]">Área comercial</p><p className="text-sm font-semibold text-slate-800">Nexo CRM</p></div></div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <button type="button" onClick={toggleTheme} className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-semibold text-slate-600 sm:px-3"><span className="sm:hidden">{dark ? 'Claro' : 'Escuro'}</span><span className="hidden sm:inline">{dark ? 'Tema claro' : 'Tema escuro'}</span></button>
          <form action={signOut}><button className="rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-semibold text-slate-600 sm:px-3">Sair</button></form>
          <div aria-label="Nexo CRM" className="hidden h-9 w-9 place-items-center rounded-full bg-blue-100 text-xs font-bold text-blue-800 sm:grid">NX</div>
        </div>
      </header>
      {mobileNavOpen && <div className="fixed inset-0 z-30 bg-slate-950/55 lg:hidden" role="presentation" onClick={() => setMobileNavOpen(false)}><aside id="nexo-mobile-navigation" role="dialog" aria-modal="true" aria-label="Menu principal" onClick={event => event.stopPropagation()} className="flex h-full w-[min(84vw,320px)] flex-col bg-surface p-4 shadow-xl"><div className="mb-5 flex items-center justify-between border-b border-slate-200 pb-4"><div><p className="font-bold">Nexo CRM</p><p className="text-xs text-muted">Navegação</p></div><button type="button" onClick={() => setMobileNavOpen(false)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold">Fechar</button></div><nav className="flex-1 space-y-7 overflow-y-auto" aria-label="Navegação móvel">{navItems(true)}</nav></aside></div>}
      <main className="mx-auto min-h-[calc(100vh-70px)] max-w-[1600px] px-3 py-5 sm:px-5 sm:py-7 md:px-9 xl:px-12">{children}</main>
    </div>
  </div>
}
