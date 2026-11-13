import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function createAdminClient() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect('/login?reason=session')
  if (user.app_metadata?.crm_admin !== true) redirect('/login?reason=denied')
  return supabase
}
