// Edição de RANK (N/A/E/M) de uma perícia pelo usuário no Editável do app —
// PORTA de applyPericiaProfUserEdit do plugin pleitost-autosheet
// (src/extract/apply-pericia-prof-user-edit.ts) + computePericiaPiso
// (src/util/pericia-slot-accounting.ts:53-62), operando DIRETO nas LINHAS do
// FM (Pericias.Lista) em vez do InternalSheetModel.
//
// Semântica de PISO (§8.5.3.2): o usuário SOBE acima do piso de regra gastando
// Slot.<rank>, e DESCE só até o piso (Regra/Passado/Manual não cedem). O piso
// vem dos incrementos NÃO-slot da linha DERIVADA (que já carrega as concessões
// de regra ao vivo — numa ficha nova a regra vive no calculated, não no FM
// salvo), enquanto os Slot.<rank> são gravados na linha SALVA (o merge
// reaplica a regra por cima — merge-calculated.ts).

import { slotsFeasible, type SlotsView } from './slot-accounting'

type Row = Record<string, unknown>
type Inc = Record<string, unknown>

const RANK_ORDER: Record<string, number> = { N: 0, A: 1, E: 2, M: 3 }
const RANK_FROM = ['N', 'A', 'E', 'M'] as const

function isSlotSource(src: unknown): boolean {
  return typeof src === 'string' && src.startsWith('Slot')
}

/** #416: pares de RANK de um incremento — o YAML do plugin pode agregar mais
 *  de um par no MESMO objeto (`{ Bonus_Item: Regra.[[X]], M: Slot.M }`, caso
 *  real do Thoren em Sobrevivência); o parseIncrementos do plugin
 *  (frontmatter-helpers.ts:282) itera TODAS as entries. Ler só a primeira
 *  chave deixava o rank invisível (barra contava o slot gasto, NAEM não). */
function rankPairs(inc: Inc): Array<['A' | 'E' | 'M', unknown]> {
  const out: Array<['A' | 'E' | 'M', unknown]> = []
  for (const k of Object.keys(inc)) {
    if (k === 'A' || k === 'E' || k === 'M') out.push([k, inc[k]])
  }
  return out
}

function incsOf(row: Row): Inc[] {
  return Array.isArray(row.Incrementos) ? (row.Incrementos as Inc[]) : []
}

/** Piso = maior rank de incremento com source ∉ Slot.* — espelho de
 *  computePericiaPiso (ignora campos como Bonus_Item; conta só A/E/M). */
export function pisoFromIncrementos(incs: Inc[]): number {
  let max = 0
  for (const inc of incs) {
    for (const [k, src] of rankPairs(inc)) {
      if (!isSlotSource(src)) max = Math.max(max, RANK_ORDER[k]!)
    }
  }
  return max
}

/** Piso como LETRA (N/A/E/M) — conveniência pro gate do NAEM na UI. */
export function pisoLetterFromIncrementos(incs: Inc[]): 'N' | 'A' | 'E' | 'M' {
  return RANK_FROM[pisoFromIncrementos(incs)]!
}

/** Recomputa Proficiencia = max rank dos incrementos rank-based (A/E/M). */
function maxRank(incs: Inc[]): 'N' | 'A' | 'E' | 'M' {
  let max = 0
  for (const inc of incs) {
    for (const [k] of rankPairs(inc)) max = Math.max(max, RANK_ORDER[k]!)
  }
  return RANK_FROM[max]!
}

/**
 * Aplica um clique de rank numa perícia sobre a lista SALVA e devolve uma NOVA
 * lista (pura). `floorIncs` são os incrementos da linha DERIVADA (fonte do
 * piso). Espelha applyPericiaProfUserEdit:
 *   - clampa o alvo ao piso (não rebaixa abaixo dele);
 *   - remove Slot.* com rank > alvo;
 *   - adiciona Slot.<r> para os ranks entre (piso+1)..alvo sem incremento;
 *   - recomputa Proficiencia = max.
 */
