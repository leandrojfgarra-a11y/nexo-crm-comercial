export type PersonInput = {
  kind: 'individual' | 'company'
  name: string
  tradeName: string | null
  taxId: string | null
  email: string | null
  phone: string | null
  whatsapp: string | null
  mobilePhone: string | null
  stateRegistration: string | null
  municipalRegistration: string | null
  icmsContributor: boolean | null
  primaryCnae: string | null
  taxRegime: string | null
  registrationStatus: string | null
  openedAt: string | null
  postalCode: string | null
  addressLine: string | null
  addressNumber: string | null
  addressExtra: string | null
  district: string | null
  city: string | null
  state: string | null
  notes: string | null
}

export function digits(value: string) {
  return value.replace(/\D/g, '')
}

export function validCpf(value: string) {
  const cpf = digits(value)
  if (cpf.length !== 11 || /^([0-9])\1{10}$/.test(cpf)) return false
  const check = (length: number) => {
    const sum = cpf.slice(0, length).split('').reduce((total, digit, index) => total + Number(digit) * (length + 1 - index), 0)
    const remainder = (sum * 10) % 11
    return (remainder === 10 ? 0 : remainder) === Number(cpf[length])
  }
  return check(9) && check(10)
}

export function validCnpj(value: string) {
  const cnpj = value.replace(/[.\/-]/g, '').toUpperCase().trim()
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(cnpj) || /^([0-9])\1{13}$/.test(cnpj)) return false
  const check = (length: number) => {
    const weights = length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const sum = cnpj.slice(0, length).split('').reduce((total, character, index) => total + (character.charCodeAt(0) - 48) * weights[index], 0)
    const remainder = sum % 11
    return Number(cnpj[length]) === (remainder < 2 ? 0 : 11 - remainder)
  }
  return check(12) && check(13)
}

export function parsePerson(formData: FormData): { value?: PersonInput; error?: string } {
  const get = (key: string) => String(formData.get(key) ?? '').trim()
  const kind = get('kind')
  const name = get('name')
  const tax = kind === 'company' ? get('tax_id').replace(/[.\/-]/g, '').toUpperCase() : digits(get('tax_id'))
  const email = get('email').toLowerCase()

  if (kind !== 'individual' && kind !== 'company') return { error: 'Selecione pessoa física ou jurídica.' }
  if (name.length < 2) return { error: 'Informe o nome ou a razão social.' }
  if (tax && !(kind === 'individual' ? validCpf(tax) : validCnpj(tax))) {
    return { error: kind === 'individual' ? 'CPF inválido. Confira os dígitos verificadores.' : 'CNPJ inválido. Confira os dígitos verificadores.' }
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Informe um e-mail válido.' }
  const optional = (key: string) => get(key) || null
  return {
    value: {
      kind, name, tradeName: optional('trade_name'), taxId: tax || null, email: email || null,
      phone: optional('phone'), whatsapp: optional('whatsapp'), postalCode: digits(get('postal_code')) || null,
      mobilePhone: optional('mobile_phone'), stateRegistration: optional('state_registration'), municipalRegistration: optional('municipal_registration'),
      icmsContributor: get('icms_contributor') === 'yes' ? true : get('icms_contributor') === 'no' ? false : null,
      primaryCnae: optional('primary_cnae'), taxRegime: optional('tax_regime'), registrationStatus: optional('registration_status'),
      openedAt: optional('opened_at'),
      addressLine: optional('address_line'), addressNumber: optional('address_number'),
      addressExtra: optional('address_extra'), district: optional('district'), city: optional('city'),
      state: optional('state')?.toUpperCase() ?? null, notes: optional('person_notes'),
    },
  }
}

export function safeSearchTerm(value: string) {
  return value.replace(/[^\p{L}\p{N}@+._ -]/gu, '').trim().slice(0, 80)
}
