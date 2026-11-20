import { normalizeAccountantDocument } from './accountant-documents'
import { validCpf, validCnpj } from './crm-validation'

export type AccountantKind = 'individual' | 'office'
export type AccountantIdentityError = 'kind-invalid' | 'name-invalid' | 'tax-required' | 'tax-invalid'

export function parseAccountantIdentity(kindInput: string, nameInput: string, taxIdInput: string):
  | { value: { kind: AccountantKind; name: string; taxId: string | null } }
  | { error: AccountantIdentityError } {
  if (kindInput !== 'individual' && kindInput !== 'office') return { error: 'kind-invalid' }
  const kind = kindInput
  const name = nameInput.trim()
  if (name.length < 2) return { error: 'name-invalid' }

  const taxId = normalizeAccountantDocument(taxIdInput.trim(), kind)
  if (kind === 'office' && !taxId) return { error: 'tax-required' }
  if (taxId && !(kind === 'individual' ? validCpf(taxId) : validCnpj(taxId))) return { error: 'tax-invalid' }
  return { value: { kind, name, taxId: taxId || null } }
}
