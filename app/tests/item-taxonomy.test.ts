// TAXONOMIA DE ITENS (#267) sobre docs REAIS da vault. Cobre a derivação de
// categoria/grupo/subgrupo/qualidade por path+FM+basename e o agrupamento
// hierárquico (contagem por grupo, ordem crescente das armas naturais).
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { subtreeDocs } from '../src/components/compendium/sections'
import {
  itemFacet,
  itemCategoria,
  armaNaturalTipo,
  categoriaTemQualidade,
  groupItems,
  CATEGORIA_ORDER,
  ARMA_GRUPO_ORDER,
} from '../src/components/compendium/item-taxonomy'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)
const readDoc = (id: string): VaultDoc =>
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8')) as VaultDoc
const byName = (name: string): VaultDoc => {
  const r = catalog.resolve(name)
  if (r.kind !== 'doc') throw new Error(`não resolveu: ${name}`)
  return readDoc(r.id)
}

const ARMAS_FOLDER = 'Sistema/Equipamento/Armas'
const IMB_FOLDER = 'Sistema/Equipamento/Tesouros/Imbuições e Qualidade'
const CONSUMIVEIS_FOLDER = 'Sistema/Equipamento/Tesouros/Consumíveis'

/** Todos os Items da subárvore de uma pasta (como o FolderView passa à grade). */
function subtree(folderPath: string): VaultDoc[] {
  const node = catalog.folderByPath.get(folderPath)!
  return subtreeDocs(node)
    .filter((e) => e.type === 'Item')
    .map((e) => readDoc(e.id))
}

describe('itemCategoria — categoria pelo PATH do doc', () => {
  it('classifica cada família pela subpasta (fonte de verdade)', () => {
    expect(itemCategoria(byName('Adaga'))).toBe('arma')
    expect(itemCategoria(byName('Escudo'))).toBe('escudo')
    expect(itemCategoria(byName('Poção de Cura'))).toBe('consumivel')
    expect(itemCategoria(byName('Imbuição Flamejante'))).toBe('imbuicao')
    expect(itemCategoria(byName('Arma Obra-prima'))).toBe('qualidade')
    expect(itemCategoria(byName('Bracelete Elemental'))).toBe('equipamento')
    expect(itemCategoria(byName('Foco da Penetração'))).toBe('implemento')
  })
})

describe('itemFacet — armas (6.1)', () => {
  it('deriva grupo do FM (cac-simples/…/natural)', () => {
    expect(itemFacet(byName('Adaga')).grupo).toBe('cac-simples')
    expect(itemFacet(byName('Espada Longa')).grupo).toBe('cac-marcial')
    expect(itemFacet(byName('Garra de Tigre')).grupo).toBe('especial')
    expect(itemFacet(byName('Garras')).grupo).toBe('natural')
  })
  it('armas naturais ganham subgrupo pelo tipo (raiz do basename)', () => {
    expect(armaNaturalTipo(byName('Garras Colossais'))).toBe('Garras')
    expect(armaNaturalTipo(byName('Cauda Enorme'))).toBe('Cauda')
    expect(itemFacet(byName('Presas Letais')).subgrupo).toBe('Presas')
  })
  it('armas não têm qualidade comprada (categoria não-tesouro)', () => {
    expect(categoriaTemQualidade('arma')).toBe(false)
    expect(categoriaTemQualidade('escudo')).toBe(false)
  })
})

describe('itemFacet — tesouros por tipo (6.2/6.3/6.4)', () => {
  it('consumível: grupo pelo TIPO de poção (basename), Cura ≠ Nutrição (#268)', () => {
    // O #268 corrige o agrupamento: tipo_efeito juntava Cura e Nutrição (ambos
    // "Vitalidade"). O tipo REAL é o do nome (Poção da/de/do <Tipo>).
    expect(itemFacet(byName('Poção de Cura')).grupoLabel).toBe('Cura')
    expect(itemFacet(byName('Poção da Nutrição')).grupoLabel).toBe('Nutrição')
    expect(itemFacet(byName('Poção da Coragem')).grupoLabel).toBe('Coragem')
    expect(itemFacet(byName('Poção da Velocidade')).grupoLabel).toBe('Velocidade')
    // Cura e Nutrição são grupos DISTINTOS (o bug era juntá-los)
    expect(itemFacet(byName('Poção de Cura')).grupo).not.toBe(
      itemFacet(byName('Poção da Nutrição')).grupo,
    )
  })
  it('imbuição/equipamento: grupo pelo bonus_tipo (Ataque/Defesa/Perícia)', () => {
    expect(itemFacet(byName('Imbuição Flamejante')).grupoLabel).toBe('Ataque')
    expect(itemFacet(byName('Bracelete Elemental')).grupoLabel).toBe('Ataque')
    expect(itemFacet(byName('Colar da Eloquência')).grupoLabel).toBe('Perícia')
    // Equipamento de Defesa grava "resistência" no FM → rótulo "Defesa" (sinônimo)
    expect(itemFacet(byName('Anel da Resistência')).grupoLabel).toBe('Defesa')
  })
  it('família tesouro é comprada por qualidade (showTier)', () => {
    for (const cat of ['consumivel', 'imbuicao', 'qualidade', 'equipamento', 'implemento'] as const) {
      expect(categoriaTemQualidade(cat)).toBe(true)
    }
  })
})

