export type CnpjProviderFailure = { provider: string; status: number | null; error?: string }

export function classifyCnpjLookupFailure(results: CnpjProviderFailure[]) {
  if (results.length > 0 && results.every(result => result.status === 404)) {
    return { status: 404, error: 'CNPJ não encontrado nas fontes públicas consultadas.' }
  }
  const summary = results.map(result => `${result.provider}: ${result.error || `HTTP ${result.status ?? 'sem resposta'}`}`).join('; ')
  return { status: 503, error: `Consulta de CNPJ indisponível nas fontes públicas. ${summary}.` }
}
