import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

export function proxy(request: NextRequest) {
  // Links públicos usam apenas RPCs SECURITY DEFINER com retorno limitado;
  // todas as demais rotas continuam exigindo sessão administrativa.
  if (/^\/p\/[A-Za-z0-9_-]{43}\/?$/.test(request.nextUrl.pathname)) return NextResponse.next()
  return updateSession(request)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
