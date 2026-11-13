import { PageHeader } from '@/components/ui'
import { createAdminClient } from '@/lib/supabase/admin'
import { createAuthAdminClient } from '@/lib/supabase/admin-auth'
import { createIsolatedCompany, inviteTeamUser } from './actions'

const notices: Record<string, string> = {
  invited: 'Convite enviado. A pessoa poderá definir a senha pelo e-mail recebido.',
  exists: 'Esse e-mail já possui uma conta no Supabase Auth. Não foi enviado outro convite.',
  invalid: 'Informe um e-mail válido e um nome com até 120 caracteres.',
  invite_error: 'Não foi possível enviar o convite. Confira as configurações de e-mail do Supabase Auth.',
  claim_error: 'A conta foi convidada, mas a autorização CRM não foi atribuída. Revise no Supabase Auth antes do primeiro acesso.',
  admin_key_missing: 'Configure SUPABASE_SECRET_KEY somente no servidor para administrar convites e empresas.',
  company_created: 'Empresa isolada criada. Agora selecione-a ao convidar o login correspondente.',
  company_invalid: 'O nome da empresa deve ter entre 2 e 120 caracteres.',
  company_exists: 'Já existe uma empresa com esse nome.',
  company_migration_pending: 'A migration local de empresas ainda não foi aplicada no Supabase.',
  company_required: 'Selecione uma empresa para vincular o novo login.',
  company_forbidden: 'Somente o proprietário do CRM pode criar uma nova empresa isolada.',
  company_error: 'Não foi possível carregar ou criar a empresa. Confira a migration e tente novamente.',
  membership_error: 'O convite não foi concluído porque o login não pôde ser associado à empresa.',
}

type UsersPageProps = { searchParams: Promise<{ status?: string | string[] }> }

