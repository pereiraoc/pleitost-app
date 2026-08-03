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
  return m ? m[1]! : null
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
  if (m) return m[1]!.trim()
  return str.replace(/^\[\[|\]\]$/g, '').split('|')[0]!.trim()
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

/** #412: ARTEFATOS (Sistema/Equipamento/Tesouros/Artefatos/) têm preço CRU —
 *  o "(Mestre)" do alias é a RARIDADE do item, não um multiplicador de tier.
 *  Fonte única da exceção (o inventário de grupo já a aplicava em
 *  inventario-item.ts; card e riqueza multiplicavam por engano). */
export function isArtefatoId(id: string | null | undefined): boolean {
  return !!id && id.includes('/Artefatos/')
}

/** #412: um alvo de wikilink é artefato? (resolução docId a cargo do caller). */
export type IsArtefato = (linkTarget: string) => boolean

export interface InvFm {
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

// ── Itemização (issue #384) ───────────────────────────────────────────────
// As MESMAS regras de precificação dos totais, linha a linha, pros tooltips
// DISCRIMINADOS da riqueza (riq-tips.ts). Os sums delegam pros itemizadores —
// uma fonte só, sem drift soma↔detalhe. Formato dos rótulos = o do design
// puxado (grupo-tips.js): "Nome (Inicial-do-tier)".

/** Uma linha do detalhe: rótulo (formato do design) + valor em PO. */
export interface WealthLine {
  label: string
  value: number
}

/** Display do wikilink (alias após `|`, sem `]]`); '' sem alias. */
function wikilinkDisplay(s: unknown): string {
  const str = String(s ?? '')
  return str.includes('|') ? str.split('|').pop()!.replace(/\]\]$/, '') : ''
}

/** Basename de um alvo de link (sem pasta/.md) — mesmo passo usado em
 *  tierMultFromCategoriaLink. */
function pathBasename(p: string): string {
  return (p.split('/').pop() ?? p).replace(/\.md$/i, '')
}

/** Inicial do tier pro rótulo do design ("(A)"/"(E)"/"(M)") — espelha a
 *  resolução de tierMultFromName (default Adepto quando não reconhece). */
export function tierInitial(name: unknown): string {
  const n = String(name || '').toLowerCase()
  if (n.includes('mestre')) return 'M'
  if (n.includes('experiente')) return 'E'
  return 'A'
}

/** Tier da Categoria pro rótulo — mesmo basename de tierMultFromCategoriaLink. */
function tierInitialFromCategoriaLink(linkStr: unknown): string {
  const p = wikilinkTargetFlexible(linkStr)
  return tierInitial(p ? pathBasename(p) : '')
}

/** Linhas de Inventario.Tesouros — preço × tier do display (default Adepto).
 *  #412: artefato (isArtefato) NÃO multiplica — preço cru; o tier segue no
 *  rótulo como raridade. */
export function itemizeTesouros(
  fm: InvFm,
  priceOf: PriceOf,
  isArtefato?: IsArtefato,
): WealthLine[] {
  const out: WealthLine[] = []
  for (const entry of toArray(fm?.Inventario?.Tesouros)) {
    const p = wikilinkTargetFlexible(entry)
    if (!p) continue
    const display = String(entry).includes('|') ? wikilinkDisplay(entry) : ''
    const tier = parseTierFromDisplay(display) || 'Adepto'
    out.push({
      label: `${pathBasename(p)} (${tierInitial(tier)})`,
      value: priceOf(p) * (isArtefato?.(p) ? 1 : tierMultFromName(tier)),
    })
  }
  return out
}

/** Linhas de Inventario.Consumiveis — tier + quantidade `(xN)` do display. */
export function itemizeConsumiveis(fm: InvFm, priceOf: PriceOf): WealthLine[] {
  const out: WealthLine[] = []
  for (const entry of toArray(fm?.Inventario?.Consumiveis)) {
    const p = wikilinkTargetFlexible(entry)
    if (!p) continue
    const inner = String(entry)
    const display = inner.includes('|') ? wikilinkDisplay(entry) : inner
    const tier = parseTierFromDisplay(display) || 'Adepto'
    const qty = parseConsumableQty(display)
    out.push({
      label: `${pathBasename(p)} (${tierInitial(tier)}) ×${qty}`,
      value: priceOf(p) * tierMultFromName(tier) * qty,
    })
  }
  return out
}

/** Linhas de Armadura/Escudo — rótulo = campo do FM + alias da Propriedade
 *  ("Armadura (Obra-prima) (E)", como no design) × tier da Categoria. */
