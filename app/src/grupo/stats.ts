// Vida / Defesas / Sentidos / Movimento da ficha de grupo — ESPELHA o plugin
// pleitost-autosheet (fonte de verdade, READ-ONLY):
//  - util/modificadores.ts: PROF_BONUS/PROF_RANK, RESISTENCIA_BASE (10),
//    MOVIMENTO_BASE (4) e as fórmulas calcResistencia/calcSentido/calcMovimento.
//  - render/modes/grupo/aggregates.ts: buildStatsRows (células por membro,
//    "—" quando a linha não existe no FM) e computeGrupoAggregates (linha
//    "Grupo": soma VIT/MOR, média floor de defesas/sentidos, mínimo MOV).
//  - render/modes/grupo/grupo-tooltips-port.ts: fmtSigned/fmtPlain.
import type { VaultDoc } from '../data/types'

/** Espelha PROF_BONUS (util/modificadores.ts). */
export const PROF_BONUS: Record<string, number> = { N: 0, A: 2, E: 4, M: 6 }
/** Espelha PROF_RANK (util/modificadores.ts): N < A < E < M. */
export const PROF_RANK: Record<string, number> = { N: 0, A: 1, E: 2, M: 3 }
/** Espelha RESISTENCIA_BASE (util/modificadores.ts). */
export const RESISTENCIA_BASE = 10
/** Espelha MOVIMENTO_BASE (util/modificadores.ts). */
export const MOVIMENTO_BASE = 4

/** Espelha DEFENSE_NAMES/SENSE_NAMES (aggregates.ts) — ordem das colunas. */
export const DEFENSE_NAMES = ['Defesa', 'Vigor', 'Ímpeto', 'Reflexo'] as const
export const SENSE_NAMES = ['Percepção', 'Intuição'] as const

export type Fm = Record<string, unknown>

export interface NamedRow {
  Nome?: unknown
  Atributo?: unknown
  Proficiencia?: unknown
  Bonus_Item?: unknown
  Bonus_Especial?: unknown
}

export function toArray<T>(v: T | T[] | null | undefined): T[] {
  if (v == null) return []
  return Array.isArray(v) ? v : [v]
}

/** Espelha getAttr (aggregates.ts): FM.Atributos[KEY] numérico. */
export function getAttr(fm: Fm | undefined, attr: unknown): number {
  const a = (fm as { Atributos?: Record<string, unknown> } | undefined)?.Atributos
  if (!a || !attr) return 0
  const v = a[String(attr).toUpperCase()]
  return typeof v === 'number' && !Number.isNaN(v) ? v : Number(v) || 0
}

/** Espelha findNamedRow (aggregates.ts). */
export function findNamedRow(list: unknown, name: string): NamedRow | null {
  const target = String(name).toLowerCase()
  for (const row of toArray(list)) {
    if (row && String((row as NamedRow).Nome ?? '').toLowerCase() === target) {
      return row as NamedRow
    }
  }
  return null
}

/** Espelha profMod (aggregates.ts). */
export function profMod(letter: unknown): number {
  return PROF_BONUS[String(letter ?? 'N').toUpperCase()] ?? 0
}

/** Espelha profRank (aggregates.ts). */
export function profRank(letter: unknown): number {
  return PROF_RANK[String(letter ?? 'N').toUpperCase()] ?? 0
}

/** Espelha fmtSigned (grupo-tooltips-port.ts): "+9" / "-1". */
export function fmtSigned(n: unknown): string {
  const v = Math.round(Number(n) || 0)
  return v >= 0 ? `+${v}` : String(v)
}

/** Espelha fmtPlain (grupo-tooltips-port.ts). */
export function fmtPlain(n: unknown): string {
  return String(Math.round(Number(n) || 0))
}

