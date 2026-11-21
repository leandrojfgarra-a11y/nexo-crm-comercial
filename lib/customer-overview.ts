export function uniqueDisplayPhoneNumbers(values: readonly (string | null | undefined)[]) {
  const seen = new Set<string>()
  const unique: string[] = []

  for (const value of values) {
    const displayValue = value?.trim()
    if (!displayValue) continue

    const digits = displayValue.replace(/\D/g, '')
    const nationalNumber = digits.startsWith('55') && (digits.length === 12 || digits.length === 13)
      ? digits.slice(2)
      : digits
    const key = nationalNumber || displayValue.toLowerCase()
    if (seen.has(key)) continue

    seen.add(key)
    unique.push(displayValue)
  }

  return unique
}
