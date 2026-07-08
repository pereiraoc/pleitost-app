// Economia de slots (perícias/técnicas/magias) — PORTA das utils do plugin
// pleitost-autosheet:
//   - Fungibilidade descendente (M cobre M/E/A; E cobre E/A; A só A) para
//     PERÍCIAS e TÉCNICAS — espelho de src/util/slot-accounting.ts
//     (slotsFeasible :22-45, computeSlotsView :61-84, canAddOne :88-95).
//   - SEM fungibilidade para MAGIAS (cada rank com seu orçamento) — espelho de
//     src/util/magia-slot-accounting.ts (computeMagiaSlotsView, magiaCanAddOne).
//
// O app opera sobre as LINHAS do FM (não sobre o InternalSheetModel), então
// quem chama monta `{ total, used }` a partir do derivedFm (Pericias.Slots /
// Tecnicas.Slots / Magias.Slots) e da contagem de source `Slot.<rank>`.

export type SlotClass = 'ok' | 'zero' | 'err'
export type SlotRank = 'A' | 'E' | 'M'

export interface SlotsView {
  total: { A: number; E: number; M: number }
  used: { A: number; E: number; M: number }
  avail: { A: number; E: number; M: number }
  globalOk: boolean
  classFor: { A: SlotClass; E: SlotClass; M: SlotClass }
}

/** Verifica se `need{A,E,M}` cabe no orçamento `tot{A,E,M}` com fungibilidade
 *  descendente (M cobre E, E cobre A). VERBATIM de slot-accounting.ts:22-45. */
export function slotsFeasible(
  needA: number,
  needE: number,
  needM: number,
  totA: number,
  totE: number,
  totM: number,
): boolean {
  let mRem = totM - needM
  if (mRem < 0) return false
  let eRem = totE - needE
  if (eRem < 0) {
    mRem += eRem
    eRem = 0
    if (mRem < 0) return false
  }
  let aRem = totA - needA
  if (aRem < 0) {
    eRem += aRem
    aRem = 0
    if (eRem < 0) {
      mRem += eRem
      eRem = 0
      if (mRem < 0) return false
    }
  }
  return true
}

/** SlotsView fungível — espelho de computeSlotsView do plugin (:61-84). */
export function computeSlotsView(input: {
  total: { A: number; E: number; M: number }
  used: { A: number; E: number; M: number }
}): SlotsView {
  const { total, used } = input
  const avail = {
    A: total.A - used.A,
    E: total.E - used.E,
    M: total.M - used.M,
  }
  const globalOk = slotsFeasible(used.A, used.E, used.M, total.A, total.E, total.M)
  const classOf = (av: number): SlotClass => {
    if (globalOk) return av > 0 ? 'ok' : 'zero'
    return av < 0 ? 'err' : 'zero'
  }
  const classFor = { A: classOf(avail.A), E: classOf(avail.E), M: classOf(avail.M) }
  return { total, used, avail, globalOk, classFor }
}

/** True quando dá pra gastar +1 slot de `rank` sem estourar o orçamento global
 *  (com fungibilidade). Espelho de canAddOne (:88-95). */
export function canAddOne(slots: SlotsView, rank: SlotRank): boolean {
  return slotsFeasible(
    slots.used.A + (rank === 'A' ? 1 : 0),
    slots.used.E + (rank === 'E' ? 1 : 0),
    slots.used.M + (rank === 'M' ? 1 : 0),
    slots.total.A,
    slots.total.E,
    slots.total.M,
  )
}

// ── Magias — SEM fungibilidade (magia-slot-accounting.ts) ──────────────────

export type MagiaRank = 'B' | 'A' | 'E' | 'M'
const MAGIA_RANKS: MagiaRank[] = ['B', 'A', 'E', 'M']

export interface MagiaSlotsView {
  total: Record<MagiaRank, number>
  used: Record<MagiaRank, number>
  avail: Record<MagiaRank, number>
  classFor: Record<MagiaRank, SlotClass>
  globalOk: boolean
}

export function computeMagiaSlotsView(input: {
  total: Record<MagiaRank, number>
  used: Record<MagiaRank, number>
}): MagiaSlotsView {
  const { total, used } = input
  const avail = {
    B: total.B - used.B,
    A: total.A - used.A,
    E: total.E - used.E,
    M: total.M - used.M,
  }
  const classOf = (av: number): SlotClass => (av < 0 ? 'err' : av === 0 ? 'zero' : 'ok')
  const classFor = {
    B: classOf(avail.B),
    A: classOf(avail.A),
    E: classOf(avail.E),
    M: classOf(avail.M),
  }
  const globalOk = MAGIA_RANKS.every((r) => avail[r] >= 0)
  return { total, used, avail, classFor, globalOk }
}

/** True quando dá pra aprender +1 magia do rank `R` — sem fungibilidade, cada
 *  rank com seu próprio orçamento. Espelho de magiaCanAddOne. */
export function magiaCanAddOne(slots: MagiaSlotsView, rank: MagiaRank): boolean {
  return slots.used[rank] < slots.total[rank]
}
