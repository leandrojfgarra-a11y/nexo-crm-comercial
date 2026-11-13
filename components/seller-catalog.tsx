'use client'

import { useEffect, useMemo, useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { saveSeller, searchInternalAuthUsers, setSellerActive, type AuthUserOption } from '@/app/vendedores/actions'
import { table, th, td } from '@/components/ui'

export type SellerCatalogItem = {
  id: string; name: string; email: string | null; phone: string | null; active: boolean
  seller_type?: 'internal'|'external'|null; user_id?: string | null
  installation_commission_percent?: number|string; monthly_commission_percent?: number|string
  monthly_commission_mode?: 'none'|'single'|'recurring'; monthly_commission_competencies?: number|null
  monthly_installation_goal_count?: number|null
  openOpportunityCount?: number | null
}

const typeLabel = (type: SellerCatalogItem['seller_type']) => type === 'internal' ? 'Interno' : type === 'external' ? 'Externo' : 'Não classificado'

export function SellerCatalog({ sellers, schemaReady, installationGoalSchemaReady, loadError, opportunityCountError }: {
  sellers: SellerCatalogItem[]; schemaReady: boolean; installationGoalSchemaReady: boolean; loadError: string | null; opportunityCountError: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [editing, setEditing] = useState<SellerCatalogItem | null>(null)
  const [sellerType, setSellerType] = useState('internal')
  const [monthlyMode, setMonthlyMode] = useState<'none'|'single'|'recurring'>('single')
  const [selectedAuthUser, setSelectedAuthUser] = useState<AuthUserOption | null>(null)
  const [authSearch, setAuthSearch] = useState('')
  const [authUsers, setAuthUsers] = useState<AuthUserOption[]>([])
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState('')
  const [message, setMessage] = useState('')
  const [messageOk, setMessageOk] = useState<boolean|null>(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const visible = useMemo(() => sellers.filter(seller => {
    const terms = [seller.name,seller.email,seller.phone,seller.user_id].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR')
    return (!search || terms.includes(search.toLocaleLowerCase('pt-BR'))) &&
      (typeFilter === 'all' || seller.seller_type === typeFilter) &&
      (statusFilter === 'all' || String(seller.active) === statusFilter)
  }), [sellers, search, typeFilter, statusFilter])
  const input = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-blue focus:ring-2 focus:ring-blue/15'
  const label = 'flex flex-col gap-1.5 text-sm font-medium text-ink'
  const section = 'card-base p-5'

  useEffect(() => {
    if (sellerType !== 'internal' || authSearch.trim().length < 2) { setAuthUsers([]); setAuthLoading(false); return }
    let active = true
    const timer = setTimeout(() => {
      setAuthLoading(true); setAuthError('')
      searchInternalAuthUsers(authSearch.trim(), editing?.id ?? '')
        .then(result => { if (!active) return; if (result.ok) setAuthUsers(result.users); else { setAuthUsers([]); setAuthError(result.message ?? 'Falha na pesquisa.') } })
        .catch(() => { if (active) { setAuthUsers([]); setAuthError('Não foi possível pesquisar usuários.') } })
        .finally(() => { if (active) setAuthLoading(false) })
    }, 250)
    return () => { active = false; clearTimeout(timer) }
  }, [authSearch, sellerType, editing?.id])

  useEffect(() => {
    let active = true
    if (sellerType !== 'internal' || !editing?.user_id) return () => { active = false }
    setSelectedAuthUser({ id: editing.user_id, name: 'Usuário vinculado', email: null })
    searchInternalAuthUsers('', editing.id, editing.user_id).then(result => {
      if (active && result.ok && result.users[0]) setSelectedAuthUser(result.users[0])
      if (active && !result.ok) setAuthError(result.message ?? 'Não foi possível carregar o usuário vinculado.')
    }).catch(() => { if (active) setAuthError('Não foi possível carregar o usuário vinculado.') })
    return () => { active = false }
  }, [editing?.id, editing?.user_id, sellerType])

  function startCreate() {
    setEditing(null); setSellerType('internal'); setMonthlyMode('single'); setSelectedAuthUser(null); setAuthSearch(''); setAuthUsers([]); setAuthError(''); setMessage(''); setMessageOk(null)
  }
  function startEdit(seller: SellerCatalogItem) {
    setEditing(seller); setSellerType(seller.seller_type ?? (seller.user_id ? 'internal' : '')); setMonthlyMode(seller.monthly_commission_mode ?? 'single'); setSelectedAuthUser(null); setAuthSearch(''); setAuthUsers([]); setAuthError(''); setMessage(''); setMessageOk(null)
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const value = {
      id: String(form.get('id') ?? '') || undefined,
      name: String(form.get('name') ?? ''), sellerType: String(form.get('sellerType') ?? '') as 'internal'|'external',
      userId: String(form.get('userId') ?? ''), email: String(form.get('email') ?? ''), phone: String(form.get('phone') ?? ''),
      installationCommissionPercent: String(form.get('installationCommissionPercent') ?? ''),
      monthlyCommissionPercent: monthlyMode === 'none' ? '0' : String(form.get('monthlyCommissionPercent') ?? ''),
      monthlyCommissionMode: String(form.get('monthlyCommissionMode') ?? 'single') as 'none'|'single'|'recurring',
      monthlyCommissionCompetencies: String(form.get('monthlyCommissionCompetencies') ?? ''),
      monthlyInstallationGoalCount: String(form.get('monthlyInstallationGoalCount') ?? ''), active: form.has('active'),
    }
    setMessage(''); setMessageOk(null)
    startTransition(async () => {
      const result = await saveSeller(value)
      setMessage(result.message); setMessageOk(result.ok)
      if (result.ok) { setEditing(null); setSellerType('internal'); setMonthlyMode('single'); setSelectedAuthUser(null); setAuthSearch(''); router.refresh() }
    })
  }
  function toggle(seller: SellerCatalogItem) {
    setMessage(''); setMessageOk(null)
    startTransition(async () => {
      const result = await setSellerActive(seller.id, seller.active)
      setMessage(result.message); setMessageOk(result.ok)
      if (result.ok) router.refresh()
    })
  }
  const pct = (value: number|string|undefined) => value == null ? '0,00%' : `${Number(value).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}%`

  return (
    <div className="space-y-5">
      {loadError && <p role="alert" className="msg-base msg-danger">{loadError}</p>}
      {message && <p role={messageOk ? 'status' : 'alert'} className={`msg-base ${messageOk ? 'msg-success' : 'msg-danger'}`}>{message}</p>}

      {/* Listagem */}
      <section id="vendedores-lista" className={section}>
        <div className="grid gap-3 border-b border-slate-200 p-4 sm:grid-cols-[minmax(220px,1fr)_190px_170px_auto]">
          <label className={label}>
            Pesquisar
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Nome, e-mail, telefone ou usuário" className={input} />
          </label>
          <label className={label}>
            Tipo
            <select value={typeFilter} onChange={event => setTypeFilter(event.target.value)} className={input}>
              <option value="all">Todos</option>
              <option value="internal">Interno</option>
              <option value="external">Externo</option>
            </select>
          </label>
          <label className={label}>
            Status
            <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className={input}>
              <option value="all">Todos</option>
              <option value="true">Ativos</option>
              <option value="false">Inativos</option>
            </select>
          </label>
          <div className="flex items-end gap-3">
            <span className="pb-2 text-sm text-muted">{visible.length} vendedor(es)</span>
            <button type="button" onClick={startCreate} className="btn-base btn-primary btn-sm">Novo vendedor</button>
          </div>
        </div>
        {loadError ? null : (
          <div className="overflow-x-auto">
            <table className={`${table} w-full min-w-[1200px]`}>
              <thead>
                <tr>{['Vendedor','Tipo / usuário','Contato','Comissão instalação','Meta instalação/mês','Comissão mensalidade','Oportunidades abertas','Status','Ações'].map(col => <th key={col} className={th}>{col}</th>)}</tr>
              </thead>
              <tbody>
                {visible.length ? visible.map(seller => (
                  <tr key={seller.id} className="border-t border-slate-100 hover:bg-slate-50/50 transition-colors">
                    <td className={`${td} font-semibold`}>
                      <div className="flex items-center gap-2">
                        <span className="truncate max-w-[140px]">{seller.name}</span>
                      </div>
                    </td>
                    <td className={td}>
                      <p className="truncate max-w-[120px]">{typeLabel(seller.seller_type)}</p>
                      {seller.user_id && <p className="max-w-[140px] truncate text-xs text-muted" title={seller.user_id}>{seller.user_id}</p>}
                    </td>
                    <td className={td}>
                      <p className="truncate max-w-[130px]">{seller.email || '—'}</p>
                      <p className="text-xs text-muted truncate max-w-[130px]">{seller.phone || '—'}</p>
                    </td>
                    <td className={td}>{pct(seller.installation_commission_percent)}</td>
                    <td className={td}>{seller.monthly_installation_goal_count ?? 0} instalação(ões)</td>
                    <td className={td}>
                      <p className="truncate max-w-[120px]">{pct(seller.monthly_commission_percent)}</p>
      <p className="text-xs text-muted truncate max-w-[120px]">{seller.monthly_commission_mode === 'none' ? 'Sem comissão mensal' : seller.monthly_commission_mode === 'recurring' ? `Recorrente · ${seller.monthly_commission_competencies} competências` : 'Única'}</p>
                    </td>
                    <td className={td}>{opportunityCountError ? '—' : seller.openOpportunityCount ?? 0}</td>
                    <td className={td}>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${seller.active ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{seller.active ? 'Ativo' : 'Inativo'}</span>
                    </td>
                    <td className={`${td} crm-action-group flex flex-wrap gap-1`}>
                      <button type="button" disabled={pending || !schemaReady} onClick={() => startEdit(seller)} className="btn-base btn-secondary btn-sm disabled:opacity-50">Editar</button>
                      <button type="button" disabled={pending || !schemaReady} onClick={() => toggle(seller)} className="btn-base btn-ghost btn-sm disabled:opacity-50">{seller.active ? 'Inativar' : 'Ativar'}</button>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={9} className={`${td} py-12 text-center text-sm text-muted`}>{sellers.length ? 'Nenhum vendedor corresponde aos filtros.' : 'Nenhum vendedor cadastrado.'}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {opportunityCountError && <p role="alert" className="text-sm text-amber-800 mt-3">Não foi possível contar as oportunidades abertas por vendedor: {opportunityCountError}</p>}
      </section>

      {/* Cadastro / Edição */}
      <section id="cadastro" className={section}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">{editing ? 'Editar vendedor' : 'Cadastrar vendedor'}</h2>
            <p className="mt-1 text-sm text-muted">As regras ficam registradas para uso futuro; este cadastro não calcula nem gera comissões.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a href="#vendedores-lista" className="btn-base btn-secondary btn-sm">Voltar para vendedores</a>
            {editing && <button type="button" onClick={startCreate} className="btn-base btn-secondary btn-sm">Cancelar edição</button>}
          </div>
        </div>
        <form key={editing?.id ?? 'new'} onSubmit={submit} className="grid gap-6">
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <fieldset className="grid gap-4 rounded-xl border border-slate-200 p-4 sm:grid-cols-2 lg:grid-cols-3">
            <legend className="px-2 text-sm font-bold">Dados do vendedor</legend>
            <label className={label}>
              Nome completo<span className="text-blue ml-0.5" aria-hidden="true">*</span>
              <input name="name" required minLength={2} maxLength={180} defaultValue={editing?.name ?? ''} className={input} aria-label="Nome completo" />
            </label>
            <label className={label}>
              Tipo
              <select name="sellerType" required value={sellerType} onChange={event => { setSellerType(event.target.value); if (event.target.value !== 'internal') setSelectedAuthUser(null) }} className={input} aria-label="Tipo de vendedor">
                <option value="">Selecione...</option>
                <option value="internal">Vendedor interno</option>
                <option value="external">Vendedor externo</option>
              </select>
            </label>
            {sellerType === 'internal' && (
              <div className={label}>
                <span className="text-sm font-medium text-ink">Usuário interno vinculado (opcional)</span>
                <input name="userId" type="hidden" value={selectedAuthUser?.id ?? ''} />
                {selectedAuthUser ? (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal">
                    <span className="min-w-0"><span className="block truncate font-semibold">{selectedAuthUser.name}</span><span className="block truncate text-xs text-muted">{selectedAuthUser.email ?? 'E-mail indisponível'}</span></span>
                    <button type="button" disabled={pending} onClick={() => { setSelectedAuthUser(null); setAuthSearch(''); setAuthError('') }} className="shrink-0 font-semibold text-blue">Remover vínculo</button>
                  </div>
                ) : (
                  <input value={authSearch} onChange={event => setAuthSearch(event.target.value)} placeholder="Pesquisar por nome ou e-mail" autoComplete="off" className={input} aria-label="Pesquisar usuário interno" />
                )}
                {authLoading && <span className="text-xs font-normal text-muted mt-1 block">Pesquisando usuários...</span>}
                {authError && <span role="alert" className="text-xs font-normal text-red-700 mt-1 block">{authError}</span>}
                {!selectedAuthUser && authSearch.trim().length >= 2 && !authLoading && !authError && (
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 mt-1">
                    {authUsers.length ? authUsers.map(user => (
                      <button key={user.id} type="button" onClick={() => { setSelectedAuthUser(user); setAuthSearch(''); setAuthUsers([]) }} className="block w-full border-b border-slate-100 px-3 py-2 text-left last:border-0 hover:bg-slate-50">
                        <span className="block font-semibold">{user.name}</span><span className="block text-xs font-normal text-muted">{user.email ?? 'E-mail indisponível'}</span>
                      </button>
                    )) : <p className="px-3 py-2 text-xs font-normal text-muted">Nenhum usuário disponível corresponde à pesquisa.</p>}
                  </div>
                )}
                <span className="text-xs font-normal text-muted mt-1 block">Apenas nome e e-mail são exibidos. Usuários vinculados a outro vendedor não aparecem.</span>
              </div>
            )}
            <label className={label}>
              E-mail
              <input name="email" type="email" maxLength={254} defaultValue={editing?.email ?? ''} className={input} aria-label="E-mail" />
            </label>
            <label className={label}>
              Telefone / WhatsApp
              <input name="phone" type="tel" maxLength={40} defaultValue={editing?.phone ?? ''} className={input} aria-label="Telefone" />
            </label>
          </fieldset>
          <fieldset className="grid gap-4 rounded-xl border border-slate-200 p-4 sm:grid-cols-2 lg:grid-cols-3">
            <legend className="px-2 text-sm font-bold">Regras de comissão futuras</legend>
            <label className={label}>
              Meta mensal de instalações
              <input name="monthlyInstallationGoalCount" type="number" min="0" max="1000000" step="1" defaultValue={editing?.monthly_installation_goal_count ?? 0} disabled={!installationGoalSchemaReady} className={input} aria-label="Meta mensal de instalações" />
              <p className="text-xs text-muted mt-1">Quantidade de vendas com instalação WON que o vendedor deve concluir no mês.</p>
            </label>
            <label className={label}>
              Comissão sobre instalação (%)
              <input name="installationCommissionPercent" required type="number" min="0" max="100" step="0.01" defaultValue={editing?.installation_commission_percent ?? '0'} className={input} aria-label="Comissão sobre instalação" />
              <p className="text-xs text-muted mt-1">Percentual sobre o valor de instalação.</p>
            </label>
            {monthlyMode !== 'none' && <label className={label}>
              Comissão sobre mensalidade (%)
              <input name="monthlyCommissionPercent" required type="number" min="0" max="100" step="0.01" defaultValue={editing?.monthly_commission_percent ?? '0'} className={input} aria-label="Comissão sobre mensalidade" />
              <p className="text-xs text-muted mt-1">Percentual sobre o valor da mensalidade.</p>
            </label>}
            <label className={label}>
              Modalidade da comissão mensal
              <select name="monthlyCommissionMode" value={monthlyMode} onChange={event => setMonthlyMode(event.target.value as 'none'|'single'|'recurring')} className={input} aria-label="Modalidade da comissão mensal">
                <option value="none">Sem comissão mensal</option>
                <option value="single">Única</option>
                <option value="recurring">Recorrente</option>
              </select>
            </label>
            {monthlyMode === 'recurring' && (
              <label className={label}>
                Competências (1 a 120)
                <input name="monthlyCommissionCompetencies" type="number" min="1" max="120" step="1" required defaultValue={editing?.monthly_commission_competencies ?? ''} className={input} aria-label="Competências" />
                <span className="text-xs font-normal text-muted mt-1 block">Limite configurável das competências da comissão recorrente.</span>
              </label>
            )}
          </fieldset>
          {!installationGoalSchemaReady && <p role="status" className="msg-base msg-warning">A meta mensal de instalações será habilitada após aplicar a migration 202611100001_seller_installation_goal_and_net_commission.sql.</p>}
          <fieldset className="grid gap-4 rounded-xl border border-slate-200 p-4 sm:grid-cols-2">
            <legend className="px-2 text-sm font-bold">Situação cadastral</legend>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input name="active" type="checkbox" value="true" defaultChecked={editing?.active ?? true} aria-label="Vendedor ativo" />
              Vendedor ativo e disponível em novos vínculos
            </label>
            <p className="text-sm text-muted">Inativar preserva oportunidades, leads e vínculos históricos.</p>
          </fieldset>
          <button disabled={pending || !schemaReady || Boolean(loadError)} className="w-fit btn-base btn-primary btn-md disabled:opacity-50">{pending ? 'Salvando...' : editing ? 'Salvar alterações' : 'Cadastrar vendedor'}</button>
        </form>
      </section>
    </div>
  )
}
