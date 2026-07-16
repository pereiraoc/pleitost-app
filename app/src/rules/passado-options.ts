// Opções de "Perícia pelo Passado" e "Ofício pelo Passado" — PORTA de
// src/util/passado-options.ts + src/util/calculated-coverage.ts do plugin
// pleitost-autosheet. Render só lê o que estas fns devolvem.
import type { Deltas } from './rule-applier'
import { PERICIAS } from './rules-model'

const PERICIA_PROF_KEY_RX = /^Pericias\.Lista\.([A-Za-z0-9_]+)\.Proficiencia$/
const OFICIO_PROF_KEY_RX = /^Oficios\.Lista\.([A-Za-z0-9_]+)\.Proficiencia$/

function isRankA(value: unknown): boolean {
  return typeof value === 'string' && value.trim().toUpperCase() === 'A'
}

/** Perícias cuja proficiência foi DEFINIDA como rank A por rule no
 *  calculated atual (rank E/M não conflita com o A do Passado) — espelho
 *  de coveredPericias (plugin util/calculated-coverage.ts:29-38). */
export function coveredPericias(calculated: Deltas): Set<string> {
  const out = new Set<string>()
  for (const [key, value] of Object.entries(calculated)) {
    if (key.startsWith('__')) continue
    const m = key.match(PERICIA_PROF_KEY_RX)
    if (m && PERICIAS.includes(m[1]!) && isRankA(value)) out.add(m[1]!)
  }
  return out
}

/** Espelho de coveredOficios (plugin util/calculated-coverage.ts:41-50). */
export function coveredOficios(calculated: Deltas): Set<string> {
  const out = new Set<string>()
  for (const [key, value] of Object.entries(calculated)) {
    if (key.startsWith('__')) continue
    const m = key.match(OFICIO_PROF_KEY_RX)
    if (m && isRankA(value)) out.add(m[1]!)
  }
  return out
}

export interface PericiaOption {
  id: string
  alreadyTrained: boolean
}

/** Espelho de periciasPassadoOptions (plugin util/passado-options.ts:27-39):
 *  filtra perícias treinadas por RULE no extract atual; pick atual permanece. */
export function periciasPassadoOptions(
  currentPick: string | null,
  coveredByRule: Set<string>,
): PericiaOption[] {
  const out: PericiaOption[] = []
  for (const pid of PERICIAS) {
    const fromRule = coveredByRule.has(pid)
    if (fromRule && currentPick !== pid) continue
    out.push({ id: pid, alreadyTrained: fromRule })
  }
  return out
}

export type OficioPassadoValue = 'Oficio' | 'Atuacao'

export interface OficioPassadoOption {
  value: OficioPassadoValue
}

/** Espelho de oficiosPassadoOptions (plugin util/passado-options.ts:58-81). */
export function oficiosPassadoOptions(
  currentPick: OficioPassadoValue | null,
  coveredByRule: Set<string>,
): OficioPassadoOption[] {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const matchesPickName = (pick: OficioPassadoValue, nome: string): boolean => {
    const n = norm(nome)
    return pick === 'Atuacao' ? n === 'atuacao' : !!n && n !== 'atuacao'
  }
  const blockedBy = (pick: OficioPassadoValue): boolean => {
    for (const nome of coveredByRule) {
      if (matchesPickName(pick, nome)) return true
    }
    return false
  }
  const out: OficioPassadoOption[] = []
  if (!blockedBy('Oficio') || currentPick === 'Oficio') out.push({ value: 'Oficio' })
  if (!blockedBy('Atuacao') || currentPick === 'Atuacao') out.push({ value: 'Atuacao' })
  return out
}

/** Pick de perícia do Passado aplicado ao FM — espelho de
 *  applyPassadoToModel (plugin extract/apply-passado-to-model.ts:18-40) +
 *  refreshDerivedProficiencias (merge-calculated-into-model.ts:629-648),
 *  em cima das LINHAS do FM (Pericias.Lista/Oficios.Lista): remove o
 *  incremento `{A: "Passado"}` de quem não é o pick, adiciona no pick e
 *  recomputa Proficiencia = max rank dos incrementos rank-based. */
export function applyPassadoPickToRows(
  rows: Record<string, unknown>[],
  isPickRow: (row: Record<string, unknown>) => boolean,
): Record<string, unknown>[] {
  const RANK_ORDER: Record<string, number> = { N: 0, A: 1, E: 2, M: 3 }
  const RANK_FROM = ['N', 'A', 'E', 'M'] as const
  return rows.map((row) => {
    const incs = (Array.isArray(row['Incrementos']) ? row['Incrementos'] : []) as Record<string, unknown>[]
    const semPassado = incs.filter((inc) => !Object.values(inc).some((v) => v === 'Passado'))
    const next = isPickRow(row) ? [...semPassado, { A: 'Passado' }] : semPassado
    // refreshDerivedProficiencias: max rank dos incrementos SEM field
    // (chaves A/E/M puras; field-based como Bonus_Item ficam de fora).
    let max = 0
    for (const inc of next) {
      for (const key of Object.keys(inc)) {
        if (key === 'A' || key === 'E' || key === 'M') max = Math.max(max, RANK_ORDER[key]!)
      }
    }
    return { ...row, Incrementos: next, Proficiencia: RANK_FROM[max] }
  })
}
