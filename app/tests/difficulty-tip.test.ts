// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { difficultyTipHtml, partyDifficultyTipHtml } from '../src/mestre/difficulty-tip'
import {
  computeEncounterDifficulty,
  computeEncounterDifficultyByLevel,
  type EncounterCombatant,
} from '../src/mestre/encounter-compute'
import { combatantsFrom, type RosterItem } from '../src/mestre/roster'

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

  it('party: usa os heróis REAIS da mesa (agrupados por nível), suffix "Sua mesa"', () => {
    const monstros = [monstro(2), monstro(2)] // 50 pts
    const item: RosterItem = {
      sourceId: 'm', sourcePath: 'm.md', label: 'M', qty: 2, tier: 2, modificador: null,
    }
    // mesa: 2 heróis nível 3 + 1 herói nível 5
    const heroLevels = [3, 3, 5]
    const combined = combatantsFrom([item], heroLevels)
    const result = computeEncounterDifficulty(combined)
    const html = partyDifficultyTipHtml(result, monstros, heroLevels)
    expect(html).toContain('Sua mesa')
    expect(html).toContain('2× herói nível 3')
    expect(html).toContain('1× herói nível 5')
    expect(html).toMatch(/Trivial|Fácil|Difícil|Letal/i)
  })
})
