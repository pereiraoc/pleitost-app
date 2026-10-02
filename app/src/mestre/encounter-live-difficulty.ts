// ESCUDO DO MESTRE (2026-10-02) — dificuldade AO VIVO do encontro ativo da
// sala: os combatentes que estão de fato na ordem do turno (herói publicado →
// nível do FM/summary; NPC → Tier + Modificador do FM; companheiro animal não
// pontua, como no sync) viram EncounterCombatant[] e passam pelo MESMO compute
// do plugin (encounter-compute.ts). Nada de fórmula nova.
import type { SessionCharacter } from '../data/session-repo/contract'
import {
  computeEncounterDifficulty,
  parseModificador,
  tierFromLevel,
  type EncounterCombatant,
  type EncounterDifficultyResult,
} from './encounter-compute'

export interface LiveCombatantInput {
  c: SessionCharacter
  fm: Record<string, unknown>
}

function numero(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Combatentes do encontro ativo no shape do compute. Herói: subcategoria
 *  'Heroi' com o nível (FM `Nível`, senão summary.nivel). NPC: só pontua se é
 *  Monstro (FM subcategoria ou summary.family), com Tier/Modificador do FM.
 *  Companheiro animal e NPC sem ficha (sem Tier) ficam fora — o badge diz
 *  "sem ficha" pelo total parcial, nunca inventa tier. */
export function liveEncounterCombatants(inputs: readonly LiveCombatantInput[]): EncounterCombatant[] {
  const out: EncounterCombatant[] = []
  for (const { c, fm } of inputs) {
    if (c.kind === 'companheiro') continue
    if (c.kind === 'npc') {
      const sub = String(fm['subcategoria'] ?? c.summary.family ?? '').trim()
      if (sub !== 'Monstro') continue
      const tier = numero(fm['Tier'])
      if (tier == null) continue
      out.push({
        source: c.characterPath || c.summary.nome,
        family: 'Monstro',
        subcategoria: 'Monstro',
        tier,
        nivel: null,
        modificador: parseModificador(fm),
      })
      continue
    }
    const nivel = numero(fm['Nível']) ?? (c.summary.nivel > 0 ? c.summary.nivel : null)
    if (nivel == null) continue
    out.push({
      source: c.characterPath || c.summary.nome,
      family: 'Heroi',
      subcategoria: 'Heroi',
      tier: tierFromLevel(nivel),
      nivel,
      modificador: null,
    })
  }
  return out
}

export interface LiveDifficulty {
  result: EncounterDifficultyResult
  monstros: EncounterCombatant[]
  heroLevels: number[]
  /** Quantos NPCs do encontro não pontuaram (sem ficha/tier neste aparelho). */
  npcsSemFicha: number
}

/** null quando não há monstro pontuando (combate ad-hoc só com heróis, ou
 *  NPCs sem ficha) — o cabeçalho então não mostra badge. */
export function liveEncounterDifficulty(inputs: readonly LiveCombatantInput[]): LiveDifficulty | null {
  const combatants = liveEncounterCombatants(inputs)
  const monstros = combatants.filter((x) => x.subcategoria === 'Monstro')
  if (monstros.length === 0) return null
  const heroLevels = combatants.filter((x) => x.subcategoria === 'Heroi').map((x) => x.nivel ?? 0)
  const npcs = inputs.filter((i) => i.c.kind === 'npc').length
  return {
    result: computeEncounterDifficulty(combatants),
    monstros,
    heroLevels,
    npcsSemFicha: Math.max(0, npcs - monstros.length),
  }
}
