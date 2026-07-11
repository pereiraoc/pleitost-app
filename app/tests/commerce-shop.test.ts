// COMÉRCIO — rollShop2 (issue #93): motor que rola PRONTA (estoque, quantidade)
// e ENCOMENDA (boolean, GM) sobre candidatos já classificados (tesouro/combo
// arma×imbuição) + poções (dados). Lógica PURA, RNG injetado.
import { describe, expect, it } from 'vitest'
import {
  rollShop2,
  DEFAULT_MATRIX,
  DEFAULT_ENCOMENDA_MATRIX,
  RARIDADE_MULT,
  comboMult,
  type ShopCandidate,
  type PocaoCandidate,
} from '../src/data/commerce'

const T3 = ['A', 'E', 'M'] as const

const tesouro = (nome: string, mult: number, preco = 40): ShopCandidate => ({
  key: nome,
  nome,
  label: nome,
  precoBase: preco,
  mult,
  tiers: [...T3],
})

describe('rollShop2 — pronta (estoque) + encomenda (boolean)', () => {
  it('típico numa Capital: Adepto 100% enche o estoque (4); preço por tier', () => {
    const cands = [tesouro('Anel Canário', RARIDADE_MULT['tipico'], 40)]
    // rng 0.99: pronta A=100%×1 → 4; E=25% → 0; M=2% → 0. encomenda A=150→cap→sim.
    const shop = rollShop2(cands, [], 'Capital', DEFAULT_MATRIX, DEFAULT_ENCOMENDA_MATRIX, () => 0.99)
    const a = shop.pronta.find((e) => e.tier === 'A')!
    expect(a).toMatchObject({ nome: 'Anel Canário', quantidade: 4, preco: 40 })
    // sem estoque Experiente/Mestre com rng alto
    expect(shop.pronta.some((e) => e.tier === 'E')).toBe(false)
    // encomenda lista Adepto disponível (150% ≥ 100 → sempre)
    expect(shop.encomenda.some((e) => e.tier === 'A')).toBe(true)
  })

  it('célula "—" (null) nunca oferece aquele tier', () => {
    const cands = [tesouro('Anel', RARIDADE_MULT['tipico'])]
    // Pequena Cidade: E/M são null → nem pronta nem encomenda nesses tiers
    const shop = rollShop2(cands, [], 'Pequena Cidade', DEFAULT_MATRIX, DEFAULT_ENCOMENDA_MATRIX, () => 0)
    expect(shop.pronta.every((e) => e.tier === 'A')).toBe(true)
    expect(shop.encomenda.every((e) => e.tier === 'A')).toBe(true)
  })

  it('incomum (×¼): raro na pronta, mas some via encomenda com sorte', () => {
    const cands = [tesouro('Item Raro', RARIDADE_MULT['incomum'])]
    // Capital Adepto pronta 100×0.25=25% ; encomenda 150×0.25=37.5%
    // rng 0.99 → pronta 0, encomenda 0
    const alto = rollShop2(cands, [], 'Capital', DEFAULT_MATRIX, DEFAULT_ENCOMENDA_MATRIX, () => 0.99)
    expect(alto.pronta).toHaveLength(0)
    expect(alto.encomenda).toHaveLength(0)
    // rng 0.1 → pronta A: 0.1<0.25 sai 1, 0.1<0.25 sai 2... até 4; encomenda sim
    const baixo = rollShop2(cands, [], 'Capital', DEFAULT_MATRIX, DEFAULT_ENCOMENDA_MATRIX, () => 0.1)
    expect(baixo.pronta.find((e) => e.tier === 'A')!.quantidade).toBe(4)
    expect(baixo.encomenda.some((e) => e.tier === 'A')).toBe(true)
  })

  it('combo arma×imbuição carrega metadados p/ UI (armaTarget, propriedadeBase)', () => {
    const combo: ShopCandidate = {
      key: 'Adaga|Imbuição Relampejante',
      nome: 'Adaga Relampejante',
      label: 'Adaga Relampejante',
      precoBase: 60,
      mult: comboMult(true, true),
      tiers: [...T3],
      armaTarget: 'Sistema/Equipamento/Armas/Armas Simples/Corpo-a-Corpo Simples/Adaga',
      propriedadeBase: 'Relampejante',
    }
    const shop = rollShop2([combo], [], 'Capital', DEFAULT_MATRIX, DEFAULT_ENCOMENDA_MATRIX, () => 0)
    const a = shop.pronta.find((e) => e.tier === 'A')!
    expect(a.label).toBe('Adaga Relampejante')
    expect(a.armaTarget).toContain('Adaga')
    expect(a.propriedadeBase).toBe('Relampejante')
    expect(a.preco).toBe(60) // Adepto ×1
  })

  it('poções rolam por dados (não pela matriz), só pronta', () => {
    const pocao: PocaoCandidate = {
      key: 'Poção de Cura',
      nome: 'Poção de Cura',
      label: 'Poção de Cura',
      precoBase: 10,
      tiers: [...T3],
    }
    // Capital A=2d10-1: rng 0 → 1 poção; preço 10 (Adepto ×1)
    const shop = rollShop2([], [pocao], 'Capital', DEFAULT_MATRIX, DEFAULT_ENCOMENDA_MATRIX, () => 0)
    const a = shop.pronta.find((e) => e.tier === 'A')!
    expect(a).toMatchObject({ nome: 'Poção de Cura', quantidade: 1, preco: 10 })
    // poção não entra na encomenda
    expect(shop.encomenda).toHaveLength(0)
  })
})
