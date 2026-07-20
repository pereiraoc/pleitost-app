// @vitest-environment node
// #336: núcleo do inventário do grupo — valor (PO) e mapeamento pra FM ao puxar.
import { describe, expect, it } from 'vitest'
import { itemValorPO, pullItemToFm, normalizeGroupItem } from '../src/grupo/inventario-item'
import { buildTesouroAlias } from '../src/components/ficha/hero-model'
import type { GroupInventoryItem } from '../src/data/session-repo/contract'

const COMMON = { addedBy: 'gm', addedAt: '2026-01-01T00:00:00Z' }

// preços-base fake por basename (o que precoPO devolveria)
const priceOf = (b: string): number =>
  (({
    'Chama Voraz': 20,
    'Arma Obra-prima': 10,
    'Armadura Obra-prima': 12,
    'Broquel Obra-prima': 8,
    'Escudo Obra-prima': 8,
    'Poção de Cura': 5,
  }) as Record<string, number>)[b] ?? 0

describe('#336 itemValorPO', () => {
  it('ouro = a própria quantidade', () => {
    expect(itemValorPO({ kind: 'ouro', qtd: 50, ...COMMON }, priceOf)).toBe(50)
  })
  it('arma com imbuição × tier', () => {
    expect(
      itemValorPO({ kind: 'arma', nome: 'Espada', propriedadeBase: 'Chama Voraz', tier: 'E', ...COMMON }, priceOf),
    ).toBe(100) // 20 × 5
  })
  it('arma só com tier → obra-prima automática', () => {
    expect(itemValorPO({ kind: 'arma', nome: 'Espada', tier: 'A', ...COMMON }, priceOf)).toBe(10) // 10 × 1
  })
  it('arma-base (sem propriedade nem tier) → 0', () => {
    expect(itemValorPO({ kind: 'arma', nome: 'Espada', ...COMMON }, priceOf)).toBe(0)
  })
  it('armadura com tier = preço obra-prima × mult', () => {
    expect(itemValorPO({ kind: 'armadura', nome: 'Armadura Leve', tier: 'E', ...COMMON }, priceOf)).toBe(60) // 12 × 5
  })
  it('armadura sem tier → 0', () => {
    expect(itemValorPO({ kind: 'armadura', nome: 'Armadura Leve', ...COMMON }, priceOf)).toBe(0)
  })
  it('escudo Broquel usa a obra-prima do broquel', () => {
    expect(itemValorPO({ kind: 'escudo', nome: 'Broquel', tier: 'A', ...COMMON }, priceOf)).toBe(8)
  })
  it('tesouro = preço doc × mult(tier)', () => {
    expect(
      itemValorPO({ kind: 'tesouro', docId: 'x', nome: 'Poção de Cura', tier: 'M', ...COMMON }, priceOf),
    ).toBe(125) // 5 × 25
  })
  it('item LEGADO (sem kind) é tratado como tesouro', () => {
    const legacy = { docId: 'x', nome: 'Poção de Cura', tier: 'A', ...COMMON } as unknown as GroupInventoryItem
    expect(normalizeGroupItem(legacy).kind).toBe('tesouro')
    expect(itemValorPO(legacy, priceOf)).toBe(5)
  })
})

describe('#336 pullItemToFm', () => {
  it('ouro soma em Inventario.Ouro', () => {
    const w = pullItemToFm({ kind: 'ouro', qtd: 30, ...COMMON }, { Inventario: { Ouro: 10 } }, {})
    expect(w).toEqual([{ path: 'Inventario.Ouro', value: 40 }])
  })
  it('arma vai pra Armas.Lista com Nome/Categoria/Propriedade', () => {
    const w = pullItemToFm(
      { kind: 'arma', nome: 'Espada', grupo: 'd-marcial', tier: 'A', propriedadeBase: 'Chama Voraz', ...COMMON },
      {},
      { FOR: 2, AGI: 3 },
    )
    expect(w).toHaveLength(1)
    expect(w[0]!.path).toBe('Inventario.Armas.Lista')
    const row = (w[0]!.value as Record<string, unknown>[])[0]!
    expect(row.Nome).toBe('[[Espada]]')
    expect(String(row.Categoria)).toContain('Adepto')
    expect(row.Propriedade).toBe('[[Chama Voraz]]')
  })
  it('armadura em slot VAZIO equipa (Inventario.Armadura)', () => {
    const w = pullItemToFm({ kind: 'armadura', nome: 'Armadura Leve', tier: 'E', ...COMMON }, {}, {})
    expect(w).toHaveLength(1)
    expect(w[0]!.path).toBe('Inventario.Armadura')
    const row = w[0]!.value as Record<string, unknown>
    expect(row.Nome).toBe('[[Armadura Leve]]')
    expect(String(row.Categoria)).toContain('Experiente')
  })
  it('armadura com slot OCUPADO cai na bag (Tesouros), não sobrescreve', () => {
    const w = pullItemToFm(
      { kind: 'armadura', nome: 'Armadura Leve', tier: 'E', ...COMMON },
      { Inventario: { Armadura: { Nome: '[[Armadura Pesada]]' } } },
      {},
    )
    expect(w[0]!.path).toBe('Inventario.Tesouros')
    expect(String((w[0]!.value as unknown[])[0])).toContain('Armadura Leve')
  })
  it('escudo em slot vazio equipa com Dureza', () => {
    const w = pullItemToFm({ kind: 'escudo', nome: 'Broquel', tier: 'A', dureza: 2, ...COMMON }, {}, {})
    expect(w[0]!.path).toBe('Inventario.Escudo')
    expect((w[0]!.value as Record<string, unknown>).Dureza).toBe(2)
  })
  it('tesouro entra em Inventario.Tesouros como alias com tier', () => {
    const w = pullItemToFm({ kind: 'tesouro', docId: 'x', nome: 'Poção de Cura', tier: 'M', ...COMMON }, {}, {})
    expect(w[0]!.path).toBe('Inventario.Tesouros')
    expect((w[0]!.value as unknown[])[0]).toBe(buildTesouroAlias('Poção de Cura', 'M'))
  })
})
