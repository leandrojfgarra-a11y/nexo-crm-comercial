import { signIn } from './actions'
import Link from 'next/link'

type LoginPageProps = { searchParams: Promise<{ reason?: string | string[] }> }

const messages: Record<string, string> = {
  invalid: 'E-mail ou senha inválidos. Confira os dados e tente novamente.',
  denied: 'Esta conta não tem autorização de administrador para acessar o Nexo CRM.',
  session: 'Sua sessão expirou ou não pôde ser validada. Entre novamente.',
  logout: 'Você saiu do Nexo CRM com segurança.',
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { reason: reasonParam } = await searchParams
  const reason = Array.isArray(reasonParam) ? reasonParam[0] : reasonParam
  const message = reason ? messages[reason] : undefined

  return <main className="flex min-h-screen items-center justify-center bg-canvas px-5 py-12">
    <section className="w-full max-w-[420px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/5">
      <div className="bg-navy px-8 py-7 text-white">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-cyan text-xl font-black text-navy">N</div>
          <div><p className="text-xl font-bold tracking-tight">Nexo</p><p className="text-sm text-white/65">CRM Comercial</p></div>
        </div>
      </div>
      <div className="p-8">
        <p className="text-xs font-bold uppercase tracking-[.14em] text-blue">Acesso à empresa</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink">Entrar no CRM</h1>
        <p className="mt-2 text-sm text-muted">Entre com seu e-mail e senha para acessar o espaço da sua empresa.</p>
        {message && <p role="status" className={`mt-5 rounded-lg px-4 py-3 text-sm ${reason === 'logout' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}>{message}</p>}
        <form action={signIn} className="mt-6 grid gap-4">
          <label className="grid gap-1.5 text-sm font-medium text-ink">E-mail
            <input name="email" type="email" autoComplete="username" required className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 font-normal outline-none focus:border-blue focus:ring-2 focus:ring-blue/15" />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-ink">Senha
            <input name="password" type="password" autoComplete="current-password" required className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 font-normal outline-none focus:border-blue focus:ring-2 focus:ring-blue/15" />
          </label>
          <button type="submit" className="mt-1 rounded-lg bg-blue px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700">Entrar</button>
        </form>
        <p className="mt-5 text-center text-sm text-muted">Sua empresa ainda não tem acesso? <Link href="/cadastro-empresa" className="font-semibold text-blue hover:underline">Criar conta da empresa</Link></p>
      </div>
    </section>
  </main>
}
