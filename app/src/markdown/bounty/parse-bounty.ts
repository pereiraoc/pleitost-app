// PORT do parser do bloco ```bounty``` do plugin pleitost-views (F4 do épico
// #243, issue #248). Fonte read-only:
//   /data/vaults/pleitost/.obsidian/plugins/pleitost-views/src/render/modes/
//     bounty/parse-bounty-block.ts
// Portado VERBATIM (mesma gramática de linha, mesmo range {min,max}, mesmo
// fmtAmount) pra o app parsear o MESMO bloco que o Obsidian renderiza — nada
// de layout/parse inventado. A meta (rank/subcategoria) NÃO vem do bloco: vem
// do frontmatter (mesma decisão do process-bounty-block.ts:12-13).

export type BountyRange = { min: number; max: number }
export type BountyValue = string | number | BountyRange
export type BountyData = Record<
  string,
  BountyValue | BountyValue[] | Record<string, BountyValue>
>

/** parse-bounty-block.ts:5-16 — string entre aspas, range {min,max} ou número. */
export function parseBountyValue(raw: string): BountyValue {
  let s = raw.trim()
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1)
  }
  const rangeMatch = s.match(
    /^\{\s*min\s*:\s*(\d+(?:\.\d+)?)\s*,\s*max\s*:\s*(\d+(?:\.\d+)?)\s*\}$/,
  )
  if (rangeMatch) return { min: Number(rangeMatch[1]), max: Number(rangeMatch[2]) }
  if (/^\d+(?:\.\d+)?$/.test(s)) return Number(s)
  return s
}

/** parse-bounty-block.ts:18-55 — blocos `Chave:` seguidos de `- item` ou
 *  `- Sub: valor`; linhas `Chave: valor` inline. */
export function parseBountyBlock(source: string): BountyData {
  const lines = String(source ?? '').split('\n')
  const data: BountyData = {}
  let block: string | null = null

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

    if (line.startsWith('- ')) {
      const content = line.slice(2).trim()
      const kv = content.match(/^([A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+)*):\s*(.+)$/)
      if (kv && block) {
        const current = data[block]
        if (typeof current !== 'object' || Array.isArray(current)) {
          data[block] = {}
        }
        ;(data[block] as Record<string, BountyValue>)[kv[1].trim()] = parseBountyValue(kv[2])
      } else if (block) {
        if (!Array.isArray(data[block])) data[block] = []
        ;(data[block] as BountyValue[]).push(parseBountyValue(content))
      }
      continue
    }

    const colon = line.indexOf(':')
    if (colon === -1) continue
    const key = line.slice(0, colon).trim()
    const val = line.slice(colon + 1).trim()
    if (val) {
      data[key] = parseBountyValue(val)
      block = null
    } else {
      block = key
    }
  }
  return data
}

/** parse-bounty-block.ts:57-63 — range vira "min – max" (ou o número se iguais). */
export function fmtAmount(v: unknown): string {
  if (v && typeof v === 'object' && 'min' in v && 'max' in v) {
    const r = v as BountyRange
    return r.min === r.max ? String(r.min) : `${r.min} – ${r.max}`
  }
  return String(v ?? '')
}

/** util/wikilink.ts:toArray — normaliza um valor solto num array. */
export function toBountyArray(v: BountyValue | BountyValue[] | undefined): BountyValue[] {
  if (v == null) return []
  return Array.isArray(v) ? v : [v]
}
