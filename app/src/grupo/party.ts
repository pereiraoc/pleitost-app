// Lógica da ficha de grupo — ESPELHA o plugin pleitost-autosheet (fonte de
// verdade): member-resolver.ts (membros via FM.grupo), role-token.ts
// (papelValuesFromModel ← FM.Papel), tier-from-level.ts e tiers-display.ts.
// Nada é recomputado de regras: FM.Papel já é o modelo salvo pelo motor.
import type { Catalog } from '../data/catalog'
import type { IndexDocEntry, VaultDoc } from '../data/types'
import { tokens } from '../generated/tokens'

/** Pasta real dos docs de grupo na vault. */
export const GRUPOS_FOLDER = 'Sistema/Criaturas/Grupos de Criaturas'

export const PAPEIS = ['Lider', 'Controlador', 'Abatedor', 'Vanguarda'] as const
export type Papel = (typeof PAPEIS)[number]
export type PapelValues = Record<Papel, number>

/** Nota da tabela — texto verbatim do plugin (section-papel.ts) e do design. */
export const BAL_CAPTION =
  'A linha tracejada indica 1 estrela na soma do grupo — o mínimo recomendado. ' +
  'Cerca de 2 estrelas por papel costuma corresponder a um grupo mais equilibrado.'

/** Espelha papelValuesFromModel (role-token.ts): FM.Papel, ausente → 0. */
export function papelValues(doc: VaultDoc | undefined): PapelValues {
  const papel = (doc?.frontmatter['Papel'] ?? {}) as Record<string, unknown>
  const num = (v: unknown) => (typeof v === 'number' ? v : 0)
  return {
    Lider: num(papel['Lider']),
    Controlador: num(papel['Controlador']),
    Abatedor: num(papel['Abatedor']),
    Vanguarda: num(papel['Vanguarda']),
  }
}

/** Espelha tier-from-level.ts: T1=1-3, T2=4-6, T3=7-9, T4=10+. */
export function tierFromLevel(level: unknown): number {
  const n = Math.max(1, Math.floor(Number(level) || 1))
  if (n <= 3) return 1
  if (n <= 6) return 2
  if (n <= 9) return 3
  return 4
}

/** Espelha tiers-display.ts: rank do FM ([SABCD]), senão derivado do tier máximo. */
export function rankLetter(groupFm: Record<string, unknown>, maxTier: number): string {
  const raw = groupFm['rank'] ?? groupFm['Rank'] ?? groupFm['classe'] ?? groupFm['Classe']
  if (raw != null && raw !== '') {
    const match = /[SABCD]/.exec(String(raw).trim().toUpperCase())
    if (match) return match[0]
  }
  if (maxTier >= 4) return 'S'
  if (maxTier === 3) return 'A'
  if (maxTier === 2) return 'B'
  return 'C'
}

const WIKILINK = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/

/**
 * Espelha member-resolver.ts: membros = criaturas cujo FM.grupo resolve pro
 * doc do grupo (nada de parse do basename do grupo).
 */
export function groupMembers(catalog: Catalog, groupId: string): IndexDocEntry[] {
  return catalog.content.filter((entry) => {
    if (entry.type !== 'Criatura' || !entry.grupo) return false
    const grupos = Array.isArray(entry.grupo) ? entry.grupo : [entry.grupo]
    return grupos.some((g) => {
      const target = WIKILINK.exec(g)?.[1] ?? g
      const res = catalog.resolve(target)
      return res.kind === 'doc' && res.id === groupId
    })
  })
}

/** Soma por papel da linha "Grupo" (section-papel.ts). */
export function groupTotals(values: PapelValues[]): PapelValues {
  const totals: PapelValues = { Lider: 0, Controlador: 0, Abatedor: 0, Vanguarda: 0 }
  for (const v of values) for (const p of PAPEIS) totals[p] += v[p]
  return totals
}

const strip = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/**
 * Emoji da sintonia via registro central (tokens.emojis.sintonia: Agua/Fogo/
 * Terra/Vento) — casa a chave contra o basename do FM.Sintonia sem acentos.
 */
export function sintoniaEmoji(doc: VaultDoc | undefined): string | null {
  const raw = doc?.frontmatter['Sintonia']
  if (typeof raw !== 'string') return null
  const target = WIKILINK.exec(raw)?.[1] ?? raw
  const normalized = strip(target)
  for (const [key, emoji] of Object.entries(tokens.emojis.sintonia)) {
    if (normalized.includes(strip(key))) return emoji
  }
  return null
}
