/** JSON de chaves ORDENADAS (pula `undefined`) — o jsonb do servidor reordena
 *  chaves, então `JSON.stringify` cru daria "diferente" pra conteúdo igual.
 *  Fonte única: fingerprints da publicação (#573) e o merge da sala viva. */
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`
  const o = v as Record<string, unknown>
  return `{${Object.keys(o)
    .sort()
    .filter((k) => o[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
    .join(',')}}`
}
