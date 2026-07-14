// Riqueza da mesa — ESPELHA o plugin pleitost-autosheet (READ-ONLY):
//  - runtime/wealth/economy-table-data.ts + economy-table.ts:
//    ECONOMY_WEALTH_DATA (riqueza esperada por nível; >10 → post10).
//  - runtime/wealth/tier-multipliers.ts: tierMultFromName (Adepto=1,
//    Experiente=5, Mestre=25), parseTierFromDisplay, parseConsumableQty.
//  - runtime/wealth/pricing.ts: readItemPrice (`preço:: N PO` do item),
//    sumInventarioTesouros, sumConsumiveis, priceArmaduraEscudo,
//    priceAtaquesPropriedades e computeMemberWealthParts.
//  - render/modes/grupo/render-party-sheet.ts (appendWealthSection):
//    delta = (ouro + tesouros s/ consumíveis) − esperado(nível), ordenação
//    por delta desc e linha Grupo (somas + nível máx).
// O plugin lê APENAS Inventario.* (Ouro/Tesouros/Consumiveis/Armadura/
// Escudo/Armas) — os campos top-level Ouro/Tesouros_Especiais/Consumíveis
// do FM são legados e NÃO entram no cálculo (paridade com o plugin).
import { familiaOf } from '../data/familia'
import type { IndexDocEntry, VaultDoc } from '../data/types'
import { wikilinkBasename } from '../rules/rule-applier'
import type { Fm } from './stats'
import { toArray } from './stats'

/** Espelha ECONOMY_WEALTH_DATA (economy-table-data.ts). */
export const ECONOMY_WEALTH_DATA: Record<string, number> = {
  1: 10,
  2: 50,
  3: 90,
  4: 175,
  5: 400,
  6: 600,
  7: 1000,
  8: 2000,
  9: 3000,
  10: 4800,
  post10: 5700,
}

/** Espelha expectedWealthForLevel (economy-table.ts). */
export function expectedWealthForLevel(nivel: unknown): number {
  const n = Number(nivel) || 1
  if (n > 10) return ECONOMY_WEALTH_DATA.post10 ?? ECONOMY_WEALTH_DATA[10] ?? 0
  return ECONOMY_WEALTH_DATA[n] ?? 0
}

/** Espelha tierMultFromName (tier-multipliers.ts). */
export function tierMultFromName(name: unknown): number {
  const n = String(name || '').toLowerCase()
  if (n.includes('mestre')) return 25
  if (n.includes('experiente')) return 5
  if (n.includes('adepto')) return 1
  return 1
}

/** Espelha parseTierFromDisplay (tier-multipliers.ts). */
export function parseTierFromDisplay(displayPart: unknown): string | null {
  const m = String(displayPart).match(/\((Adepto|Experiente|Mestre)\)/i)
  return m ? m[1] : null
}

/** Espelha parseConsumableQty (tier-multipliers.ts): `(xN)` no fim, default 1. */
export function parseConsumableQty(displayPart: unknown): number {
  const m = String(displayPart).match(/\(x(\d+)\)\s*$/i)
  return m ? Math.max(1, Number(m[1])) : 1
}

/** Espelha wikilinkTargetFlexible (util/wikilink.ts). */
export function wikilinkTargetFlexible(s: unknown): string {
  if (s == null) return ''
  const str = String(s).trim()
  const m = str.match(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/)
  if (m) return m[1].trim()
  return str.replace(/^\[\[|\]\]$/g, '').split('|')[0].trim()
}

/** Espelha tierMultFromCategoriaLink (pricing.ts): basename do link → mult. */
export function tierMultFromCategoriaLink(linkStr: unknown): number {
  const p = wikilinkTargetFlexible(linkStr)
  if (!p) return 1
  const base = (p.split('/').pop() ?? p).replace(/\.md$/i, '')
  return tierMultFromName(base)
}

/** Espelha readItemPrice (pricing.ts): inline `preço:: N PO` do doc do item.
 *  No vault-data o extractor já expõe o inline field; fallback pro body. */
export function precoPO(doc: VaultDoc | undefined | null): number {
  if (!doc) return 0
  // Base v2: `preço` está no FRONTMATTER; fallback pro inline/body (formato antigo).
  const raw = doc.frontmatter?.['preço'] ?? doc.inlineFields['preço']
  if (typeof raw === 'string') {
    const m = raw.match(/(\d+)\s*PO/i)
    if (m) return Number(m[1])
  }
  const m = doc.body.match(/preço::\s*(\d+)\s*PO/i)
  return m ? Number(m[1]) : 0
}

