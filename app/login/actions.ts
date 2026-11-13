'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function signIn(formData: FormData) {
  const email = formData.get('email')
  const password = formData.get('password')
  if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
    redirect('/login?reason=invalid')
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
  if (error) redirect('/login?reason=invalid')

  // Busca o usuário validado no Auth antes de tomar uma decisão de autorização.
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    await supabase.auth.signOut({ scope: 'local' })
    redirect('/login?reason=session')
  }
  if (user.app_metadata?.crm_admin !== true) {
    await supabase.auth.signOut({ scope: 'local' })
    redirect('/login?reason=denied')
  }

  redirect('/')
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut({ scope: 'local' })
  redirect('/login?reason=logout')
}
