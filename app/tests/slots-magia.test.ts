// SLOTS DE MAGIA POR ESCOLA (2026-10-25): Anima (essência), Arcana Essencial
// e o pool Arcana (`Magias.Slots`) — rules/slots-magia.ts.
import { describe, expect, it } from 'vitest'
import { mergeCalculatedIntoFm } from '../src/rules/merge-calculated'
import { targetToModelPath } from '../src/rules/projection'
import { poolsDaEscola, slotsPorPool, usadosPorPool } from '../src/rules/slots-magia'

const ehEssencial = (n: string) => ['Luz', 'Mão Mágica', 'Identificar'].includes(n.replace(/^\[\[|\]\]$/g, ''))

describe('merge: slot por escola', () => {
  it('Magias.Lista.Anima.Slots.A vai pro Slots da linha da Anima (e a secundária idem)', () => {
    const out = mergeCalculatedIntoFm(
      { Magias: { Lista: [{ Nome: 'Anima', Proficiencia: 'A', Lista: [] }], Secundaria: { Lista: [] } } },
      {
        'Magias.Lista.Anima.Slots.A': 2,
        'Magias.Secundaria.Lista.Anima.Slots.A': 1,
        'Magias.Lista.ArcanaEssencial.Slots.B': 1,
      },
      [],
    ) as any
    expect(out.Magias.Lista.find((e: any) => e.Nome === 'Anima').Slots).toEqual({ A: 2 })
    expect(out.Magias.Secundaria.Lista.find((e: any) => e.Nome === 'Anima').Slots).toEqual({ A: 1 })
    // Essencial é oculta: nenhuma linha nasce pra ela
    expect(out.Magias.Lista.some((e: any) => /Essencial/.test(e.Nome))).toBe(false)
  })
  it('fonte do slot rastreável (tooltip)', () => {
    expect(targetToModelPath('Magias.Slots.A')).toBe('magias.slots.A')
    expect(targetToModelPath('Magias.Lista.Anima.Slots.E')).toBe('magias.escolas.Anima.slots.E')
    expect(targetToModelPath('Magias.Secundaria.Lista.Anima.Slots.A')).toBe('magias.secundaria.escolas.Anima.slots.A')
  })
})

describe('pools', () => {
  const calc = { 'Magias.Lista.Anima.Slots.A': 2, 'Magias.Lista.ArcanaEssencial.Slots.B': 1 }
  const derived = { Magias: { Slots: { B: 2, A: 1, E: 0, M: 0 } } }
  it('totais: Arcana do FM, Anima e Essencial do calc', () => {
    const t = slotsPorPool(derived, calc, false)
    expect(t.arcana).toEqual({ B: 2, A: 1, E: 0, M: 0, U: 0 })
    expect(t.anima).toEqual({ B: 0, A: 2, E: 0, M: 0, U: 0 })
    expect(t.essencial).toEqual({ B: 1, A: 0, E: 0, M: 0, U: 0 })
  })
  it('essência gasta Anima; Essencial gasta o pool dela antes do Arcana; Negra gasta Arcana', () => {
    const t = slotsPorPool(derived, calc, false)
    const fm = {
      Habilidades: { Lista: [{ '[[Essência Explosiva Adepta]]': 'Slot.A' }] },
      Magias: {
        Lista: [
          { Nome: 'Arcana Negra', Lista: [{ '[[Luz]]': 'Slot.B' }, { '[[Mão Mágica]]': 'Slot.B' }, { '[[Aturdir]]': 'Slot.B' }] },
        ],
      },
    }
    const u = usadosPorPool(fm, false, t, ehEssencial)
    expect(u.anima.A).toBe(1)
    expect(u.essencial.B).toBe(1) // a 1ª Essencial no pool dela
    expect(u.arcana.B).toBe(2) // Aturdir + a 2ª Essencial transbordada
  })
  it('alvo com colchetes (registro do Planejamento) também é reconhecido', async () => {
    const { poolsDoGasto } = await import('../src/rules/slots-magia')
    expect(poolsDoGasto('[[Essência Explosiva Adepta]]', null, ehEssencial)).toEqual(['anima'])
    expect(poolsDoGasto('[[Luz]]', 'Arcana Branca', ehEssencial)).toEqual(['essencial', 'arcana'])
  })
  it('a escola do catálogo consulta o próprio pool', () => {
    expect(poolsDaEscola('Anima')).toEqual(['anima'])
    expect(poolsDaEscola('ArcanaEssencial')).toEqual(['essencial', 'arcana'])
    expect(poolsDaEscola('Arcana Branca')).toEqual(['arcana'])
  })
})
