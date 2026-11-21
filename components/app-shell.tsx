'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { signOut } from '@/app/login/actions'
import { getMobileMenuFocusTarget, shouldRestoreMobileMenuFocus } from '@/lib/mobile-menu-focus'
import shellStyles from './app-shell.module.css'

const nav = [
  { title: 'VISÃO GERAL', links: [['Painel', '/'], ['Funil de vendas', '/funil']] },
  { title: 'RELACIONAMENTO', links: [['Clientes', '/clientes'], ['Leads', '/leads'], ['Agenda', '/agenda'], ['WhatsApp', '/whatsapp'], ['E-mail', '/email'], ['Contadores', '/contadores'], ['Oportunidades', '/oportunidades']] },
  { title: 'COMERCIAL', links: [['Propostas', '/propostas'], ['Contratos', '/contratos'], ['Produtos e serviços', '/produtos'], ['Vendedores', '/vendedores'], ['Metas comerciais', '/metas'], ['Comissões', '/comissoes']] },
  { title: 'ADMINISTRAÇÃO', links: [['Usuários da equipe', '/usuarios']] },
]

const navIconPaths: Record<string, string> = {
  '/': 'M3 10.5 12 3l9 7.5M5.5 9v11h13V9M9 20v-6h6v6',
  '/funil': 'M3 4h18l-7 8v6l-4 2v-8z',
  '/clientes': 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  '/leads': 'M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M8.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M19 8v6M22 11h-6',
  '/agenda': 'M8 3v4M16 3v4M4 9h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1zM8 13h3M8 17h3',
  '/whatsapp': 'M20.5 11.5a8.5 8.5 0 0 1-12.57 7.45L3 20l1.05-4.93A8.5 8.5 0 1 1 20.5 11.5zM8 8.5c.7 2.2 2.3 3.8 4.5 4.5l1.3-1.2 2 .8-.2 1.8c-4.2.4-8.3-3.7-7.9-7.9l1.8-.2.8 2z',
  '/email': 'M3 5h18v14H3zM3 6l9 7 9-7',
  '/contadores': 'M4 21V5l8-3 8 3v16M2 21h20M8 8h1M15 8h1M8 12h1M15 12h1M10 21v-5h4v5',
  '/oportunidades': 'M12 3v4M12 17v4M3 12h4M17 12h4M5.64 5.64l2.83 2.83M15.53 15.53l2.83 2.83M18.36 5.64l-2.83 2.83M8.47 15.53l-2.83 2.83M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z',
  '/propostas': 'M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7',
  '/contratos': 'M3 8h18v12H3zM8 8V5h8v3M3 12h18M10 12v2h4v-2',
  '/produtos': 'm12 3 9 5-9 5-9-5 9-5zM3 8v9l9 5 9-5V8M12 13v9',
  '/vendedores': 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  '/metas': 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  '/comissoes': 'M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6',
  '/usuarios': 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
}

function NavIcon({ href }: { href: string }) {
  return <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0">
    <path d={navIconPaths[href] ?? navIconPaths['/']} />
  </svg>
}