export function applyPericiaRankEdit(
  savedLista: Row[],
  floorIncs: Inc[],
  nome: string,
  newRank: 'N' | 'A' | 'E' | 'M',
): Row[] {
  const piso = pisoFromIncrementos(floorIncs)
  const target = Math.max(RANK_ORDER[newRank] ?? 0, piso)

  const out: Row[] = savedLista.map((r) => ({ ...r, Incrementos: [...incsOf(r)] }))
  let row: Row | undefined = out.find((r) => String(r.Nome) === nome)
  if (!row) {
    row = { Nome: nome, Atributo: '', Proficiencia: 'N', Bonus_Item: 0, Bonus_Especial: 0, Incrementos: [] }
    out.push(row)
  }
  let incs = row.Incrementos as Inc[]

  // Remove Slot.* com rank > alvo — #416: apaga a CHAVE do par (o objeto pode
  // dividir espaço com um Bonus_Item, que sobrevive); objeto vazio sai.
  incs = incs
    .map((inc) => {
      const next: Inc = { ...inc }
      for (const [k, src] of rankPairs(inc)) {
        if (isSlotSource(src) && RANK_ORDER[k]! > target) delete next[k]
      }
      return next
    })
    .filter((inc) => Object.keys(inc).length > 0)

  // Adiciona Slot.<r> nos ranks (piso+1)..alvo ainda sem incremento na linha salva.
  for (let r = piso + 1; r <= target; r++) {
    const rank = RANK_FROM[r] as 'A' | 'E' | 'M'
    if (!incs.some((inc) => rank in inc)) incs.push({ [rank]: `Slot.${rank}` })
  }

  row.Incrementos = incs
  row.Proficiencia = maxRank(incs)
  return out
}

/** Maior rank que o user PODE atingir clicando NAEM desta perícia, dado o
 *  orçamento GLOBAL de slots (com fungibilidade) e os incrementos já presentes
 *  na linha DERIVADA. Ranks ≤ atual são sempre alcançáveis (rebaixar remove
 *  Slot.*). Pra SUBIR, precisa de slot livre pros ranks intermediários sem
 *  incremento. Espelho de computePericiaMaxReachable do plugin
 *  (util/pericia-slot-accounting.ts:81-113).
 *
 *  `derivedIncs` são os incrementos da linha DERIVADA (regra + slot ao vivo);
 *  `currentRank` é a proficiência derivada; `slots` é o SlotsView global. */
export function computePericiaMaxReachable(
  currentRank: 'N' | 'A' | 'E' | 'M',
  derivedIncs: Inc[],
  slots: SlotsView,
): 'N' | 'A' | 'E' | 'M' {
  const curIdx = RANK_ORDER[currentRank] ?? 0
  for (const cand of ['M', 'E', 'A', 'N'] as const) {
    if (RANK_ORDER[cand]! <= curIdx) return cand // rebaixar/manter — sempre alcançável
    let needA = 0
    let needE = 0
    let needM = 0
    for (let r = curIdx + 1; r <= RANK_ORDER[cand]!; r++) {
      const rankStr = RANK_FROM[r] as 'A' | 'E' | 'M'
      if (derivedIncs.some((inc) => rankStr in inc)) continue
      if (rankStr === 'A') needA++
      else if (rankStr === 'E') needE++
      else needM++
    }
    if (
      slotsFeasible(
        slots.used.A + needA,
        slots.used.E + needE,
        slots.used.M + needM,
        slots.total.A,
        slots.total.E,
        slots.total.M,
      )
    ) {
      return cand
    }
  }
  return 'N'
}

/** Ranks FORA do intervalo [piso, teto] — devem ficar desabilitados no NAEM.
 *  Espelho de ranksOutsideRange do plugin (pericias-card.ts:73-79). */
export function ranksOutsideRange(
  piso: 'N' | 'A' | 'E' | 'M',
  ceiling: 'N' | 'A' | 'E' | 'M',
): Array<'N' | 'A' | 'E' | 'M'> {
  const out: Array<'N' | 'A' | 'E' | 'M'> = []
  for (const r of ['N', 'A', 'E', 'M'] as const) {
    if (RANK_ORDER[r]! < RANK_ORDER[piso]! || RANK_ORDER[r]! > RANK_ORDER[ceiling]!) out.push(r)
  }
  return out
}
