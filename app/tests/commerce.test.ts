// COMÉRCIO (issue #72) — lógica PURA da loja: parse da tabela de
// disponibilidade REAL da nota da vault, matriz de %, e rolagem determinística
// com RNG injetado. Sem React/localStorage (esses vivem no teste de UI).
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_MATRIX,
  parseCell,
  parseDisponibilidadePronta,
  resolveResourceItems,
  rollQuantity,
  rollShop,
  type AvailabilityMatrix,
  type ResourceItem,
} from '../src/data/commerce'
import type { VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const readDoc = (id: string): VaultDoc =>
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8')) as VaultDoc

const notaDisponibilidade = readDoc('Contexto/Histórias/Contexto Atual/Disponibilidade de Tesouros')

/** RNG determinístico: percorre uma lista de valores em [0,1). */
function seqRng(values: number[]): () => number {
  let i = 0
  return () => values[i++ % values.length]
}

describe('parse da tabela Disponibilidade Pronta (nota real da vault)', () => {
  it('parseCell: %, — e asterisco de rodapé', () => {
    expect(parseCell('33%')).toBe(33)
    expect(parseCell('  100%  ')).toBe(100)
    expect(parseCell('2%*')).toBe(2)
    expect(parseCell('5%*')).toBe(5)
    expect(parseCell('—')).toBeNull()
    expect(parseCell('')).toBeNull()
  })

  it('parseia o body real da nota na matriz exata da tabela', () => {
    const m = parseDisponibilidadePronta(notaDisponibilidade.body)
    expect(m).not.toBeNull()
    // valores VERBATIM da tabela "Disponibilidade Pronta" da nota
    expect(m!['Pequena Cidade']).toEqual({ A: 33, E: null, M: null })
    expect(m!['Grande Cidade']).toEqual({ A: 50, E: 10, M: null })
    expect(m!['Capital']).toEqual({ A: 100, E: 25, M: 2 })
    expect(m!['Iluminada']).toEqual({ A: 150, E: 50, M: 5 })
  })

  it('DEFAULT_MATRIX espelha exatamente o parse da nota', () => {
    expect(parseDisponibilidadePronta(notaDisponibilidade.body)).toEqual(DEFAULT_MATRIX)
  })

  it('body sem a seção → null (caller cai no default)', () => {
    expect(parseDisponibilidadePronta('# Nada aqui\n\ntexto solto')).toBeNull()
  })
})

describe('rollQuantity — parte inteira garantida + excedente pela fração', () => {
  it('null/0% → 0 sempre', () => {
    expect(rollQuantity(null, () => 0)).toBe(0)
    expect(rollQuantity(0, () => 0)).toBe(0)
  })
  it('33%: 1 se rng < 0.33, senão 0', () => {
    expect(rollQuantity(33, () => 0.2)).toBe(1)
    expect(rollQuantity(33, () => 0.5)).toBe(0)
  })
  it('100% → 1 (fração 0, sem excedente)', () => {
    expect(rollQuantity(100, () => 0.99)).toBe(1)
  })
  it('150%: 1 garantido + 2º com 50%', () => {
    expect(rollQuantity(150, () => 0.4)).toBe(2)
    expect(rollQuantity(150, () => 0.6)).toBe(1)
  })
  it('200% → 2 (fração 0)', () => {
    expect(rollQuantity(200, () => 0.99)).toBe(2)
  })
})

describe('resolveResourceItems — só tesouros da vault entram na loja', () => {
  it('filtra Armas base e strings simples; mantém Tesouros com preço', () => {
    const anel = readDoc(
      'Sistema/Equipamento/Tesouros/Equipamentos/Equipamentos de Perícia/Anel Canário',
    )
    const adaga = readDoc('Sistema/Equipamento/Armas/Armas Simples/Corpo-a-Corpo Simples/Adaga')
    const byName: Record<string, VaultDoc> = { 'Anel Canário': anel, Adaga: adaga }
    const items = resolveResourceItems(
      ['[[Anel Canário]]', '[[Adaga]]', 'Gado'],
      (t) => byName[t],
    )
    expect(items.map((i) => i.nome)).toEqual(['Anel Canário'])
    expect(items[0].precoBase).toBe(40) // preço:: 40 PO do doc real
  })
})

describe('rollShop — rolagem determinística por tier suportado', () => {
  const item = (nome: string, preco: number): ResourceItem => ({
    target: nome,
    label: nome,
    nome,
    doc: undefined,
    precoBase: preco,
  })

  it('Pequena Cidade: só Adepto rola (E/M null → nunca)', () => {
    const items = [item('Anel', 40)]
    // rng 0.1 < 0.33 → 1 Adepto; tiers E/M são null (não rolam)
    const shop = rollShop(items, 'Pequena Cidade', DEFAULT_MATRIX, seqRng([0.1]))
    expect(shop).toHaveLength(1)
    expect(shop[0]).toMatchObject({ nome: 'Anel', tier: 'A', quantidade: 1, preco: 40 })
  })

  it('Capital: Adepto sempre (100%), Experiente e Mestre pela sorte; preço por tier', () => {
    const items = [item('Anel', 40)]
    // ordem de consumo do rng: A (100% ignora rng mas consome 1), E (25%), M (2%)
    // A: floor(1)=1 garantido → rng consumido (0.9), qtd 1
    // E: 0.1 < 0.25 → 1 ; M: 0.5 ≥ 0.02 → 0
    const shop = rollShop(items, 'Capital', DEFAULT_MATRIX, seqRng([0.9, 0.1, 0.5]))
    const tiers = shop.map((e) => `${e.tier}:${e.quantidade}:${e.preco}`)
    expect(tiers).toContain('A:1:40') // 40 × 1
    expect(tiers).toContain('E:1:200') // 40 × 5 (Experiente)
    expect(tiers.find((t) => t.startsWith('M'))).toBeUndefined()
  })

  it('override do GM zera um tier → aquele tier não aparece', () => {
    const custom: AvailabilityMatrix = {
      ...DEFAULT_MATRIX,
      Capital: { A: null, E: null, M: null },
    }
    const shop = rollShop([item('Anel', 40)], 'Capital', custom, seqRng([0.0, 0.0, 0.0]))
    expect(shop).toHaveLength(0)
  })
})
