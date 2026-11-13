'use server'

import { createClient } from '@/lib/supabase/server'

export async function submitPublicAcceptance(token: string, name: string, email: string): Promise<{ ok: boolean; message: string }> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return { ok: false, message: 'Link inválido ou expirado.' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('submit_public_proposal_acceptance', { p_token: token, p_declared_name: name, p_declared_email: email })
  if (error) return { ok: false, message: 'A confirmação pública ainda não está disponível. Verifique a configuração do acesso público.' }
  if (data === 'submitted') return { ok: true, message: 'Manifestação registrada. O aceite ficará pendente de confirmação interna do Nexo.' }
  if (data === 'already_submitted') return { ok: false, message: 'Já existe uma manifestação aguardando confirmação interna para esta versão.' }
  if (data === 'unavailable') return { ok: false, message: 'Esta proposta não pode receber aceite. Confira o status e a validade.' }
  return { ok: false, message: 'Não foi possível validar o link ou os dados informados.' }
}
