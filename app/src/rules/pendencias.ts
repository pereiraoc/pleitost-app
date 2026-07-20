// #302: pendências do herói POR aba do painel esquerdo — o que ainda falta
// preencher. REUSA exatamente as contas dos painéis (slot-accounting +
// eligibilidade de especialidade/maestria), pra o indicador nunca discordar do
// que a aba mostra. Puro: recebe o FM DERIVADO + rules + caps de família.
import {
  canAddOne,
  computeMagiaSlotsView,
  computeSlotsView,
  magiaCanAddOne,
  type MagiaRank,
  type SlotRank,
} from './slot-accounting'
import { fmPath, listaEntries, num, profLetter, str, type ProfRow } from '../components/ficha/hero-model'
import type { FichaFamilia } from '../data/familia'

type Fm = Record<string, unknown>
/** Só os campos de `rules` que a pendência usa (evita acoplar ao tipo inteiro). */
interface RulesLike {
  subclassChoices?: Array<{ pick?: string | null }>
  sintonias?: unknown[]
}

const RANK_IDX: Record<string, number> = { N: 0, A: 1, E: 2, M: 3 }

function slotsRec(fm: Fm, ...path: string[]): Record<string, unknown> | undefined {
  return fmPath(fm, ...path) as Record<string, unknown> | undefined
}

/** ≥1 slot de perícia livre — mesma conta da ProficienciasPanel. */
function freePericiaSlot(fm: Fm): boolean {
  const pericias = (fmPath(fm, 'Pericias', 'Lista') ?? []) as ProfRow[]
  const usedBy = (l: string) =>
    pericias.filter((p) =>
      (p.Incrementos ?? []).some((inc) => str((inc as Record<string, unknown>)[l]).startsWith('Slot')),
    ).length
  const s = slotsRec(fm, 'Pericias', 'Slots')
  const view = computeSlotsView({
    total: { A: num(s?.['A']), E: num(s?.['E']), M: num(s?.['M']) },
    used: { A: usedBy('A'), E: usedBy('E'), M: usedBy('M') },
  })
  return (['A', 'E', 'M'] as SlotRank[]).some((r) => canAddOne(view, r))
}

/** ≥1 slot de técnica livre — mesma conta da TecnicasPanel. */
function freeTecnicaSlot(fm: Fm): boolean {
  const entries = listaEntries(fmPath(fm, 'Tecnicas', 'Lista'))
  const usedBy = (l: string) =>
    entries.filter((e) => e.fonte.kind === 'Slot' && e.fonte.target === l).length
  const s = slotsRec(fm, 'Tecnicas', 'Slots')
  const view = computeSlotsView({
    total: { A: num(s?.['A']), E: num(s?.['E']), M: num(s?.['M']) },
    used: { A: usedBy('A'), E: usedBy('E'), M: usedBy('M') },
  })
  return (['A', 'E', 'M'] as SlotRank[]).some((r) => canAddOne(view, r))
}

/** ≥1 slot de magia PREENCHÍVEL num namespace (Magias ou Magias.Secundaria) —
 *  mesma conta da MagiasHabPanel. #328: um slot só conta se HÁ escola PROFICIENTE
 *  (prof ≠ N, fora Tesouros) pra recebê-lo; sem ela o painel não oferece onde
 *  aprender, então o slot é INPREENCHÍVEL e não é pendência (ex.: o slot B solto
 *  que o Quasi-Mago concede sem proficiência de escola no primário). */
function freeMagiaSlotIn(magias: Record<string, unknown> | undefined): boolean {
  if (!magias) return false
  const escolas = (magias['Lista'] ?? []) as Record<string, unknown>[]
  const temProficiente = escolas.some(
    (e) => str(e['Nome']) !== 'Tesouros' && str(e['Proficiencia']) !== 'N',
  )
  if (!temProficiente) return false
  const usedBy = (l: string) =>
    escolas
      .flatMap((e) => listaEntries(e['Lista']))
      .filter((e) => e.fonte.kind === 'Slot' && e.fonte.target === l).length
  const s = (magias['Slots'] ?? {}) as Record<string, unknown>
  const view = computeMagiaSlotsView({
    total: { B: num(s['B']), A: num(s['A']), E: num(s['E']), M: num(s['M']) },
    used: { B: usedBy('B'), A: usedBy('A'), E: usedBy('E'), M: usedBy('M') },
  })
  return (['B', 'A', 'E', 'M'] as MagiaRank[]).some((r) => magiaCanAddOne(view, r))
}

/** ≥1 slot de magia livre — no PRIMÁRIO ou no SECUNDÁRIO (#328: o Mago secundário
 *  guarda slots/lista em Magias.Secundaria; antes só o primário era checado, então
 *  quem preenchia o secundário e tinha um slot solto no primário via a pendência
 *  sem nunca conseguir limpá-la). */
function freeMagiaSlot(fm: Fm): boolean {
  return (
    freeMagiaSlotIn(fmPath(fm, 'Magias') as Record<string, unknown> | undefined) ||
    freeMagiaSlotIn(fmPath(fm, 'Magias', 'Secundaria') as Record<string, unknown> | undefined)
  )
}

/** Pendências por aba (CHAR_TABS), cada uma com a LISTA de motivos legíveis
 *  (o indicador mostra o ponto quando a lista não é vazia e usa os motivos no
 *  tooltip). 'habilidades' = Competências. Biografia NÃO tem pendência: o nome
 *  do herói sempre existe (cai no basename), então o antigo check de `fm.nome`
 *  vazio era falso-positivo pra todo herói real (ex.: Carlos usa o basename). */
export function heroPendencias(
  fm: Fm,
  rules: RulesLike | null | undefined,
  caps: FichaFamilia,
): Map<string, string[]> {
  const out = new Map<string, string[]>()
  const add = (tab: string, motivo: string) => {
    const list = out.get(tab)
    if (list) list.push(motivo)
    else out.set(tab, [motivo])
  }
  const elig = (p: ProfRow, min: 'E' | 'M') => (RANK_IDX[profLetter(p)] ?? 0) >= RANK_IDX[min]!

  // COMPETÊNCIAS (habilidades)
  if (caps.classe.editavel && !str(fm['Classe'])) add('habilidades', 'Classe não escolhida')
  if ((rules?.subclassChoices ?? []).some((c) => !str(c.pick ?? ''))) add('habilidades', 'Subclasse não escolhida')
  if ((rules?.sintonias ?? []).length > 0 && !str(fm['Sintonia'])) add('habilidades', 'Sintonia não escolhida')
  if (caps.tecnicas && freeTecnicaSlot(fm)) add('habilidades', 'Técnica a aprender (slot livre)')
  if (caps.magias && freeMagiaSlot(fm)) add('habilidades', 'Magia a aprender (slot livre)')
  if (caps.especializacoes) {
    if (freePericiaSlot(fm)) add('habilidades', 'Perícia adicional disponível')
    const pericias = (fmPath(fm, 'Pericias', 'Lista') ?? []) as ProfRow[]
    let esp = 0
    let mae = 0
    for (const p of pericias) {
      const rec = p as Record<string, unknown>
      if (elig(p, 'E') && !str(rec['Especializacao'])) esp++
      if (elig(p, 'M') && str(rec['Especializacao']) && !str(rec['Maestria'])) mae++
    }
    if (esp) add('habilidades', esp === 1 ? 'Especialidade não escolhida' : `${esp} especialidades não escolhidas`)
    if (mae) add('habilidades', mae === 1 ? 'Maestria não escolhida' : `${mae} maestrias não escolhidas`)
  }

  return out
}
