// @vitest-environment node
// #467: Encantar Arma (magia da SEGUNDA classe) não oferecia o toggle — a
// coleta de Efeitos_Interativos (collectEffectTargets) andava só por
// Magias.Lista e pulava Magias.Secundaria.Lista (mesma classe do gap #328,
// freeMagiaSlot). Os refs (useHeroRefs:53) já carregavam o doc; só a coleta
// ficava cega.
import { describe, expect, it } from 'vitest'
import { collectEffectTargets } from '../src/interativa/hero-context'

describe('#467 — efeitos de magia da classe secundária', () => {
  it('Magias.Secundaria.Lista entra nos alvos de coleta', () => {
    const fm = {
      Magias: {
        Lista: [{ Escola: 'Anima', Lista: [{ '[[Toque Elemental]]': 'Slot.B' }] }],
        Secundaria: {
          Lista: [{ Escola: 'Branca', Lista: [{ '[[Encantar Arma]]': 'Slot.A' }] }],
        },
      },
    }
    const targets = collectEffectTargets(fm)
    expect(targets).toContain('Toque Elemental')
    expect(targets).toContain('Encantar Arma')
  })
})
