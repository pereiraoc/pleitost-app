// @vitest-environment node
// Feedback: comprar POÇÃO vai pros Consumíveis (soma quantidade), e comprar
// ARMADURA/ESCUDO obra-prima EQUIPA a peça no slot (Nome base + tier + obra-prima
// da peça), em vez de tudo cair nos Tesouros.
import { describe, expect, it } from 'vitest'
import { incrementConsumivel, buildEquippedGear } from '../src/data/purchase'
import { ARMADURA_OBRA_PRIMA } from '../src/components/ficha/hero-model'

describe('incrementConsumivel (poção → Consumíveis)', () => {
  it('adiciona novo com (x1)', () => {
    const out = incrementConsumivel([], 'Poção de Cura', 'A')
    expect(out).toEqual(['[[Poção de Cura|Poção de Cura (Adepto) (x1)]]'])
  })

  it('soma +1 na quantidade do mesmo nome+tier', () => {
    const out = incrementConsumivel(['[[Poção de Cura|Poção de Cura (Adepto) (x2)]]'], 'Poção de Cura', 'A')
    expect(out).toEqual(['[[Poção de Cura|Poção de Cura (Adepto) (x3)]]'])
  })

  it('tier diferente = entrada separada', () => {
    const out = incrementConsumivel(['[[Poção de Cura|Poção de Cura (Adepto) (x1)]]'], 'Poção de Cura', 'E')
    expect(out.length).toBe(2)
  })
})

describe('buildEquippedGear (armadura/escudo equipável)', () => {
  it('armadura: Nome base + Categoria do tier + Obra-prima da armadura', () => {
    const g = buildEquippedGear('Armadura', 'Armadura Leve', 'E')
    expect(g.Nome).toBe('[[Armadura Leve]]')
    expect(g.Propriedade).toBe(ARMADURA_OBRA_PRIMA)
    expect(String(g.Categoria)).toContain('Experiente')
    expect('Dureza' in g).toBe(false) // armadura não tem Dureza
  })

  it('escudo/broquel: obra-prima do escudo + Dureza', () => {
    const g = buildEquippedGear('Escudo', 'Broquel', 'A', 5)
    expect(g.Nome).toBe('[[Broquel]]')
    expect(String(g.Propriedade)).toContain('Broquel Obra-prima')
    expect(g.Dureza).toBe(5)
  })
})