describe('groupItems — contagem por grupo + ordem crescente', () => {
  it('Armas: 6 grupos, na ordem simples→…→natural; contagem por grupo bate', () => {
    const armas = subtree(ARMAS_FOLDER)
    const tree = groupItems(armas, (doc) => doc.basename)
    const armaCat = tree.find((c) => c.categoria === 'arma')!
    expect(armaCat).toBeTruthy()
    const grupos = armaCat.grupos.map((g) => g.grupo)
    // ordem canônica das armas (sem os grupos ausentes)
    const expectedOrder = ARMA_GRUPO_ORDER.filter((g) => grupos.includes(g))
    expect(grupos).toEqual(expectedOrder)
    // contagem por grupo (dados reais: 9 cac-simples, 18 cac-marcial, 25 natural…)
    const count = (g: string) =>
      armaCat.grupos.find((x) => x.grupo === g)?.subgrupos.reduce((s, sub) => s + sub.entries.length, 0) ?? 0
    expect(count('cac-simples')).toBe(9)
    expect(count('cac-marcial')).toBe(18)
    expect(count('d-simples')).toBe(5)
    expect(count('d-marcial')).toBe(4)
    expect(count('especial')).toBe(5)
    expect(count('natural')).toBe(25)
  })

  it('Armas naturais: subgrupos por tipo, cada um em ordem crescente (por FM ordem)', () => {
    const armas = subtree(ARMAS_FOLDER)
    const tree = groupItems(armas, (doc) => doc)
    const natural = tree.find((c) => c.categoria === 'arma')!.grupos.find((g) => g.grupo === 'natural')!
    // tipos de arma natural (Garras/Presas/Mandíbula/Chifres/Cauda)
    const tipos = natural.subgrupos.map((s) => s.subgrupo)
    expect(tipos).toContain('Garras')
    expect(tipos).toContain('Cauda')
    // Garras em ordem crescente de dano (ordem 11→15: Garras < Afiadas < Grandes …)
    const garras = natural.subgrupos.find((s) => s.subgrupo === 'Garras')!
    const names = garras.entries.map((d) => d.basename)
    expect(names[0]).toBe('Garras') // ordem 11 primeiro
    expect(names.indexOf('Garras Grandes')).toBeLessThan(names.indexOf('Garras Colossais'))
  })

  it('Consumíveis: 4 grupos distintos (Coragem/Nutrição/Velocidade/Cura), 1 por grupo (#268)', () => {
    const docs = subtree(CONSUMIVEIS_FOLDER)
    const tree = groupItems(docs, (doc) => doc.basename)
    const cons = tree.find((c) => c.categoria === 'consumivel')!
    expect(cons).toBeTruthy()
    const labels = cons.grupos.map((g) => g.grupoLabel).sort()
    expect(labels).toEqual(['Coragem', 'Cura', 'Nutrição', 'Velocidade'])
    // cada grupo tem exatamente 1 poção (Cura NÃO está junto de Nutrição)
    for (const g of cons.grupos) {
      const n = g.subgrupos.reduce((s, sub) => s + sub.entries.length, 0)
      expect(n).toBe(1)
    }
  })

  it('Imbuições e Qualidade: imbuições e qualidades (obra-prima) juntas na mesma folha (6.3)', () => {
    const docs = subtree(IMB_FOLDER)
    const tree = groupItems(docs, (doc) => doc.basename)
    const cats = tree.map((c) => c.categoria)
    expect(cats).toContain('imbuicao')
    expect(cats).toContain('qualidade')
    // as obra-primas estão na categoria 'qualidade'
    const qual = tree.find((c) => c.categoria === 'qualidade')!
    const nomes = qual.grupos.flatMap((g) => g.subgrupos.flatMap((s) => s.entries))
    expect(nomes).toContain('Arma Obra-prima')
    expect(nomes).toContain('Armadura Obra-prima')
  })

  it('categorias saem na CATEGORIA_ORDER canônica', () => {
    const docs = subtree(IMB_FOLDER)
    const tree = groupItems(docs, (doc) => doc.basename)
    const idx = tree.map((c) => CATEGORIA_ORDER.indexOf(c.categoria))
    const sorted = [...idx].sort((a, b) => a - b)
    expect(idx).toEqual(sorted)
  })
})
