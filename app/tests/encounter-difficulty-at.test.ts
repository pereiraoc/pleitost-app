// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { difficultyAtLevel, nivelMedioDoGrupo } from '../src/mestre/encounter-difficulty-at'
import type { EncounterCombatant } from '../src/mestre/encounter-compute'

const monstro = (tier: number, modificador: EncounterCombatant['modificador'] = null): EncounterCombatant => ({
  source: 'x',
  family: 'Monstro',
  subcategoria: 'Monstro',
  tier,
  nivel: null,
  modificador,
})

describe('encounter-difficulty-at', () => {
  it('nivelMedioDoGrupo: média arredondada; vazio → null', () => {
    expect(nivelMedioDoGrupo([1, 2, 3, 4])).toBe(3) // 2.5 → 3 (round-half-up)
    expect(nivelMedioDoGrupo([5, 5])).toBe(5)
    expect(nivelMedioDoGrupo([null, undefined])).toBeNull()
    expect(nivelMedioDoGrupo([])).toBeNull()
  })

  it('difficultyAtLevel: pega a entry do nível pedido (clamp 1..10)', () => {
    const combatants = [monstro(2), monstro(2)] // 2×25 = 50 pts
    const e = difficultyAtLevel(combatants, 5)
    expect(e.level).toBe(5)
    expect(e.monsterTotal).toBe(50)
    // nível 5 → 27×4 = 108 heróis → ratio ~46% → TRIVIAL
    expect(e.label).toBe('TRIVIAL')
    // clamp
    expect(difficultyAtLevel(combatants, 99).level).toBe(10)
    expect(difficultyAtLevel(combatants, 0).level).toBe(1)
  })
})
