export function applyLookupValues(
  form: Pick<HTMLFormElement, 'elements'>,
  values: Record<string, string | null>,
  overwrite: boolean,
) {
  let filled = 0
  for (const [name, value] of Object.entries(values)) {
    if (typeof value !== 'string' || !value.trim()) continue
    const field = form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null
    if (!field || field.disabled || (field.value.trim() && !overwrite)) continue
    field.value = value
    field.dispatchEvent(new Event('input', { bubbles: true }))
    field.dispatchEvent(new Event('change', { bubbles: true }))
    filled++
  }
  return filled
}
