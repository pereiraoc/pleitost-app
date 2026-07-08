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

type Row = Record<string, unknown>
type Inc = Record<string, unknown>

const RANK_ORDER: Record<string, number> = { N: 0, A: 1, E: 2, M: 3 }
const RANK_FROM = ['N', 'A', 'E', 'M'] as const

function isSlotSource(src: unknown): boolean {
  return typeof src === 'string' && src.startsWith('Slot')
}

function rankKey(inc: Inc): 'A' | 'E' | 'M' | null {
  const k = Object.keys(inc)[0]
  return k === 'A' || k === 'E' || k === 'M' ? k : null
}

function incsOf(row: Row): Inc[] {
  return Array.isArray(row.Incrementos) ? (row.Incrementos as Inc[]) : []
}

/** Piso = maior rank de incremento com source ∉ Slot.* — espelho de
 *  computePericiaPiso (ignora campos como Bonus_Item; conta só A/E/M). */
export function pisoFromIncrementos(incs: Inc[]): number {
  let max = 0
  for (const inc of incs) {
    const k = rankKey(inc)
    if (k && !isSlotSource(inc[k])) max = Math.max(max, RANK_ORDER[k])
  }
  return max
}

/** Recomputa Proficiencia = max rank dos incrementos rank-based (A/E/M). */
function maxRank(incs: Inc[]): 'N' | 'A' | 'E' | 'M' {
  let max = 0
  for (const inc of incs) {
    const k = rankKey(inc)
    if (k) max = Math.max(max, RANK_ORDER[k])
  }
  return RANK_FROM[max]
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

  // Remove Slot.* com rank > alvo.
  incs = incs.filter((inc) => {
    const k = rankKey(inc)
    return !(k && isSlotSource(inc[k]) && RANK_ORDER[k] > target)
  })

  // Adiciona Slot.<r> nos ranks (piso+1)..alvo ainda sem incremento na linha salva.
  for (let r = piso + 1; r <= target; r++) {
    const rank = RANK_FROM[r] as 'A' | 'E' | 'M'
    if (!incs.some((inc) => rankKey(inc) === rank)) incs.push({ [rank]: `Slot.${rank}` })
  }

  row.Incrementos = incs
  row.Proficiencia = maxRank(incs)
  return out
}
