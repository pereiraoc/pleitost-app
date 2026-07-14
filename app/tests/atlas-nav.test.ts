// Navegação do Atlas (#250, F6): breadcrumb (subir Geolocalização) + filhos.
import { describe, expect, it } from 'vitest'
import {
  wikiTarget,
  geoParentId,
  ancestorChain,
  buildAtlasIndex,
} from '../src/data/atlas-nav'
import type { Catalog } from '../src/data/catalog'
import type { VaultDoc } from '../src/data/types'

describe('atlas-nav (#250, F6)', () => {
  it('wikiTarget extrai o alvo de [[...]]', () => {
    expect(wikiTarget('[[Campos do Provento]]')).toBe('Campos do Provento')
    expect(wikiTarget('[[A/B|C]]')).toBe('A/B')
    expect(wikiTarget('[[X#h]]')).toBe('X')
    expect(wikiTarget('texto simples')).toBeNull()
    expect(wikiTarget(null)).toBeNull()
  })

  it('ancestorChain sobe raiz→atual e corta ciclos', () => {
    const parentOf = new Map([
      ['c', 'b'],
      ['b', 'a'],
    ])
    expect(ancestorChain('c', parentOf, (id) => id).map((n) => n.id)).toEqual(['a', 'b', 'c'])
    const cyc = new Map([
      ['x', 'y'],
      ['y', 'x'],
    ])
    expect(ancestorChain('x', cyc, (id) => id).length).toBe(2) // sem loop infinito
  })

  it('geoParentId resolve pelo catálogo; buildAtlasIndex monta parent/children', () => {
    const catalog = {
      resolve: (t: string) => (t === 'Campos' ? { kind: 'doc', id: 'Campos' } : { kind: 'missing' }),
    } as unknown as Catalog
    const forteN = { id: 'ForteN', frontmatter: { 'Geolocalização': '[[Campos]]' } } as unknown as VaultDoc
    const forteS = { id: 'ForteS', frontmatter: { 'Geolocalização': '[[Campos]]' } } as unknown as VaultDoc
    const orfao = { id: 'Orfao', frontmatter: {} } as unknown as VaultDoc

    expect(geoParentId(forteN, catalog)).toBe('Campos')
    expect(geoParentId(orfao, catalog)).toBeNull()

    const { parentOf, childrenOf } = buildAtlasIndex([forteN, forteS, orfao], catalog)
    expect(parentOf.get('ForteN')).toBe('Campos')
    expect(childrenOf.get('Campos')).toEqual(['ForteN', 'ForteS'])
    expect(parentOf.has('Orfao')).toBe(false)
  })
})
