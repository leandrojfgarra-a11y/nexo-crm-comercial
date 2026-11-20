import type { AccountantKind } from '@/lib/accountant-identity'

export function normalizeAccountantDocument(value: string, kind: AccountantKind) {
  return kind === 'office'
    ? value.replace(/[.\s\/-]/g, '').toUpperCase()
    : value.replace(/\D/g, '').slice(0, 11)
}

export function formatCpf(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  return digits
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3}\.\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3}\.\d{3}\.\d{3})(\d{1,2})$/, '$1-$2')
}

export function formatCnpj(value: string) {
  const cnpj = value.replace(/[^0-9A-Z]/gi, '').toUpperCase().slice(0, 14)
  if (cnpj.length <= 2) return cnpj
  if (cnpj.length <= 5) return `${cnpj.slice(0, 2)}.${cnpj.slice(2)}`
  if (cnpj.length <= 8) return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5)}`
  if (cnpj.length <= 12) return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8)}`
  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`
}

export function formatAccountantDocument(value: string | null | undefined, kind: AccountantKind | string | null | undefined) {
  if (!value) return ''
  return kind === 'office' ? formatCnpj(value) : formatCpf(value)
}
