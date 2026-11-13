import 'server-only'

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { resolveTenantContext } from '@/lib/tenant/context'

export const GMAIL_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
]

export type GmailConnection = {
  id: string
  company_id: string
  connected_by: string
  email: string
  access_token_encrypted: string
  refresh_token_encrypted: string
  access_token_expires_at: string
  granted_scopes: string[]
}

export function getGmailOAuthConfig() {
  const clientId = process.env.GMAIL_CLIENT_ID?.trim()
  const clientSecret = process.env.GMAIL_CLIENT_SECRET?.trim()
  const redirectUri = process.env.GMAIL_REDIRECT_URI?.trim()
  const encryptionKey = process.env.GMAIL_TOKEN_ENCRYPTION_KEY?.trim()
  return { clientId, clientSecret, redirectUri, encryptionKey, configured: Boolean(clientId && clientSecret && redirectUri && encryptionKey) }
}

function keyBytes() {
  const value = getGmailOAuthConfig().encryptionKey
  if (!value) throw new Error('Configure as variáveis privadas da integração Gmail no servidor.')
  const key = Buffer.from(value, 'base64')
  if (key.length !== 32) throw new Error('GMAIL_TOKEN_ENCRYPTION_KEY precisa ser uma chave Base64 de 32 bytes.')
  return key
}

export function encryptGmailToken(value: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', keyBytes(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), encrypted].map(part => part.toString('base64url')).join('.')
}

export function decryptGmailToken(value: string) {
  const [ivPart, tagPart, dataPart] = value.split('.')
  if (!ivPart || !tagPart || !dataPart) throw new Error('Credencial Gmail armazenada em formato inválido.')
  const decipher = createDecipheriv('aes-256-gcm', keyBytes(), Buffer.from(ivPart, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(dataPart, 'base64url')), decipher.final()]).toString('utf8')
}

export async function getGmailContext() {
  const supabase = await createClient()
  const tenant = await resolveTenantContext(supabase)
  return { supabase, user: { id: tenant.userId }, companyId: tenant.companyId }
}

export async function loadGmailConnection() {
  const context = await getGmailContext()
  const { data, error } = await context.supabase.from('gmail_connections')
    .select('id,company_id,connected_by,email,access_token_encrypted,refresh_token_encrypted,access_token_expires_at,granted_scopes')
    .eq('company_id', context.companyId).maybeSingle()
  if (error) throw new Error('A estrutura da integração Gmail não está disponível. Aplique a migration localmente preparada.')
  return { ...context, connection: data as GmailConnection | null }
}

type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string; error_description?: string }

export async function getGmailAccessToken(context: Awaited<ReturnType<typeof loadGmailConnection>>) {
  const { connection, supabase, companyId, user } = context
  if (!connection) throw new Error('Conecte uma conta Gmail antes de acessar as mensagens.')
  const expiresAt = Date.parse(connection.access_token_expires_at)
  if (Number.isFinite(expiresAt) && expiresAt > Date.now() + 60_000) return decryptGmailToken(connection.access_token_encrypted)

  const config = getGmailOAuthConfig()
  if (!config.clientId || !config.clientSecret) throw new Error('As credenciais OAuth Gmail não estão configuradas no servidor.')
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, cache: 'no-store',
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, refresh_token: decryptGmailToken(connection.refresh_token_encrypted), grant_type: 'refresh_token' }),
  })
  const token = await response.json() as TokenResponse
  if (!response.ok || !token.access_token) throw new Error(token.error === 'invalid_grant' ? 'A autorização Gmail expirou ou foi revogada. Desconecte e conecte a conta novamente.' : 'O Google não renovou a sessão Gmail. Tente reconectar a conta.')
  const nextExpiry = new Date(Date.now() + (token.expires_in ?? 3600) * 1000).toISOString()
  const { error } = await supabase.from('gmail_connections').update({
    access_token_encrypted: encryptGmailToken(token.access_token), access_token_expires_at: nextExpiry,
    updated_at: new Date().toISOString(), connected_by: user.id,
  }).eq('company_id', companyId)
  if (error) throw new Error('Não foi possível atualizar com segurança a conexão Gmail.')
  return token.access_token
}

export async function gmailFetch<T>(context: Awaited<ReturnType<typeof loadGmailConnection>>, path: string, init?: RequestInit): Promise<T> {
  const accessToken = await getGmailAccessToken(context)
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    ...init, cache: 'no-store', headers: { Authorization: `Bearer ${accessToken}`, ...(init?.headers ?? {}) },
  })
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error('O Gmail recusou a autorização. Verifique o consentimento e os escopos autorizados.')
    throw new Error(`Falha ao consultar o Gmail (HTTP ${response.status}).`)
  }
  return response.json() as Promise<T>
}

export function decodeGmailBody(data?: string) {
  if (!data) return ''
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
}

export function extractPlainText(payload: any): string {
  if (!payload) return ''
  if (payload.mimeType === 'text/plain' && payload.body?.data) return decodeGmailBody(payload.body.data)
  for (const part of payload.parts ?? []) {
    const found = extractPlainText(part)
    if (found) return found
  }
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    return decodeGmailBody(payload.body.data).replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim()
  }
  return ''
}

export function getHeader(headers: Array<{ name: string; value: string }> | undefined, key: string) {
  return headers?.find(header => header.name.toLowerCase() === key.toLowerCase())?.value ?? ''
}

export function jsonError(message: string, status = 400) {
  return Response.json({ ok: false, error: message }, { status, headers: { 'Cache-Control': 'no-store' } })
}