interface InvFm {
  Inventario?: {
    Tesouros?: unknown
    Consumiveis?: unknown
    Ouro?: unknown
    Armadura?: { Propriedade?: unknown; Categoria?: unknown }
    Escudo?: { Propriedade?: unknown; Categoria?: unknown }
    Armas?: { Lista?: unknown }
  }
}

export type PriceOf = (linkTarget: string) => number

/** Espelha sumInventarioTesouros (pricing.ts): display = parte após `|`
 *  ('' sem alias) → tier (default Adepto) × preço base. */
export function sumInventarioTesouros(fm: InvFm, priceOf: PriceOf): number {
  let sum = 0
  for (const entry of toArray(fm?.Inventario?.Tesouros)) {
    const p = wikilinkTargetFlexible(entry)
    if (!p) continue
    const display = String(entry).includes('|')
      ? String(entry).split('|').pop()!.replace(/\]\]$/, '')
      : ''
    const tier = parseTierFromDisplay(display) || 'Adepto'
    sum += priceOf(p) * tierMultFromName(tier)
  }
  return sum
}

/** Espelha sumConsumiveis (pricing.ts): tier + quantidade `(xN)` do display. */
export function sumConsumiveis(fm: InvFm, priceOf: PriceOf): number {
  let sum = 0
  for (const entry of toArray(fm?.Inventario?.Consumiveis)) {
    const p = wikilinkTargetFlexible(entry)
    if (!p) continue
    const inner = String(entry)
    const display = inner.includes('|') ? inner.split('|').pop()!.replace(/\]\]$/, '') : inner
    const tier = parseTierFromDisplay(display) || 'Adepto'
    const qty = parseConsumableQty(display)
    sum += priceOf(p) * tierMultFromName(tier) * qty
  }
  return sum
}

/** Espelha priceArmaduraEscudo (pricing.ts): preço da Propriedade × tier da Categoria. */
export function priceArmaduraEscudo(fm: InvFm, priceOf: PriceOf): number {
  let sum = 0
  const arm = fm?.Inventario?.Armadura
  if (arm?.Propriedade) {
    sum += priceOf(wikilinkTargetFlexible(arm.Propriedade)) * tierMultFromCategoriaLink(arm.Categoria)
  }
  const escudo = fm?.Inventario?.Escudo
  if (escudo?.Propriedade && String(escudo.Propriedade).trim()) {
    sum +=
      priceOf(wikilinkTargetFlexible(escudo.Propriedade)) * tierMultFromCategoriaLink(escudo.Categoria)
  }
  return sum
}

/** Espelha priceAtaquesPropriedades (pricing.ts): só Inventario.Armas.Lista. */
export function priceAtaquesPropriedades(fm: InvFm, priceOf: PriceOf): number {
  let sum = 0
  for (const row of toArray(fm?.Inventario?.Armas?.Lista) as Array<{
    Propriedade?: unknown
    Categoria?: unknown
  }>) {
    if (!row?.Propriedade) continue
    const p = wikilinkTargetFlexible(row.Propriedade)
    if (!p) continue
    sum += priceOf(p) * tierMultFromCategoriaLink(row.Categoria)
  }
  return sum
}

export interface MemberWealthParts {
  ouro: number
  tesouros: number
  consumiveis: number
  armaduraEscudo: number
  armasProp: number
  itensSemConsumiveis: number
  totalComTudo: number
}

/** Espelha computeMemberWealthParts (pricing.ts). */
export function computeMemberWealthParts(fm: Fm | undefined, priceOf: PriceOf): MemberWealthParts {
  const f = (fm ?? {}) as InvFm
  const ouro = Number(f?.Inventario?.Ouro) || 0
  const tesouros = sumInventarioTesouros(f, priceOf)
  const consumiveis = sumConsumiveis(f, priceOf)
  const armaduraEscudo = priceArmaduraEscudo(f, priceOf)
  const armasProp = priceAtaquesPropriedades(f, priceOf)
  const itensSemConsumiveis = tesouros + armaduraEscudo + armasProp
  const totalComTudo = ouro + itensSemConsumiveis + consumiveis
  return { ouro, tesouros, consumiveis, armaduraEscudo, armasProp, itensSemConsumiveis, totalComTudo }
}

/** Todos os alvos de link que entram na precificação de um membro —
 *  união dos campos que pricing.ts lê (pra pré-carregar os docs). */