export function itemizeArmaduraEscudo(fm: InvFm, priceOf: PriceOf): WealthLine[] {
  const out: WealthLine[] = []
  const push = (campo: string, peca: { Propriedade?: unknown; Categoria?: unknown }) => {
    const p = wikilinkTargetFlexible(peca.Propriedade)
    const prop = wikilinkDisplay(peca.Propriedade) || pathBasename(p)
    out.push({
      label: `${campo} (${prop}) (${tierInitialFromCategoriaLink(peca.Categoria)})`,
      value: priceOf(p) * tierMultFromCategoriaLink(peca.Categoria),
    })
  }
  const arm = fm?.Inventario?.Armadura
  if (arm?.Propriedade) push('Armadura', arm)
  const escudo = fm?.Inventario?.Escudo
  if (escudo?.Propriedade && String(escudo.Propriedade).trim()) push('Escudo', escudo)
  return out
}

/** Linhas de Inventario.Armas.Lista — "Arma (Propriedade) (Tier)" como no
 *  design; só linhas com Propriedade (paridade com o pricing). */
export function itemizeArmasProp(fm: InvFm, priceOf: PriceOf): WealthLine[] {
  const out: WealthLine[] = []
  for (const row of toArray(fm?.Inventario?.Armas?.Lista) as Array<{
    Nome?: unknown
    Propriedade?: unknown
    Categoria?: unknown
  }>) {
    if (!row?.Propriedade) continue
    const p = wikilinkTargetFlexible(row.Propriedade)
    if (!p) continue
    const arma = pathBasename(wikilinkTargetFlexible(row.Nome))
    const prop = wikilinkDisplay(row.Propriedade) || pathBasename(p)
    out.push({
      label: `${arma ? `${arma} ` : ''}(${prop}) (${tierInitialFromCategoriaLink(row.Categoria)})`,
      value: priceOf(p) * tierMultFromCategoriaLink(row.Categoria),
    })
  }
  return out
}

const sumLines = (lines: WealthLine[]): number => lines.reduce((s, l) => s + l.value, 0)

/** Espelha sumInventarioTesouros (pricing.ts): display = parte após `|`
 *  ('' sem alias) → tier (default Adepto) × preço base. #412: artefato cru. */
export function sumInventarioTesouros(
  fm: InvFm,
  priceOf: PriceOf,
  isArtefato?: IsArtefato,
): number {
  return sumLines(itemizeTesouros(fm, priceOf, isArtefato))
}

/** Espelha sumConsumiveis (pricing.ts): tier + quantidade `(xN)` do display. */
export function sumConsumiveis(fm: InvFm, priceOf: PriceOf): number {
  return sumLines(itemizeConsumiveis(fm, priceOf))
}

/** Espelha priceArmaduraEscudo (pricing.ts): preço da Propriedade × tier da Categoria. */
export function priceArmaduraEscudo(fm: InvFm, priceOf: PriceOf): number {
  return sumLines(itemizeArmaduraEscudo(fm, priceOf))
}

/** Espelha priceAtaquesPropriedades (pricing.ts): só Inventario.Armas.Lista. */
export function priceAtaquesPropriedades(fm: InvFm, priceOf: PriceOf): number {
  return sumLines(itemizeArmasProp(fm, priceOf))
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

/** Espelha computeMemberWealthParts (pricing.ts). #412: artefato cru. */
export function computeMemberWealthParts(
  fm: Fm | undefined,
  priceOf: PriceOf,
  isArtefato?: IsArtefato,
): MemberWealthParts {
  const f = (fm ?? {}) as InvFm
  const ouro = Number(f?.Inventario?.Ouro) || 0
  const tesouros = sumInventarioTesouros(f, priceOf, isArtefato)
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
  /** FMs que compõem a linha (#384: o detalhe discriminado itemiza sobre
   *  eles): o do membro + os dos CAs somados no tutor (#236). */
  fms: InvFm[]
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
  isArtefato?: IsArtefato,
): WealthMemberRow[] {
  const rows: WealthMemberRow[] = []
  const rowByBasename = new Map<string, WealthMemberRow>()
  const cas: { doc: VaultDoc; parts: MemberWealthParts }[] = []
  for (const member of members) {
    const doc = docs.get(member.id)
    const parts = computeMemberWealthParts(doc?.frontmatter as Fm | undefined, priceOf, isArtefato)
    if (doc && familiaOf(doc) === 'CompanheiroAnimal') {
      cas.push({ doc, parts })
      continue
    }
    const row: WealthMemberRow = { member, parts, fms: [(doc?.frontmatter ?? {}) as InvFm] }
    rows.push(row)
    rowByBasename.set(member.basename ?? member.id, row)
  }
  for (const ca of cas) {
    const tutor = rowByBasename.get(wikilinkBasename(String(ca.doc.frontmatter['Tutor'] ?? '')))
    if (tutor) {
      tutor.parts = addParts(tutor.parts, ca.parts)
      // #384: o detalhe discriminado do tutor também lista os itens do CA.
      tutor.fms.push(ca.doc.frontmatter as InvFm)
    }
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