function MenuIcon({ open }: { open: boolean }) {
  return <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-4 w-4">
    {open ? <path d="m6 6 12 12M18 6 6 18" /> : <path d="M4 6h16M4 12h16M4 18h16" />}
  </svg>
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [dark, setDark] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const pathname = usePathname()
  const mobileNavTriggerRef = useRef<HTMLButtonElement>(null)
  const mobileNavCloseRef = useRef<HTMLButtonElement>(null)
  const mobileNavPanelRef = useRef<HTMLElement>(null)
  const mobileNavWasOpenRef = useRef(false)
  const mobileNavOpenedPathRef = useRef<string | null>(null)
  const mobileNavCloseReasonRef = useRef<'dismiss' | 'navigation'>('dismiss')

  function closeMobileMenu(reason: 'dismiss' | 'navigation' = 'dismiss') {
    mobileNavCloseReasonRef.current = reason
    setMobileNavOpen(false)
  }

  function openMobileMenu() {
    mobileNavOpenedPathRef.current = pathname
    mobileNavCloseReasonRef.current = 'dismiss'
    setMobileNavOpen(true)
  }

  function handleMobileMenuKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== 'Tab') return
    const panel = mobileNavPanelRef.current
    if (!panel) return

    const focusableElements = Array.from(panel.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ))
    const target = getMobileMenuFocusTarget(focusableElements, document.activeElement, event.shiftKey)
    if (target) {
      event.preventDefault()
      focusableElements[target === 'first' ? 0 : focusableElements.length - 1]?.focus()
    } else if (focusableElements.length === 0) {
      event.preventDefault()
      panel.focus()
    }
  }

  useEffect(() => {
    try { setDark(localStorage.getItem('nexo-theme') === 'dark') } catch { setDark(false) }
  }, [])

  useEffect(() => {
    mobileNavCloseReasonRef.current = 'navigation'
    setMobileNavOpen(false)
  }, [pathname])

  useEffect(() => {
    if (mobileNavOpen) {
      mobileNavWasOpenRef.current = true
      mobileNavCloseReasonRef.current = 'dismiss'
      ;(mobileNavCloseRef.current ?? mobileNavPanelRef.current?.querySelector<HTMLElement>('a[href]'))?.focus()
      return
    }

    if (!mobileNavWasOpenRef.current) return
    mobileNavWasOpenRef.current = false
    if (shouldRestoreMobileMenuFocus({
      closeReason: mobileNavCloseReasonRef.current,
      currentPath: pathname,
      openedPath: mobileNavOpenedPathRef.current,
      triggerAvailable: Boolean(mobileNavTriggerRef.current?.isConnected && mobileNavTriggerRef.current.getClientRects().length > 0),
    })) {
      mobileNavTriggerRef.current?.focus()
    }
  }, [mobileNavOpen, pathname])

  useEffect(() => {
    if (!mobileNavOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMobileMenu('dismiss')
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

  const navItems = () => nav.map(group => <section key={group.title}>
    <p className="mb-1.5 mt-3 px-2 text-[10px] font-bold tracking-[.14em] text-white/45">{group.title}</p>
    <div className="space-y-0.5">{group.links.map(([label, href]) => {
      const active = pathname === href || (href !== '/' && pathname.startsWith(href))
      return <Link key={href} href={href} aria-current={active ? 'page' : undefined} onClick={() => closeMobileMenu('navigation')} className={`group flex min-h-9 items-center gap-2.5 rounded-md border-l-2 px-2.5 py-1.5 text-[13px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/70 ${active ? 'border-cyan bg-white/10 font-semibold text-white shadow-sm' : 'border-transparent text-white/70 hover:bg-white/[.07] hover:text-white'}`}>
        <span className={active ? 'text-cyan' : 'text-white/55 group-hover:text-white/80'}><NavIcon href={href} /></span>
        <span className="truncate">{label}</span>
      </Link>
    })}</div>
  </section>)

  if (pathname === '/login' || pathname === '/cadastro-empresa') return children
  if (pathname.startsWith('/p/')) return children
  // A rota de impressão deve conter somente o documento comercial.
  if (/^\/propostas\/[^/]+\/imprimir$/.test(pathname)) return children

  return <div className={dark ? 'dark-theme min-h-screen' : 'min-h-screen'}>
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-[240px] flex-col bg-navy text-white shadow-md lg:flex">
      <div className="border-b border-white/10 px-4 py-4"><div className="flex items-center gap-2.5">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-cyan text-lg font-black text-navy shadow-sm">N</div>
        <div><p className="text-base font-bold tracking-tight">Nexo</p><p className="text-[11px] text-white/60">CRM Comercial</p></div>
      </div></div>
      <nav className="flex-1 space-y-2 overflow-y-auto px-3 py-3" aria-label="Navegação principal">{navItems()}</nav>
      <div className="border-t border-white/10 p-3"><div className="rounded-lg border border-white/5 bg-white/[.06] p-2.5"><p className="text-xs font-semibold">Espaço pessoal</p><p className="mt-0.5 text-[11px] text-white/50">Administrador Nexo</p></div></div>
    </aside>
    <div className="lg:pl-[240px]">
      <header className={`${shellStyles.topbar} sticky top-0 z-10 flex h-[60px] items-center justify-between border-b px-3 shadow-sm backdrop-blur-md sm:px-4 md:px-6`}>
        <div className="flex min-w-0 items-center gap-2.5 sm:gap-3"><button ref={mobileNavTriggerRef} type="button" aria-label={mobileNavOpen ? 'Fechar menu' : 'Abrir menu'} aria-controls="nexo-mobile-navigation" aria-expanded={mobileNavOpen} onClick={() => mobileNavOpen ? closeMobileMenu('dismiss') : openMobileMenu()} className="grid h-9 w-9 place-items-center rounded-md border border-slate-300 bg-white text-slate-700 transition hover:border-blue hover:text-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue/40 lg:hidden"><MenuIcon open={mobileNavOpen} /></button><div className="hidden h-8 w-8 place-items-center rounded-md bg-blue-50 text-xs font-bold text-blue-800 sm:grid">N</div><div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[.12em] text-slate-500">Nexo CRM</p><p className="truncate text-sm font-semibold text-slate-800">Comercial</p></div></div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <button type="button" onClick={toggleTheme} className="btn-base btn-secondary btn-sm"><span className="sm:hidden">{dark ? 'Claro' : 'Escuro'}</span><span className="hidden sm:inline">{dark ? 'Tema claro' : 'Tema escuro'}</span></button>
          <form action={signOut}><button className="btn-base btn-secondary btn-sm">Sair</button></form>
          <div aria-label="Nexo CRM" className="hidden h-9 w-9 place-items-center rounded-full bg-blue-100 text-xs font-bold text-blue-800 sm:grid">NX</div>
        </div>
      </header>
      {mobileNavOpen && <div className="fixed inset-0 z-30 bg-slate-950/60 lg:hidden" role="presentation" onClick={() => closeMobileMenu('dismiss')}><aside ref={mobileNavPanelRef} id="nexo-mobile-navigation" role="dialog" aria-modal="true" aria-label="Menu principal" tabIndex={-1} onKeyDown={handleMobileMenuKeyDown} onClick={event => event.stopPropagation()} className="flex h-full w-[min(84vw,320px)] flex-col bg-navy p-3.5 text-white shadow-2xl"><div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3"><div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-md bg-cyan font-bold text-navy">N</span><div><p className="text-sm font-bold">Nexo CRM</p><p className="text-[11px] text-white/55">Comercial</p></div></div><button ref={mobileNavCloseRef} type="button" onClick={() => closeMobileMenu('dismiss')} className="grid h-9 w-9 place-items-center rounded-md border border-white/20 bg-white/5 text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/70" aria-label="Fechar menu"><MenuIcon open /></button></div><nav className="flex-1 space-y-2 overflow-y-auto" aria-label="Navegação móvel">{navItems()}</nav></aside></div>}
      <main className="app-main mx-auto min-h-[calc(100vh-60px)] max-w-[1720px] px-3 py-4 sm:px-4 sm:py-5 md:px-6 xl:px-8">{children}</main>
    </div>
  </div>
}
