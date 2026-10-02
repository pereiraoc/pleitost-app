// @vitest-environment node
// ESCUDO DO MESTRE (B7): dificuldade AO VIVO do encontro ativo — os combatentes
// na ordem do turno viram EncounterCombatant[] e passam pelo compute do plugin.
import { describe, expect, it } from 'vitest'
import {
  liveEncounterCombatants,
  liveEncounterDifficulty,
} from '../src/mestre/encounter-live-difficulty'
import type { SessionCharacter } from '../src/data/session-repo/contract'

const char = (over: Partial<SessionCharacter> & { family: string; kind: SessionCharacter['kind'] }): SessionCharacter =>
  ({
    id: over.id ?? 'x',
    sessionId: 's',
    memberId: 'm',
    tutorCharacterId: null,
    characterPath: over.characterPath ?? 'p',
    visibility: 'visible',
    summary: { nome: 'N', family: over.family, nivel: 0, atributos: { FOR: 0, AGI: 0, INT: 0, PRE: 0 }, vitalidadeMax: 10, stats: {} },
    state: { recursosRestantes: { vitalidade: 10, moral: 0, em: 0, moralTemp: 0 }, condicoesAtivas: {}, efeitosAtivos: {}, invocacoesAtivas: {} },
    fmBlob: {},
    updatedAt: '',
    ...over,
  }) as unknown as SessionCharacter

describe('liveEncounterCombatants', () => {
  it('herói pelo Nível do FM (fallback summary.nivel); monstro por Tier/Modificador; companheiro fora', () => {
    const out = liveEncounterCombatants([
      { c: char({ family: 'Heroi', kind: 'heroi' }), fm: { Nível: 7 } },
      { c: char({ family: 'Heroi', kind: 'heroi', summary: { nivel: 2 } as never }), fm: {} },
      { c: char({ family: 'Monstro', kind: 'npc' }), fm: { subcategoria: 'Monstro', Tier: 1, Modificador: 'Elite' } },
      { c: char({ family: 'CompanheiroAnimal', kind: 'companheiro' }), fm: { Nível: 7 } },
    ])
    expect(out.map((x) => [x.subcategoria, x.tier, x.nivel, x.modificador])).toEqual([
      ['Heroi', 3, 7, null],
      ['Heroi', 1, 2, null],
      ['Monstro', 1, null, 'Elite'],
    ])
  })
  it('NPC sem Tier (sem ficha neste aparelho) não pontua e é contado em npcsSemFicha', () => {
    const dif = liveEncounterDifficulty([
      { c: char({ family: 'Heroi', kind: 'heroi' }), fm: { Nível: 1 } },
      { c: char({ id: 'a', family: 'Monstro', kind: 'npc' }), fm: { subcategoria: 'Monstro', Tier: 0 } },
      { c: char({ id: 'b', family: 'Monstro', kind: 'npc' }), fm: {} },
    ])
    expect(dif).not.toBeNull()
    expect(dif!.monstros.length).toBe(1)
    expect(dif!.npcsSemFicha).toBe(1)
    expect(dif!.heroLevels).toEqual([1])
    // T0 = 5 pts vs herói nível 1 = 10 pts → 50% = FÁCIL (tabela do plugin)
    expect(dif!.result.monsterTotal).toBe(5)
    expect(dif!.result.playerTotal).toBe(10)
    expect(dif!.result.label).toBe('FÁCIL')
  })
  it('sem monstro pontuando → null (combate ad-hoc só de heróis não mostra badge)', () => {
    expect(liveEncounterDifficulty([{ c: char({ family: 'Heroi', kind: 'heroi' }), fm: { Nível: 3 } }])).toBeNull()
    expect(liveEncounterDifficulty([])).toBeNull()
  })
  it('só heróis ausentes: razão infinita → LETAL (como o compute)', () => {
    const dif = liveEncounterDifficulty([
      { c: char({ family: 'Monstro', kind: 'npc' }), fm: { subcategoria: 'Monstro', Tier: 2 } },
    ])!
    expect(dif.result.label).toBe('LETAL')
    expect(dif.heroLevels).toEqual([])
  })
})
