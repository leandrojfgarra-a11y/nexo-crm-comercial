const mojibakePattern = /(?:Ã[\u0080-\u00BF]|Â[\u0080-\u00BF]|â€|ðŸ)/g

/** Repairs common UTF-8 text that was decoded as Windows-1252/Latin-1. */
export function repairMojibake(value: string | null | undefined): string {
  if (!value) return value ?? ''
  let current = value
  for (let attempt = 0; attempt < 2; attempt++) {
    const before = current.match(mojibakePattern)?.length ?? 0
    if (!before) break
    const codepoints = Array.from(current, character => character.codePointAt(0)!)
    if (codepoints.some(codepoint => codepoint > 0xff)) break
    try {
      const repaired = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(codepoints))
      const after = repaired.match(mojibakePattern)?.length ?? 0
      if (after >= before) break
      current = repaired
    } catch {
      break
    }
  }
  return current
}
