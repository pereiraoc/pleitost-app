// Parse + lookup de tabelas `chave:valor` ordenadas (nível, seletor).
// ESPELHO do plugin pleitost-autosheet src/runtime/condicoes/level-table.ts.
export type LevelTable = ReadonlyArray<readonly [number, string]>

export function parseLevelTable(raw: string): LevelTable {
  const out: Array<[number, string]> = []
  for (const part of String(raw).split(/\s*,\s*/)) {
    const idx = part.indexOf(':')
    if (idx < 0) continue
    const k = parseInt(part.slice(0, idx).trim(), 10)
    const v = part.slice(idx + 1).trim()
    if (!Number.isFinite(k) || !v) continue
    out.push([k, v])
  }
  out.sort((a, b) => a[0] - b[0])
  return out
}

/** Valor cuja chave é o maior <= currentValue; normaliza "d10" → "1d10". */
export function pickByLevel(table: LevelTable, currentValue: number): string {
  let picked = ''
  for (const [k, v] of table) {
    if (k <= currentValue) picked = v
    else break
  }
  return normalizeDiceNotation(picked)
}

function normalizeDiceNotation(s: string): string {
  if (!s) return s
  if (!/^d\d+/i.test(s)) return s
  return `1${s}`
}

export function pickMappedValue(rawTable: string, currentValue: number): string {
  return pickByLevel(parseLevelTable(rawTable), currentValue)
}
