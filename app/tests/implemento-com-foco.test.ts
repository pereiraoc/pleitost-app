// IMPLEMENTO COM FOCO (vault 2026-10-21): o foco é trabalhado num implemento
// fundamental na fabricação, como imbuição em arma. Linha própria em
// `Inventario.Implementos` { Nome: fundamental, Propriedade: foco, Categoria:
// tier } — o motor aplica as regras do fundamental NO TIER da linha, e os
// leitores de tesouro enxergam o combo pelo alias do foco.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import type { IndexManifest, VaultDoc } from '../src/data/types'
import { projectHeroRules } from '../src/rules/useHeroRules'
import { emptyHeroFrontmatter } from '../src/data/local-entities'
import {
  aliasDoImplemento,
  implementosDe,
  linhaImplemento,
  rotuloImplemento,
  tesourosComImplementos,
} from '../src/data/implementos'
import { parseItemAlias } from '../src/components/ficha/hero-model'
import { buildShopCandidates } from '../src/data/commerce-candidates'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const dir = path.join(path.dirname(appDir), 'vault-data')
const catalog = buildCatalog(JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')) as IndexManifest)
const load = async (id: string): Promise<VaultDoc> =>
  JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), 'utf8')) as VaultDoc

const comBroche = (tier: 'A' | 'E' | 'M') => ({
  ...emptyHeroFrontmatter(),
  Classe: '[[Bardo]]',
  Atributos: { Principal: 'PRE', FOR: 0, AGI: 2, INT: 1, PRE: 3 },
  Inventario: {
    ...((emptyHeroFrontmatter() as Record<string, unknown>)['Inventario'] as Record<string, unknown>),
    Implementos: [linhaImplemento('Broche Artístico', 'Foco da Repetição', tier)],
  },
})

describe('linha de implemento', () => {
  it('rótulo e alias do combo', () => {
    expect(rotuloImplemento('Broche Artístico', 'Foco da Repetição')).toBe('Broche Artístico da Repetição')
    const fm = comBroche('M')
    const [l] = implementosDe(fm)
    expect(l).toMatchObject({ nome: 'Broche Artístico', foco: 'Foco da Repetição', tier: 'M' })
    expect(aliasDoImplemento(l!)).toBe('[[Foco da Repetição|Broche Artístico da Repetição (Mestre)]]')
    const alias = tesourosComImplementos(fm).at(-1)
    expect(parseItemAlias(alias)).toMatchObject({ nome: 'Broche Artístico da Repetição', tier: 'M' })
  })
})

describe('motor de regras', () => {
  it('o fundamental vale no tier da linha (Broche Mestre = +3 nas Arcanas)', async () => {
    const { projection } = await projectHeroRules(comBroche('M'), catalog, load)
    const escolas = (projection.derivedFm['Magias'] as { Lista: Record<string, unknown>[] }).Lista
    const negra = escolas.find((e) => e['Nome'] === 'Arcana Negra')
    expect(Number(negra?.['Bonus_Item'])).toBe(3)
  })
  it('Adepto dá +1', async () => {
    const { projection } = await projectHeroRules(comBroche('A'), catalog, load)
    const escolas = (projection.derivedFm['Magias'] as { Lista: Record<string, unknown>[] }).Lista
    expect(Number(escolas.find((e) => e['Nome'] === 'Arcana Negra')?.['Bonus_Item'])).toBe(1)
  })
})

describe('loja: implemento × foco', () => {
  const byName = (name: string): VaultDoc => {
    const r = catalog.resolve(name)
    if (r.kind !== 'doc') throw new Error(name)
    return JSON.parse(fs.readFileSync(path.join(dir, `${r.id}.json`), 'utf8')) as VaultDoc
  }
  const fundamentais = ['Luva do Arcanista', 'Bracelete Elemental', 'Broche Artístico'].map(byName)
  const focos = ['Foco da Consistência', 'Foco da Intensificação', 'Foco da Penetração', 'Foco da Repetição'].map(byName)
  const built = buildShopCandidates({
    recursos: ['[[Broche Artístico]]', '[[Foco da Repetição]]'],
    tesourosSimples: [...fundamentais, ...focos],
    imbuicoes: [],
    armas: [],
    armaduras: [],
    escudos: [],
    qualidades: [],
    pocoes: [],
  })
  it('12 combos (3 implementos × 4 focos) e nenhum foco avulso', () => {
    const combos = built.candidates.filter((c) => c.implTarget)
    expect(combos).toHaveLength(12)
    expect(built.candidates.some((c) => /Foco da/.test(c.label) && !c.implTarget)).toBe(false)
    // os implementos seguem à venda sozinhos (básicos)
    expect(built.candidates.some((c) => c.label === 'Broche Artístico' && !c.implTarget)).toBe(true)
  })
  it('"Broche Artístico da Repetição": preço do foco (inclui a base), tiers A/E/M, típico×típico', () => {
    const c = built.candidates.find((x) => x.label === 'Broche Artístico da Repetição')!
    expect(c).toBeTruthy()
    expect(c.precoBase).toBe(75)
    expect(c.tiers).toEqual(['A', 'E', 'M'])
    expect(c.mult).toBe(1) // implemento típico + foco típico
    expect(c.thumbBasename).toBe('Broche Artístico')
    const inc = built.candidates.find((x) => x.label === 'Luva do Arcanista da Consistência')!
    expect(inc.mult).toBeLessThan(1) // implemento e foco incomuns
  })
})

describe('compra de implemento', () => {
  it('buyImplemento debita e grava a linha em Inventario.Implementos', async () => {
    const store = await import('../src/data/local-entities')
    const { buyImplemento } = await import('../src/data/purchase')
    const id = store.createLocalEntity('Heroi', 'Comprador', {
      ...emptyHeroFrontmatter(),
      Inventario: {
        ...((emptyHeroFrontmatter() as Record<string, unknown>)['Inventario'] as Record<string, unknown>),
        Ouro: 2000,
      },
    })
    const r = buyImplemento(id, undefined, { nome: 'Broche Artístico', foco: 'Foco da Repetição', tier: 'M' }, 1875)
    expect(r).toMatchObject({ ok: true, ouroRestante: 125 })
    const inv = store.getLocalDoc(id)!.frontmatter['Inventario'] as Record<string, unknown>
    expect(inv['Implementos']).toEqual([
      { Nome: '[[Broche Artístico]]', Propriedade: '[[Foco da Repetição]]', Categoria: '[[Mestre]]', Fonte: 'Comércio' },
    ])
    expect(buyImplemento(id, undefined, { nome: 'Luva do Arcanista', foco: null, tier: 'A' }, 999)).toMatchObject({ ok: false })
  })
})
