import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) throw new Error('Configure as variáveis do Supabase antes de iniciar o CRM.')

  let response = NextResponse.next({ request })
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })

  // Valida a sessão no Auth; não confia em dados de cookie sem verificação.
  const { data: { user }, error } = await supabase.auth.getUser()
  const isLogin = request.nextUrl.pathname === '/login'
  const isCompanySignup = request.nextUrl.pathname === '/cadastro-empresa'
  const isAuthEntry = isLogin || isCompanySignup
  const isAdmin = user?.app_metadata?.crm_admin === true

  if (!isAuthEntry && (!user || error || !isAdmin)) {
    const reason = user && !isAdmin ? 'denied' : 'session'
    const redirect = NextResponse.redirect(new URL(`/login?reason=${reason}`, request.url))
    response.cookies.getAll().forEach(cookie => redirect.cookies.set(cookie))
    return redirect
  }

  if (isAuthEntry && isAdmin) {
    const redirect = NextResponse.redirect(new URL('/', request.url))
    response.cookies.getAll().forEach(cookie => redirect.cookies.set(cookie))
    return redirect
  }

  return response
}
