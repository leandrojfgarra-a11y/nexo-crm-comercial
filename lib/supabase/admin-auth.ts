import 'server-only'
import { createClient } from '@supabase/supabase-js'

/** Cliente exclusivo de tarefas administrativas do Auth; nunca importar no navegador. */
export function createAuthAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !secretKey) throw new Error('Configure SUPABASE_SECRET_KEY somente no servidor para administrar usuários.')
  return createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
