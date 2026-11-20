import { formatAccountantDocument, normalizeAccountantDocument } from './accountant-documents'

export const ACCOUNTANT_CNPJ_FIELD_NAMES = [
  'name', 'trade_name', 'tax_id', 'email', 'phone', 'postal_code', 'address_line',
  'address_number', 'address_extra', 'district', 'city', 'state',
] as const

export type AccountantCnpjField = typeof ACCOUNTANT_CNPJ_FIELD_NAMES[number]
export type AccountantCnpjFields = Record<AccountantCnpjField, string | null>

export function mapAccountantCnpjFields(data: Record<string, unknown>, fallbackCnpj: string): AccountantCnpjFields {
  const value = (key: string) => typeof data[key] === 'string' && data[key].trim() ? (data[key] as string).trim() : null
  return {
    name: value('name'),
    trade_name: value('trade_name'),
    tax_id: value('tax_id') ? formatAccountantDocument(value('tax_id'), 'office') : formatAccountantDocument(fallbackCnpj, 'office'),
    email: value('email'),
    phone: value('phone'),
    postal_code: value('postal_code'),
    address_line: value('address_line'),
    address_number: value('address_number'),
    address_extra: value('address_extra'),
    district: value('district'),
    city: value('city'),
    state: value('state'),
  }
}

function comparableFieldValue(field: AccountantCnpjField, value: string) {
  return field === 'tax_id' ? normalizeAccountantDocument(value, 'office') : value.trim()
}

export function hasAccountantCnpjConflicts(current: Partial<Record<AccountantCnpjField, string>>, next: AccountantCnpjFields) {
  return ACCOUNTANT_CNPJ_FIELD_NAMES.some(field => {
    const currentValue = current[field]?.trim()
    const nextValue = next[field]
    return Boolean(currentValue && nextValue && comparableFieldValue(field, currentValue) !== comparableFieldValue(field, nextValue))
  })
}

export function shouldApplyAccountantCnpjField(currentValue: string, nextValue: string | null, replaceExisting: boolean) {
  if (!nextValue) return false
  if (!currentValue.trim()) return true
  return replaceExisting && currentValue.trim() !== nextValue.trim()
}