export function priceTargets(fm: Fm | undefined): string[] {
  const f = (fm ?? {}) as InvFm
  const out: string[] = []
  const push = (v: unknown) => {
    const p = wikilinkTargetFlexible(v)
    if (p) out.push(p)
  }
  for (const entry of toArray(f?.Inventario?.Tesouros)) push(entry)
  for (const entry of toArray(f?.Inventario?.Consumiveis)) push(entry)
  if (f?.Inventario?.Armadura?.Propriedade) push(f.Inventario.Armadura.Propriedade)
  const escudo = f?.Inventario?.Escudo
  if (escudo?.Propriedade && String(escudo.Propriedade).trim()) push(escudo.Propriedade)
  for (const row of toArray(f?.Inventario?.Armas?.Lista) as Array<{ Propriedade?: unknown }>) {
    if (row?.Propriedade) push(row.Propriedade)
  }
  return out
}

// ── Linhas da riqueza (issue #236: CA soma no tutor) ──────────────────────

/** Soma campo a campo de MemberWealthParts (merge CA → tutor). */
function addParts(a: MemberWealthParts, b: MemberWealthParts): MemberWealthParts {
  return {
    ouro: a.ouro + b.ouro,
    tesouros: a.tesouros + b.tesouros,
    consumiveis: a.consumiveis + b.consumiveis,
    armaduraEscudo: a.armaduraEscudo + b.armaduraEscudo,
    armasProp: a.armasProp + b.armasProp,
    itensSemConsumiveis: a.itensSemConsumiveis + b.itensSemConsumiveis,
    totalComTudo: a.totalComTudo + b.totalComTudo,
  }
}

export interface WealthMemberRow {
  member: IndexDocEntry
  parts: MemberWealthParts
}

/** Issue #236: membros que viram LINHA na riqueza da mesa. Companheiro Animal
 *  (família via registro central — data/familia.ts) não tem linha própria: a
 *  riqueza dele (tesouros; a família não tem moedas nem consumíveis próprios)
 *  soma nas partes do TUTOR — FM.Tutor wikilink, resolvido entre os membros
 *  por basename (wikilinkBasename, espelho do plugin util/wikilink.ts). CA
 *  sem tutor no grupo apenas sai da lista. O plugin não trata o caso na party
 *  sheet — o pedido do usuário no #236 é a spec. */
export function wealthMemberRows(
  members: IndexDocEntry[],
  docs: Map<string, VaultDoc>,
  priceOf: PriceOf,
): WealthMemberRow[] {
  const rows: WealthMemberRow[] = []
  const rowByBasename = new Map<string, WealthMemberRow>()
  const cas: { doc: VaultDoc; parts: MemberWealthParts }[] = []
  for (const member of members) {
    const doc = docs.get(member.id)
    const parts = computeMemberWealthParts(doc?.frontmatter as Fm | undefined, priceOf)
    if (doc && familiaOf(doc) === 'CompanheiroAnimal') {
      cas.push({ doc, parts })
      continue
    }
    const row: WealthMemberRow = { member, parts }
    rows.push(row)
    rowByBasename.set(member.basename ?? member.id, row)
  }
  for (const ca of cas) {
    const tutor = rowByBasename.get(wikilinkBasename(String(ca.doc.frontmatter['Tutor'] ?? '')))
    if (tutor) tutor.parts = addParts(tutor.parts, ca.parts)
  }
  return rows
}

// ── Classificação do delta (issue #9: avisos do plugin na party sheet) ────

export type DeltaKind = 'ok' | 'warn' | 'bad'

/** Cores das classes .pleitost-party__delta-ok/-warn/-bad — VERBATIM do
 *  plugin (styles.css:13037-13039). */
export const DELTA_COLORS: Record<DeltaKind, string> = {
  ok: '#16a34a',
  warn: '#ea580c',
  bad: '#dc2626',
}

/** Espelha deltaClass (render-party-sheet.ts:385-391): razão |delta| /
 *  max(|esperado|, 1) → ok ≤ 0.2 · warn ≤ 0.5 · bad acima. Aplicado por
 *  membro na coluna Δ (a linha Grupo não recebe classe — ts:455). */
export function deltaKind(delta: number, expected: number): DeltaKind {
  const ex = Math.max(Math.abs(Number(expected)) || 0, 1)
  const ratio = Math.abs(Number(delta)) / ex
  if (ratio <= 0.2) return 'ok'
  if (ratio <= 0.5) return 'warn'
  return 'bad'
}
