import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getGmailOAuthConfig, GMAIL_SCOPES } from '@/lib/gmail/server'

export async function GET(request: Request) {
  const config = getGmailOAuthConfig()
  if (!config.configured) return NextResponse.redirect(new URL('/email?gmail=missing-config', request.url))
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.redirect(new URL('/login?reason=session', request.url))
  if (user.app_metadata?.crm_admin !== true) return NextResponse.redirect(new URL('/login?reason=denied', request.url))

  const state = randomBytes(32).toString('base64url')
  const authorization = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authorization.search = new URLSearchParams({
    client_id: config.clientId!, redirect_uri: config.redirectUri!, response_type: 'code',
    scope: GMAIL_SCOPES.join(' '), access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state,
  }).toString()
  const response = NextResponse.redirect(authorization)
  response.cookies.set('nexo_gmail_oauth_state', state, {
    httpOnly: true, secure: new URL(request.url).protocol === 'https:', sameSite: 'lax', path: '/api/gmail/callback', maxAge: 600,
  })
  return response
}
