export type NormalizedCnpj = Record<string, string | null>

export function normalizeCnpj(raw: Record<string, unknown>, cnpj: string): NormalizedCnpj {
  const text = (...keys: string[]) => {
    for (const key of keys) {
      const value = raw[key]
      if (typeof value !== 'string' && typeof value !== 'number') continue
      const normalized = String(value).trim()
      if (normalized && !/^\*+$/.test(normalized)) return normalized
    }
    return null
  }
  const phone = [raw.ddd_telefone_1, raw.ddd_telefone_2].find(value => typeof value === 'string' && value) as string | undefined
  const cnae = raw.cnae_fiscal
  const cnaeDescription = text('cnae_fiscal_descricao')
  const type = text('descricao_tipo_de_logradouro')
  const logradouro = text('logradouro')
  const alreadyPrefixed = !!(type && logradouro && new RegExp(`^${type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`, 'i').test(logradouro))
  const typeOnly = !!(logradouro && (
    (type && logradouro.trim().toLocaleUpperCase('pt-BR') === type.trim().toLocaleUpperCase('pt-BR')) ||
    /^(R|RUA|AV|AV\.?|AVENIDA|AL|ALAMEDA|TRAV|TRAVESSA|ESTR|ESTRADA|ROD|RODOVIA)\.?$/i.test(logradouro.trim())
  ))
  const street = typeOnly ? null : alreadyPrefixed ? logradouro : [type, logradouro].filter(Boolean).join(' ') || null

  return {
    name: text('razao_social'), trade_name: text('nome_fantasia'), tax_id: text('cnpj') ?? cnpj,
    email: text('email'), phone: phone ?? null, postal_code: text('cep'), address_line: street,
    address_number: text('numero'), address_extra: text('complemento'), district: text('bairro'),
    city: text('municipio'), state: text('uf'),
    primary_cnae: cnae == null ? null : `${cnae}${cnaeDescription ? ` · ${cnaeDescription}` : ''}`,
    registration_status: text('descricao_situacao_cadastral'), opened_at: text('data_inicio_atividade'),
  }
}

export function normalizeCnpjWs(raw: Record<string, unknown>, cnpj: string): { fields: NormalizedCnpj; inscriptions: { number: string; state: string | null; active: boolean | null; regime: string | null }[] } {
  const establishment = raw.estabelecimento && typeof raw.estabelecimento === 'object'
    ? raw.estabelecimento as Record<string, unknown>
    : {}
  const state = establishment.estado && typeof establishment.estado === 'object'
    ? (establishment.estado as Record<string, unknown>).sigla
    : null
  const city = establishment.cidade && typeof establishment.cidade === 'object'
    ? (establishment.cidade as Record<string, unknown>).nome
    : establishment.cidade
  const mainActivity = establishment.atividade_principal && typeof establishment.atividade_principal === 'object'
    ? establishment.atividade_principal as Record<string, unknown>
    : {}
  const phone = [establishment.ddd1, establishment.telefone1].filter(value => typeof value === 'string' && value.trim()).join('')
  const flat: Record<string, unknown> = {
    razao_social: raw.razao_social,
    nome_fantasia: establishment.nome_fantasia,
    cnpj: establishment.cnpj ?? cnpj,
    email: establishment.email,
    ddd_telefone_1: (phone || establishment.telefone) ?? null,
    cep: establishment.cep,
    descricao_tipo_de_logradouro: establishment.tipo_logradouro,
    logradouro: establishment.logradouro,
    numero: establishment.numero,
    complemento: establishment.complemento,
    bairro: establishment.bairro,
    municipio: city,
    uf: state,
    cnae_fiscal: mainActivity.id,
    cnae_fiscal_descricao: mainActivity.descricao,
    descricao_situacao_cadastral: establishment.situacao_cadastral,
    data_inicio_atividade: establishment.data_inicio_atividade,
  }
  const normalized = normalizeCnpj(flat, cnpj)
  const rawInscriptions = Array.isArray(establishment.inscricoes_estaduais) ? establishment.inscricoes_estaduais : []
  const inscriptions = rawInscriptions.flatMap(value => {
    if (!value || typeof value !== 'object') return []
    const item = value as Record<string, unknown>
    const itemState = item.estado && typeof item.estado === 'object' ? (item.estado as Record<string, unknown>).sigla : null
    const number = typeof item.inscricao_estadual === 'string' ? item.inscricao_estadual.trim() : ''
    if (!number || /^\*+$/.test(number)) return []
    return [{ number, state: typeof itemState === 'string' ? itemState.toUpperCase() : null, active: typeof item.ativo === 'boolean' ? item.ativo : null, regime: typeof item.regime === 'string' ? item.regime : null }]
  })
  return { fields: normalized, inscriptions }
}

export function mergeMissingFields(primary: NormalizedCnpj, fallback: NormalizedCnpj): NormalizedCnpj {
  const merged = { ...primary }
  for (const [key, value] of Object.entries(fallback)) {
    const currentIsMaskedName = key === 'name' && typeof merged[key] === 'string' && /\*{2,}/.test(merged[key]!)
    const fallbackNameIsComplete = key === 'name' && typeof value === 'string' && !/\*{2,}/.test(value)
    if ((!merged[key] && value) || (currentIsMaskedName && fallbackNameIsComplete)) merged[key] = value
  }
  return merged
}

export function mergeMissingAddress(primary: NormalizedCnpj, fallback: NormalizedCnpj): NormalizedCnpj {
  const merged = { ...primary }
  for (const key of ['address_line', 'address_number', 'address_extra'] as const) if (!merged[key] && fallback[key]) merged[key] = fallback[key]
  return merged
}
