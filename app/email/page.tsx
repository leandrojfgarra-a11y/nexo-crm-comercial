import { PageHeader } from '@/components/ui'
import { GmailWorkspace } from '@/components/gmail-workspace'
import { getGmailOAuthConfig } from '@/lib/gmail/server'
import { createAdminClient } from '@/lib/supabase/admin'

export default async function EmailPage({ searchParams }: { searchParams: Promise<{ gmail?: string }> }) {
  const query = await searchParams
  const supabase = await createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membership } = user ? await supabase.from('crm_company_members').select('company_id').eq('user_id', user.id).eq('active', true).maybeSingle() : { data: null }
  const result = membership?.company_id
    ? await supabase.from('gmail_connections').select('email').eq('company_id', membership.company_id).maybeSingle()
    : { data: null, error: null }
  return <div>
    <PageHeader eyebrow="Relacionamento · E-mail" title="Gmail no Nexo" subtitle="Consulte a caixa de entrada e envie mensagens pela conta Google conectada." />
    <GmailWorkspace email={result.data?.email ?? null} configured={getGmailOAuthConfig().configured} schemaReady={!result.error} notice={query.gmail ?? ''} />
  </div>
}
