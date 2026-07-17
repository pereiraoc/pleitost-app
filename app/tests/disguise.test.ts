// #291 (segurança): a projeção mascarada não pode vazar identidade do NPC.
import { describe, expect, it } from 'vitest'
import { maskSummaryForDisguise } from '../src/data/session-repo/disguise'
import type { CharacterSummary } from '../src/data/session-repo/contract'

const real: CharacterSummary = {
  nome: 'Goblin Assassino da Névoa',
  family: 'Monstro',
  classe: 'Ladino',
  sintonia: '[[Traço Elemental do Vento]]',
  raca: 'Goblin',
  nivel: 7,
  atributos: { FOR: 2, AGI: 4, INT: 1, PRE: 3 },
  vitalidadeMax: 42,
  moralMax: 10,
  imagem: 'goblin.webp',
  stats: { defesa: 18, vigor: 12, evasao: 15, impeto: 6, movimento: 9, percepcao: 14, intuicao: 8 },
}

describe('maskSummaryForDisguise (#291)', () => {
  it('zera/omite identidade e stats, mas MANTÉM a imagem (spec: imagem visível se não escondido)', () => {
    const m = maskSummaryForDisguise(real)
    expect(m.nome).toBe('')
    expect(m.raca).toBeUndefined()
    expect(m.classe).toBeUndefined()
    expect(m.sintonia).toBeUndefined()
    expect(m.imagem).toBe('goblin.webp') // imagem aparece na iniciativa
    expect(m.nivel).toBe(0)
    expect(m.atributos).toEqual({ FOR: 0, AGI: 0, INT: 0, PRE: 0 })
    expect(m.stats).toEqual({ defesa: 0, vigor: 0, evasao: 0, impeto: 0, movimento: 0, percepcao: 0, intuicao: 0 })
  })

  it('não vaza nome/raça/classe/sintonia/stats no JSON (prova anti-devtools)', () => {
    const blob = JSON.stringify(maskSummaryForDisguise(real))
    for (const leak of ['Goblin Assassino', 'Ladino', 'Vento', 'Goblin', '18']) {
      expect(blob).not.toContain(leak)
    }
  })

  it('revealName=true traz o NOME de volta, mas stats/atributos continuam ocultos', () => {
    const m = maskSummaryForDisguise(real, true)
    expect(m.nome).toBe('Goblin Assassino da Névoa') // revelado → nome visível
    expect(m.stats.defesa).toBe(0) // stats continuam mascarados
    expect(m.atributos.AGI).toBe(0)
    expect(m.raca).toBeUndefined()
  })

  it('mantém só o mínimo pro render dos jogadores: family + imagem + barras', () => {
    const m = maskSummaryForDisguise(real)
    expect(m.family).toBe('Monstro') // baseLabelOf → "Criatura N" (raça fora)
    expect(m.vitalidadeMax).toBe(42) // estimativa de vida se apoia nisso
    expect(m.moralMax).toBe(10)
  })

  it('moralMax ausente no real fica ausente no mascarado (não vira 0 espúrio)', () => {
    const semMoral = { ...real, moralMax: undefined }
    expect(maskSummaryForDisguise(semMoral).moralMax).toBeUndefined()
  })
})
