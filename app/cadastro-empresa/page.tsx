import Link from 'next/link'
import { registerCompany } from './actions'

type PageProps = { searchParams: Promise<{ status?: string | string[] }> }

const statusMessages: Record<string, string> = {
  invalid: 'Confira os campos. A senha precisa ter pelo menos 8 caracteres e as senhas devem coincidir.',
  signup_disabled: 'O cadastro público está desativado neste ambiente. O administrador precisa habilitá-lo no servidor.',
  already_signed_in: 'Saia da conta atual antes de cadastrar outra empresa.',
  admin_key_missing: 'O cadastro ainda não está configurado no servidor. Falta configurar a chave administrativa do Supabase.',
  signup_error: 'Não foi possível criar a conta. Confira o e-mail e tente novamente.',
  email_exists: 'Este e-mail já pode estar cadastrado. Tente entrar ou use outro e-mail.',
  company_exists: 'Já existe uma empresa com esse nome. Confira o nome informado.',
  company_error: 'Não foi possível criar o espaço da empresa. Tente novamente mais tarde.',
  membership_error: 'A conta foi iniciada, mas o vínculo da empresa falhou. Entre em contato com o administrador do CRM.',
  claim_error: 'Não foi possível configurar a autorização da conta. Entre em contato com o administrador do CRM.',
  migration_pending: 'O isolamento de empresas ainda não está pronto no banco. Aplique as migrations de empresas antes do cadastro.',
}

export default async function CompanySignupPage({ searchParams }: PageProps) {
  const { status: statusParam } = await searchParams
  const status = Array.isArray(statusParam) ? statusParam[0] : statusParam
  const isConfirmation = status === 'check_email'
  const message = status ? statusMessages[status] : undefined
  const canRegister = process.env.NODE_ENV !== 'production' || process.env.CRM_SELF_REGISTRATION_ENABLED === 'true'

  return <main className="flex min-h-screen items-center justify-center bg-canvas px-5 py-12">
    <section className="w-full max-w-[560px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/5">
      <div className="bg-navy px-8 py-7 text-white">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-cyan text-xl font-black text-navy">N</div>
          <div><p className="text-xl font-bold tracking-tight">Nexo</p><p className="text-sm text-white/65">CRM Comercial</p></div>
        </div>
      </div>
      <div className="p-8">
        <p className="text-xs font-bold uppercase tracking-[.14em] text-blue">Novo espaço comercial</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink">Criar conta da empresa</h1>
        {isConfirmation ? <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm leading-6 text-emerald-900" role="status">
          Se o endereço puder ser cadastrado, enviaremos as instruções de confirmação por e-mail. Depois, entre no Nexo. O primeiro usuário será administrador apenas do espaço desta empresa.
        </div> : <>
          <p className="mt-2 text-sm leading-6 text-muted">Informe os dados da empresa e crie seu próprio acesso. Não é necessário convite.</p>
          {message && <p role="alert" className="mt-5 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">{message}</p>}
          {!canRegister && <p className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">O cadastro público está fechado neste ambiente de produção. Habilite a variável do servidor somente depois de configurar a confirmação de e-mail no Supabase.</p>}
          <form action={registerCompany} className="mt-6 grid gap-4">
            <label className="grid gap-1.5 text-sm font-medium text-ink">Razão social ou nome da empresa
              <input name="company_name" autoComplete="organization" maxLength={120} required className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 font-normal outline-none focus:border-blue focus:ring-2 focus:ring-blue/15" />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-ink">Seu nome
              <input name="owner_name" autoComplete="name" maxLength={120} required className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 font-normal outline-none focus:border-blue focus:ring-2 focus:ring-blue/15" />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-ink">E-mail de acesso
              <input name="email" type="email" autoComplete="email" maxLength={254} required className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 font-normal outline-none focus:border-blue focus:ring-2 focus:ring-blue/15" />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium text-ink">Criar senha
                <input name="password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 font-normal outline-none focus:border-blue focus:ring-2 focus:ring-blue/15" />
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-ink">Confirmar senha
                <input name="password_confirmation" type="password" autoComplete="new-password" minLength={8} maxLength={128} required className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 font-normal outline-none focus:border-blue focus:ring-2 focus:ring-blue/15" />
              </label>
            </div>
            <p className="text-xs leading-5 text-muted">Sua empresa terá dados isolados dos demais espaços neste Supabase. O cadastro não cria outro projeto Supabase.</p>
            <button type="submit" disabled={!canRegister} className="mt-1 rounded-lg bg-blue px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">Criar conta e espaço da empresa</button>
          </form>
        </>}
        <p className="mt-5 text-center text-sm text-muted">Já tem uma conta? <Link href="/login" className="font-semibold text-blue hover:underline">Entrar</Link></p>
      </div>
    </section>
  </main>
}