/** Espelha parseStatNumber (aggregates.ts). */
export function parseStatNumber(v: unknown): number | null {
  if (v == null || v === '—') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Espelha terrestreMoveRow (aggregates.ts): linha "Terrestre", senão a 1ª. */
export function terrestreMoveRow(fm: Fm | undefined): NamedRow | null {
  const lista = toArray((fm as { Movimento?: { Lista?: unknown } } | undefined)?.Movimento?.Lista)
  let row = lista.find((r) =>
    String((r as NamedRow)?.Nome ?? '').toLowerCase().includes('terrestre'),
  ) as NamedRow | undefined
  if (!row && lista.length) row = lista[0] as NamedRow
  return row || null
}

export interface MemberStats {
  /** Vitalidade/Moral crus do FM ("—" quando ausentes) — espelha buildStatsRows. */
  v: unknown
  m: unknown
  /** Totais por defesa (null = "—"): 10 + attr + prof + item + especial. */
  defs: Record<string, number | null>
  /** Totais por sentido (null = "—"): attr + prof + item + especial. */
  sns: Record<string, number | null>
  /** Velocidade terrestre (4 + AGI + item + especial); null = "—". */
  sp: number | null
}

/** Espelha buildStatsRows (aggregates.ts) para UM membro. */
export function memberStats(fm: Fm | undefined): MemberStats {
  const f = fm ?? {}
  const v = (f as { Vida?: { Vitalidade?: unknown } })?.Vida?.Vitalidade ?? '—'
  const m = (f as { Vida?: { Moral?: unknown } })?.Vida?.Moral ?? '—'
  const defs: Record<string, number | null> = {}
  for (const name of DEFENSE_NAMES) {
    const row = findNamedRow(
      (f as { Defesas_Resistencias?: { Lista?: unknown } })?.Defesas_Resistencias?.Lista,
      name,
    )
    defs[name] = row
      ? RESISTENCIA_BASE +
        getAttr(f, row.Atributo) +
        profMod(row.Proficiencia) +
        (Number(row.Bonus_Item) || 0) +
        (Number(row.Bonus_Especial) || 0)
      : null
  }
  const sns: Record<string, number | null> = {}
  for (const name of SENSE_NAMES) {
    const row = findNamedRow((f as { Sentidos?: { Lista?: unknown } })?.Sentidos?.Lista, name)
    sns[name] = row
      ? getAttr(f, row.Atributo) +
        profMod(row.Proficiencia) +
        (Number(row.Bonus_Item) || 0) +
        (Number(row.Bonus_Especial) || 0)
      : null
  }
  const mov = terrestreMoveRow(f)
  const sp = mov
    ? MOVIMENTO_BASE +
      getAttr(f, mov.Atributo) +
      (Number(mov.Bonus_Item) || 0) +
      (Number(mov.Bonus_Especial) || 0)
    : null
  return { v, m, defs, sns, sp }
}

export interface GrupoAggregates {
  sumVit: number
  sumMor: number
  hasVit: number
  hasMor: number
  defsAvg: Record<string, number | null>
  snsAvg: Record<string, number | null>
  minSp: number | null
}

/** Espelha computeGrupoAggregates (aggregates.ts): soma VIT/MOR, média
 *  (floor) de defesas/sentidos, mínimo de velocidade. */
export function computeGrupoAggregates(rows: MemberStats[]): GrupoAggregates | null {
  if (!rows.length) return null
  let sumVit = 0
  let sumMor = 0
  let hasVit = 0
  let hasMor = 0
  for (const row of rows) {
    const a = parseStatNumber(row.v)
    const b = parseStatNumber(row.m)
    if (a != null) {
      sumVit += a
      hasVit++
    }
    if (b != null) {
      sumMor += b
      hasMor++
    }
  }
  const defsAvg: Record<string, number | null> = {}
  for (const d of DEFENSE_NAMES) {
    let s = 0
    let c = 0
    for (const row of rows) {
      const cell = row.defs[d]
      if (cell != null) {
        s += cell
        c++
      }
    }
    defsAvg[d] = c > 0 ? Math.floor(s / c) : null
  }
  const snsAvg: Record<string, number | null> = {}
  for (const name of SENSE_NAMES) {
    let s = 0
    let c = 0
    for (const row of rows) {
      const cell = row.sns[name]
      if (cell != null) {
        s += cell
        c++
      }
    }
    snsAvg[name] = c > 0 ? Math.floor(s / c) : null
  }
  let minSp: number | null = null
  for (const row of rows) {
    if (row.sp != null && (minSp == null || row.sp < minSp)) minSp = row.sp
  }
  return { sumVit, sumMor, hasVit, hasMor, defsAvg, snsAvg, minSp }
}

/** Nível FM → número (espelha `Number(fm["Nível"]) || 1` do plugin). */
export function nivelOf(doc: VaultDoc | undefined): number {
  return Number(doc?.frontmatter['Nível']) || 1
}
