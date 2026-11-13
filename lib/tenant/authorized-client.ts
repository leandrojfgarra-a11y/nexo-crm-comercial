import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { resolveTenantContext } from '@/lib/tenant/context'

/**
 * Retorna o cliente autenticado e a empresa validada no servidor.
 * As consultas devem continuar incluindo company_id quando a tabela o possuir;
 * a sessão também mantém as políticas RLS aplicadas, inclusive em views.
 */
export async function createTenantClient() {
  const supabase = await createClient()
  const tenant = await resolveTenantContext(supabase)
  return { supabase, tenant }
}
