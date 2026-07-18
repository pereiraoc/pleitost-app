// Helpers de "dificuldade no nível do grupo": reusa o port existente
// (computeEncounterDifficultyByLevel) e escolhe a entry do nível dado. O nível
// vem da MÉDIA do grupo ativo (nivelMedioDoGrupo).
import {
  computeEncounterDifficultyByLevel,
  type EncounterCombatant,
  type EncounterDifficultyByLevelEntry,
} from './encounter-compute'

/** A entry de dificuldade do nível pedido (clamp 1..10) sobre os monstros atuais. */
export function difficultyAtLevel(
  combatants: readonly EncounterCombatant[],
  level: number,
): EncounterDifficultyByLevelEntry {
  const byLevel = computeEncounterDifficultyByLevel(combatants)
  const n = Math.max(1, Math.min(10, Math.round(Number(level) || 1)))
  // byLevel é 1..10 na ordem → índice n-1
  return byLevel[n - 1]!
}

/** Média (arredondada) dos níveis do grupo; `null` se nenhum nível válido. */
export function nivelMedioDoGrupo(niveis: readonly (number | null | undefined)[]): number | null {
  const vals = niveis.filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0)
  if (vals.length === 0) return null
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
}
