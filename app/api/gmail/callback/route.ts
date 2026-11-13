import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { encryptGmailToken, getGmailOAuthConfig, GMAIL_SCOPES } from '@/lib/gmail/server'
import { resolveTenantContext } from '@/lib/tenant/context'

type GoogleTokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string }
type GoogleProfile = { email?: string; email_verified?: boolean; verified_email?: boolean }

function returnTo(request: NextRequest, result: string) {
  return NextResponse.redirect(new URL(`/email?gmail=${encodeURIComponent(result)}`, request.url))
}

export async function GET(request: NextRequest) {
  const stateCookie = request.cookies.get('nexo_gmail_oauth_state')?.value
  const responseState = request.nextUrl.searchParams.get('state')
  const code = request.nextUrl.searchParams.get('code')
  const oauthError = request.nextUrl.searchParams.get('error')
  const response = (result: string) => {
    const redirect = returnTo(request, result)
    redirect.cookies.delete('nexo_gmail_oauth_state')
    return redirect
  }
  if (!stateCookie || !responseState || stateCookie !== responseState) return response('state-error')
  if (oauthError || !code) return response(oauthError === 'access_denied' ? 'cancelled' : 'oauth-error')
  const config = getGmailOAuthConfig()
  if (!config.configured) return response('missing-config')

  const supabase = await createClient()
  let tenant
  try { tenant = await resolveTenantContext(supabase) }
  catch { return NextResponse.redirect(new URL('/login?reason=denied', request.url)) }

  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, cache: 'no-store',
      body: new URLSearchParams({ code, client_id: config.clientId!, client_secret: config.clientSecret!, redirect_uri: config.redirectUri!, grant_type: 'authorization_code' }),
    })
    const tokens = await tokenResponse.json() as GoogleTokenResponse
    if (!tokenResponse.ok || !tokens.access_token) return response('token-exchange-error')

    const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }, cache: 'no-store',
    })
    const profile = await profileResponse.json() as GoogleProfile
    const emailVerified = profile.email_verified ?? profile.verified_email
    if (!profileResponse.ok || !profile.email || emailVerified !== true) return response('profile-error')

    const { data: previous } = await supabase.from('gmail_connections')
      .select('refresh_token_encrypted').eq('company_id', tenant.companyId).maybeSingle()
    const refreshToken = tokens.refresh_token
      ? encryptGmailToken(tokens.refresh_token)
      : previous?.refresh_token_encrypted
    if (!refreshToken) return response('refresh-token-missing')
    const scopes = (tokens.scope ?? GMAIL_SCOPES.join(' ')).split(/\s+/).filter(Boolean)
    const { error: saveError } = await supabase.from('gmail_connections').upsert({
      company_id: tenant.companyId, connected_by: tenant.userId, email: profile.email.toLowerCase(),
      access_token_encrypted: encryptGmailToken(tokens.access_token), refresh_token_encrypted: refreshToken,
      access_token_expires_at: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
      granted_scopes: scopes, updated_at: new Date().toISOString(),
    }, { onConflict: 'company_id' })
    if (saveError) return response('save-error')
    return response('connected')
  } catch {
    return response('connection-error')
  }
}
