// @vitest-environment node
// #299: comprar um combo arma×imbuição no comércio (ex. "Alabarda Relampejante")
// tem que virar uma ARMA em Inventario.Armas.Lista — antes buyTreasure jogava
// TUDO em Inventario.Tesouros. A linha da arma espelha o shape do addArma da
// ficha (Nome wikilink + Atributo derivado + Categoria do tier + Propriedade).
import { describe, expect, it } from 'vitest'
import { buildPurchasedWeaponRow } from '../src/data/purchase'
import { ARMA_OBRA_PRIMA } from '../src/components/ficha/hero-model'

const ATTR = { FOR: 3, AGI: 1, INT: 0, PRE: 0 }

describe('buildPurchasedWeaponRow (#299)', () => {
  it('combo arma×imbuição → Nome/Categoria/Propriedade corretos, Fonte Comércio', () => {
    const row = buildPurchasedWeaponRow(
      {
        armaBasename: 'Alabarda',
        grupo: 'cac-marcial',
        propriedades: '',
        tier: 'E',
        propriedadeBase: 'Imbuição Relampejante',
      },
      ATTR,
    )
    expect(row.Nome).toBe('[[Alabarda]]')
    expect(row.Propriedade).toBe('[[Imbuição Relampejante]]')
    expect(row.Fonte).toBe('Comércio')
    expect(row.Bonus_Item).toBe(0)
    expect(row.Bonus_Especial).toBe(0)
    // Categoria carrega o tier comprado (link do tier Experiente).
    expect(String(row.Categoria)).toContain('Experiente')
    // grupo cac-marcial sem "precisa" → FOR
    expect(row.Atributo).toBe('FOR')
  })

  it('combo obra-prima → Propriedade = ARMA_OBRA_PRIMA (não vira [[Arma Obra-prima]])', () => {
    const row = buildPurchasedWeaponRow(
      { armaBasename: 'Adaga', grupo: 'cac-simples', propriedades: 'Precisa', tier: 'A', propriedadeBase: 'Arma Obra-prima' },
      ATTR,
    )
    expect(row.Propriedade).toBe(ARMA_OBRA_PRIMA)
    // grupo cac-simples com "precisa" e FOR>AGI → FOR
    expect(row.Atributo).toBe('FOR')
  })

  it('arma-base sem imbuição → Propriedade vazia', () => {
    const row = buildPurchasedWeaponRow(
      { armaBasename: 'Arco Longo', grupo: 'd-marcial', propriedades: '', tier: 'A' },
      ATTR,
    )
    expect(row.Propriedade).toBe('')
    // d-marcial → AGI
    expect(row.Atributo).toBe('AGI')
  })
})
