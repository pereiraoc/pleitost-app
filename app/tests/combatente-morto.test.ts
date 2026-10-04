// Batch 2 (morto pula a vez): classificação de vida por FAMÍLIA. Herói e
// companheiro animal têm moral e vão NEGATIVO (Sistema/Regras/Combate/Morte.md:
// EV ≤ 0 → Morrendo, ainda age; EV ≤ −máx → Inconsciente+Caído, morre se não
// estabilizado). Monstro não tem moral — o piso é 0. "Morto" (faixa e pular a
// vez) só com a marca EXPLÍCITA do GM; sugereMorte só destaca o botão.
import { describe, expect, it } from 'vitest'
import { sugereMorte, vitaStatusOf } from '../src/data/session-repo/combatente'
import { normalizaTurnState } from '../src/data/initiative-blocks'
import type { SessionCharacter } from '../src/data/session-repo/contract'

const char = (kind: SessionCharacter['kind'], family: string, vit: number, vitMax = 10): SessionCharacter =>
  ({
    id: 'x',
    kind,
    summary: { nome: 'X', family, nivel: 1, atributos: { FOR: 0, AGI: 0, INT: 0, PRE: 0 }, vitalidadeMax: vitMax, stats: {} },
    state: { recursosRestantes: { vitalidade: vit, moral: 0, em: 0, moralTemp: 0 }, condicoesAtivas: {}, efeitosAtivos: {} },
  }) as unknown as SessionCharacter

describe('vitaStatusOf / sugereMorte por família', () => {
  it('herói em 0 → Morrendo (não Morto) e sem sugestão de morte', () => {
    const c = char('heroi', 'Heroi', 0)
    expect(vitaStatusOf(c).label).toBe('Morrendo')
    expect(sugereMorte(c)).toBe(false)
  })
  it('herói negativo acima do piso → Morrendo', () => {
    expect(vitaStatusOf(char('heroi', 'Heroi', -9)).label).toBe('Morrendo')
    expect(sugereMorte(char('heroi', 'Heroi', -9))).toBe(false)
  })
  it('herói em −máx → sugereMorte', () => {
    expect(sugereMorte(char('heroi', 'Heroi', -10))).toBe(true)
  })
  it('companheiro (família com moral) em 0 → Morrendo; em −máx sugere', () => {
    expect(vitaStatusOf(char('companheiro', 'CompanheiroAnimal', 0)).label).toBe('Morrendo')
    expect(sugereMorte(char('companheiro', 'CompanheiroAnimal', -10))).toBe(true)
  })
  it('NPC de família com moral (CompanheiroAnimal como NPC) também morre devagar', () => {
    expect(vitaStatusOf(char('npc', 'CompanheiroAnimal', 0)).label).toBe('Morrendo')
    expect(sugereMorte(char('npc', 'CompanheiroAnimal', 0))).toBe(false)
  })
  it('monstro em 0 → sugereMorte', () => {
    expect(sugereMorte(char('npc', 'Monstro', 0))).toBe(true)
    expect(sugereMorte(char('npc', 'Monstro', 1))).toBe(false)
  })
  it('marca explícita → Morto, qualquer família e qualquer vida', () => {
    expect(vitaStatusOf(char('heroi', 'Heroi', 7), true)).toEqual({ label: 'Morto', tone: 'is-dead' })
    expect(vitaStatusOf(char('npc', 'Monstro', 10), true).label).toBe('Morto')
  })
  it('herói vivo segue as faixas do plugin', () => {
    expect(vitaStatusOf(char('heroi', 'Heroi', 10)).label).toBe('Impecável')
    expect(vitaStatusOf(char('heroi', 'Heroi', 2)).label).toBe('Gravemente Ferido')
  })
})

describe('turnState preserva mortos', () => {
  it('normalizaTurnState mantém `mortos`', () => {
    const ts = { order: ['b', 'a'], currentIndex: 0, round: 1, speeds: { a: 'super' as const }, mortos: ['b'] }
    const out = normalizaTurnState(ts, () => 'inimigo')
    expect(out.order).toEqual(['a', 'b'])
    expect(out.mortos).toEqual(['b'])
  })
})
