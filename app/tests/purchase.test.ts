// @vitest-environment jsdom
// COMPRA na loja (issue #72) — buyTreasure debita Ouro e adiciona o tesouro ao
// Inventario.Tesouros do herói, via API de store (herói LOCAL e da VAULT).
// Herói da vault: overlay do hero-store; herói local: FM da entidade.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buyTreasure, heroOuro } from '../src/data/purchase'
import {
  __resetHeroStoreMemoryForTests,
  getHeroEdits,
  writeHeroEdit,
} from '../src/data/hero-store'
import {
  __resetLocalStoreForTests,
  createLocalEntity,
  emptyHeroFrontmatter,
  getLocalDoc,
} from '../src/data/local-entities'
import type { VaultDoc } from '../src/data/types'

function makeStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    key: (i: number) => [...data.keys()][i] ?? null,
    removeItem: (k: string) => void data.delete(k),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
  }
}

beforeAll(() => {
  if (!window.localStorage) {
    Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true })
  }
})

beforeEach(() => {
  window.localStorage.clear()
  __resetHeroStoreMemoryForTests()
  __resetLocalStoreForTests()
})
afterEach(() => {
  __resetHeroStoreMemoryForTests()
  __resetLocalStoreForTests()
})

/** Doc de herói da vault (extraído) com Ouro inicial. */
function vaultHero(id: string, ouro: number): VaultDoc {
  return {
    id,
    path: id,
    basename: 'Herói',
    type: 'Criatura',
    subtype: 'Heroi',
    grupo: null,
    frontmatter: { Inventario: { Ouro: ouro, Tesouros: [] } },
    inlineFields: {},
    ruleElements: [],
    links: [],
    images: [],
    headings: [],
    body: '',
  }
}

describe('buyTreasure — herói da vault (overlay)', () => {
  it('debita o ouro e adiciona o tesouro no formato do plugin', () => {
    const doc = vaultHero('Sistema/Criaturas/Heróis/Teste', 100)
    const r = buyTreasure(doc.id, doc, 'Anel Canário', 'A', 40)
    expect(r.ok).toBe(true)
    expect(r.ouroRestante).toBe(60)

    const edits = getHeroEdits(doc.id).fm
    expect(edits['Inventario.Ouro']).toBe(60)
    expect(edits['Inventario.Tesouros']).toEqual(['[[Anel Canário|Anel Canário (Adepto)]]'])
    // heroOuro reflete o overlay mergeado
    expect(heroOuro(doc.id, doc)).toBe(60)
  })

  it('preço por tier (Experiente ×5) e append preservando tesouros existentes', () => {
    const doc = vaultHero('Sistema/Criaturas/Heróis/Teste', 500)
    // pré-existente no overlay
    writeHeroEdit(doc.id, 'fm', 'Inventario.Tesouros', ['[[Cinto|Cinto (Adepto)]]'], {
      channel: 'imediato',
      origem: 'teste',
    })
    const r = buyTreasure(doc.id, doc, 'Broche Artístico', 'E', 200)
    expect(r.ok).toBe(true)
    expect(r.ouroRestante).toBe(300)
    expect(getHeroEdits(doc.id).fm['Inventario.Tesouros']).toEqual([
      '[[Cinto|Cinto (Adepto)]]',
      '[[Broche Artístico|Broche Artístico (Experiente)]]',
    ])
  })

  it('ouro insuficiente → não escreve e sinaliza', () => {
    const doc = vaultHero('Sistema/Criaturas/Heróis/Pobre', 10)
    const r = buyTreasure(doc.id, doc, 'Anel Canário', 'A', 40)
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('ouro-insuficiente')
    expect(r.ouroRestante).toBe(10)
    expect(getHeroEdits(doc.id).fm['Inventario.Ouro']).toBeUndefined()
    expect(getHeroEdits(doc.id).fm['Inventario.Tesouros']).toBeUndefined()
  })
})

describe('buyTreasure — herói LOCAL (FM da entidade)', () => {
  it('debita e adiciona direto no FM local', () => {
    const fm = emptyHeroFrontmatter()
    ;(fm.Inventario as Record<string, unknown>).Ouro = 80
    const id = createLocalEntity('Heroi', 'Local', fm)
    const r = buyTreasure(id, getLocalDoc(id), 'Botas Fluídicas', 'A', 40)
    expect(r.ok).toBe(true)
    expect(r.ouroRestante).toBe(40)
    const inv = (getLocalDoc(id)!.frontmatter.Inventario ?? {}) as Record<string, unknown>
    expect(inv.Ouro).toBe(40)
    expect(inv.Tesouros).toEqual(['[[Botas Fluídicas|Botas Fluídicas (Adepto)]]'])
  })
})
