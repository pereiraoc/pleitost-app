// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { difficultyTipHtml } from '../src/mestre/difficulty-tip'
import { computeEncounterDifficultyByLevel, type EncounterCombatant } from '../src/mestre/encounter-compute'

const monstro = (tier: number): EncounterCombatant => ({
  source: 'x',
  family: 'Monstro',
  subcategoria: 'Monstro',
  tier,
  nivel: null,
  modificador: null,
})

describe('difficulty-tip', () => {
  it('cita a régua dos limiares e o total de pontos', () => {
    const combatants = [monstro(2), monstro(2)] // 50 pts
    const entry = computeEncounterDifficultyByLevel(combatants)[4]! // nível 5
    const html = difficultyTipHtml(entry, combatants)
    expect(html).toContain('50') // pontos dos monstros (razão / breakdown)
    expect(html).toMatch(/Trivial|Fácil|Difícil|Letal/i) // classificação (header)
    expect(html).toContain('50–75') // faixa da régua (en-dash)
    expect(html).toContain('herói nível 5') // linha dos heróis
  })
})
