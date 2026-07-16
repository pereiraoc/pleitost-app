// #291: fonte ÚNICA das primitivas de wikilink + membership, espelho fiel do
// plugin (util/wikilink.ts + rule-applier.listContainsToken). Antes estavam
// DUPLICADAS em rule-applier.ts e aplicavel-a.ts — exatamente o vetor de drift
// que causou o bug do #288 (uma cópia divergindo da outra). Um lugar só agora.
const WIKILINK_EXACT = /^\[\[([^\]|]+)(?:\|[^\]]+)?\]\]$/

/** "[[A/B|C]]" → "B" (basename do alvo, sem alias/.md); texto cru → o texto. */
export function wikilinkBasename(wl: string): string {
  const m = wl.match(WIKILINK_EXACT)
  if (!m) return wl.trim()
  const target = m[1]!.trim()
  return (target.split('/').pop() ?? target).replace(/\.md$/i, '').trim()
}

/** Espelho de isWikilink (plugin util/wikilink.ts:72-74). */
export function isWikilink(s: string): boolean {
  return /^\[\[[^\]]+\]\]$/.test(s)
}

/** Membership numa lista: wikilink casa por basename; texto cru por substring.
 *  Espelho de listContainsToken (plugin rule-applier.ts:226-235). */
export function listContainsToken(value: unknown, needle: string): boolean {
  const matches = isWikilink(needle)
    ? (s: string) => isWikilink(s) && wikilinkBasename(s) === wikilinkBasename(needle)
    : (s: string) => s.includes(needle)
  if (Array.isArray(value)) return value.some((v) => typeof v === 'string' && matches(v))
  if (typeof value === 'string') return matches(value)
  return false
}
