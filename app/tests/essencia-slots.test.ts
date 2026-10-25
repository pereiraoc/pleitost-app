// ESSÊNCIAS POR SLOT (2026-10-25): o slot de magia compra a essência
// (Habilidades.Lista, fonte Slot.X); fichas antigas migram da Escolha.
import { describe, expect, it } from 'vitest'
import { migrarEssenciasParaSlots, rankDaEssencia } from '../src/rules/essencia-slots'
import { gastosDeSlot } from '../src/rules/slots-magia'

/** Slots gastos em essência por rank num escopo (Menor = secundário). */
const slotsDeEssencia = (fm: Record<string, unknown>, sec: boolean) => {
  const out = { B: 0, A: 0, E: 0, M: 0 }
  for (const g of gastosDeSlot(fm, sec)) if (g.escola === null) out[g.rank]++
  return out
}
import { mergeCalculatedIntoFm } from '../src/rules/merge-calculated'

describe('rank pela nota', () => {
  it('Adepta/Menor = A, Experiente = E, Mestre e composta = M', () => {
    expect(rankDaEssencia('Essência Mineral Adepta')).toBe('A')
    expect(rankDaEssencia('Essência Mineral Menor')).toBe('A')
    expect(rankDaEssencia('Essência Mineral Experiente')).toBe('E')
    expect(rankDaEssencia('Essência Mineral Experiente Menor')).toBe('E')
    expect(rankDaEssencia('Essência de Criação Mestre')).toBe('M')
    expect(rankDaEssencia('Essência do Meteoro')).toBe('M')
    expect(rankDaEssencia('Magias Anima')).toBeNull()
  })
})

describe('migração das escolhas antigas', () => {
  const fm = {
    Habilidades: {
      Lista: [
        { '[[Magias Anima]]': 'Regra.[[Animista]]' },
        { '[[Essência Flamejante Adepta]]': 'Escolha.01.[[Magias Anima]]' },
        { '[[Essência Explosiva Adepta]]': 'Escolha.02.[[Magias Anima]]' },
        { '[[Essência Flamejante Experiente]]': 'Escolha.[[Elementalista]]' },
        { '[[Essência do Meteoro]]': 'Escolha.[[Avatar]]' },
        { '[[Essência Hidratante Adepta]]': 'Escolha.[[Essência Invertida]]' },
        { '[[Essência Mineral Menor]]': 'Escolha.01.[[Treinamento de Animista]]' },
      ],
    },
  }
  it('escolha vira slot do rank; a da Invertida sai (agora é concessão fixa)', () => {
    const out = migrarEssenciasParaSlots(fm)
    expect((out['Habilidades'] as { Lista: unknown[] }).Lista).toEqual([
      { '[[Magias Anima]]': 'Regra.[[Animista]]' },
      { '[[Essência Flamejante Adepta]]': 'Slot.A' },
      { '[[Essência Explosiva Adepta]]': 'Slot.A' },
      { '[[Essência Flamejante Experiente]]': 'Slot.E' },
      { '[[Essência do Meteoro]]': 'Slot.M' },
      { '[[Essência Mineral Menor]]': 'Slot.A' },
    ])
    expect(slotsDeEssencia(out, false)).toEqual({ B: 0, A: 2, E: 1, M: 1 })
    expect(slotsDeEssencia(out, true)).toEqual({ B: 0, A: 1, E: 0, M: 0 })
  })
  it('idempotente: sem o que migrar devolve o mesmo objeto', () => {
    const out = migrarEssenciasParaSlots(fm)
    expect(migrarEssenciasParaSlots(out)).toBe(out)
  })
})

describe('concessão de regra reembolsa o slot', () => {
  it('a pura gravada como Slot.A que a regra passou a dar assume a fonte da regra', () => {
    const saved = { Habilidades: { Lista: [{ '[[Essência Flamejante Adepta]]': 'Slot.A' }, { '[[Essência Explosiva Adepta]]': 'Slot.A' }] } }
    const out = mergeCalculatedIntoFm(saved, {
      'Habilidades.Lista': [{ link: '[[Essência Flamejante Adepta]]', source: 'Regra.[[Magias Anima]]' }],
    }, [])
    expect((out['Habilidades'] as { Lista: unknown[] }).Lista).toEqual([
      { '[[Essência Flamejante Adepta]]': 'Regra.[[Magias Anima]]' },
      { '[[Essência Explosiva Adepta]]': 'Slot.A' },
    ])
    expect(slotsDeEssencia(out, false).A).toBe(1)
  })
})