export default async function UsersPage({ searchParams }: UsersPageProps) {
  const sessionClient = await createAdminClient()
  const { data: { user: currentUser } } = await sessionClient.auth.getUser()
  const { status: statusParam } = await searchParams
  const status = Array.isArray(statusParam) ? statusParam[0] : statusParam
  const adminAuthReady = Boolean(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)

  let users: any[] = []
  let userLoadError: string | null = null
  let companies: { id: string; name: string; active: boolean }[] = []
  let companySchemaReady = false
  let companySchemaError: { code?: string; message: string } | null = null
  let memberships: { user_id: string; company_id: string; active: boolean }[] = []
  let currentMembership: { company_id: string; role: string; active: boolean } | null = null

  if (adminAuthReady) {
    const admin = createAuthAdminClient()
    const [{ data: authData, error: authError }, companyResult] = await Promise.all([
      admin.auth.admin.listUsers({ page: 1, perPage: 100 }),
      admin.from('crm_companies').select('id,name,active').eq('active', true).order('name'),
    ])
    users = authData?.users ?? []
    userLoadError = authError?.message ?? null
    companySchemaReady = !companyResult.error
    companySchemaError = companyResult.error ? { code: companyResult.error.code, message: companyResult.error.message } : null
    companies = companyResult.data ?? []

    if (companySchemaReady) {
      const [{ data: allMemberships }, { data: ownMembership }] = await Promise.all([
        admin.from('crm_company_members').select('user_id,company_id,active'),
        sessionClient.from('crm_company_members').select('company_id,role,active').eq('user_id', currentUser!.id).maybeSingle(),
      ])
      memberships = allMemberships ?? []
      currentMembership = ownMembership ?? null
      if (currentMembership?.role !== 'owner') {
        companies = companies.filter(company => company.id === currentMembership?.company_id)
        const visibleUserIds = new Set(memberships.filter(member => member.active && member.company_id === currentMembership?.company_id).map(member => member.user_id))
        users = users.filter(authUser => visibleUserIds.has(authUser.id))
      }
    }
  }
  const companyById = new Map(companies.map(company => [company.id, company.name]))
  const companyByUserId = new Map(memberships.filter(member => member.active).map(member => [member.user_id, companyById.get(member.company_id) ?? 'Empresa']))
  const defaultCompany = companies.find(company => company.name === 'Base de testes')?.id ?? companies[0]?.id ?? ''

  return <>
    <PageHeader eyebrow="Administração" title="Usuários e empresas" subtitle="Convide acessos para a mesma equipe ou crie um espaço separado para cada empresa. Cada login pertence a uma única empresa isolada." />
    {status && notices[status] && <p role="status" className={`mb-5 rounded-xl border p-4 text-sm ${status === 'invited' || status === 'company_created' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-950'}`}>{notices[status]}</p>}

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4"><h2 className="font-semibold text-ink">Convidar usuário</h2><p className="mt-1 text-sm text-muted">Usuários associados à mesma empresa compartilham seus dados. Para outra empresa, selecione um espaço isolado.</p></div>
      <form action={inviteTeamUser} className="grid gap-4 p-5 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
        <label className="grid gap-1.5 text-sm font-medium text-ink">Nome
          <input name="name" maxLength={120} className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal outline-none focus:border-blue focus:ring-2 focus:ring-blue/15" placeholder="Nome da pessoa" />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-ink">E-mail
          <input name="email" type="email" required maxLength={254} className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal outline-none focus:border-blue focus:ring-2 focus:ring-blue/15" placeholder="pessoa@empresa.com.br" />
        </label>
        {companySchemaReady && <label className="grid gap-1.5 text-sm font-medium text-ink">Empresa do acesso
          <select name="company_id" required defaultValue={defaultCompany} className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal outline-none focus:border-blue focus:ring-2 focus:ring-blue/15">
            {companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}
          </select>
        </label>}
        <button disabled={!adminAuthReady || (companySchemaReady && !companies.length)} className="crm-button crm-button-primary" type="submit">Enviar convite</button>
      </form>
    </section>

    <section className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4"><h2 className="font-semibold text-ink">Empresas isoladas</h2><p className="mt-1 text-sm text-muted">Os dados atuais serão preservados na Base de testes. Cada nova empresa usa o mesmo Supabase, com acesso aos próprios registros. Apenas o proprietário do CRM cria espaços isolados.</p></div>
      {companySchemaReady ? <>
        {currentMembership?.role === 'owner' && <form action={createIsolatedCompany} className="flex flex-col gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-end">
          <label className="grid flex-1 gap-1.5 text-sm font-medium text-ink">Nova empresa
            <input name="name" required minLength={2} maxLength={120} className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal outline-none focus:border-blue focus:ring-2 focus:ring-blue/15" placeholder="Ex.: Empresa Comercial" />
          </label>
          <button disabled={!adminAuthReady} className="crm-button crm-button-primary" type="submit">Criar empresa</button>
        </form>}
        {companies.length ? <ul className="divide-y divide-slate-200">{companies.map(company => <li key={company.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm"><span className="font-medium text-ink">{company.name}</span><span className="text-muted">{memberships.filter(m => m.company_id === company.id && m.active).length} login(s) vinculado(s)</span></li>)}</ul> : <p className="p-5 text-sm text-muted">Nenhuma empresa ativa foi encontrada.</p>}
      </> : <div className="space-y-2 p-5 text-sm text-muted">
        {companySchemaError?.code === 'PGRST205' || companySchemaError?.code === '42P01'
          ? <p>O endpoint do Supabase não encontrou <code>public.crm_companies</code>. Se o SQL Editor confirmou sucesso, confira se o CRM e o SQL Editor apontam para o mesmo projeto e atualize o cache de schema da API do Supabase.</p>
          : <p>A API do Supabase não conseguiu consultar a tabela de empresas. A migration pode estar aplicada; verifique a mensagem abaixo antes de executar qualquer SQL novamente.</p>}
        {companySchemaError && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-950">Diagnóstico da API: {companySchemaError.code || 'sem código'} — {companySchemaError.message}</p>}
        <p>Enquanto isso, os convites continuam pertencendo à equipe atual; nenhuma empresa nova pode ser criada nesta tela ainda.</p>
      </div>}
    </section>

    <section className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><h2 className="font-semibold text-ink">Contas cadastradas</h2><span className="text-sm text-muted">{users.length} exibidas (máximo 100)</span></div>
      {!adminAuthReady ? <p className="p-5 text-sm text-muted">Configure a chave administrativa no servidor para listar contas e enviar convites. Ela não deve usar o prefixo NEXT_PUBLIC_.</p> : userLoadError ? <p role="alert" className="p-5 text-sm text-red-700">Não foi possível carregar as contas: {userLoadError}</p> : users.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Usuário</th><th className="px-5 py-3">E-mail</th><th className="px-5 py-3">Empresa</th><th className="px-5 py-3">Situação</th><th className="px-5 py-3">Último acesso</th></tr></thead><tbody>{users.map(user => <tr key={user.id} className="border-t border-slate-200"><td className="px-5 py-3 font-medium text-ink">{String(user.user_metadata?.full_name ?? '—')}</td><td className="px-5 py-3 text-ink">{user.email ?? '—'}</td><td className="px-5 py-3 text-ink">{companySchemaReady ? companyByUserId.get(user.id) ?? 'Sem empresa vinculada' : 'Equipe compartilhada'}</td><td className="px-5 py-3 text-ink">{user.email_confirmed_at ? 'Ativo' : 'Convite pendente'}</td><td className="px-5 py-3 text-muted">{user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString('pt-BR') : 'Ainda não entrou'}</td></tr>)}</tbody></table></div> : <p className="p-5 text-sm text-muted">Nenhuma conta encontrada.</p>}
    </section>
    <p className="mt-4 text-xs leading-5 text-muted">A SUPABASE_SECRET_KEY é usada somente no servidor para convites e configuração de empresas; ela nunca é enviada ao navegador. Os dados atuais permanecem na Base de testes quando a migration for aplicada.</p>
  </>
}
