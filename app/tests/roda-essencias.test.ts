// RODA DAS ESSÊNCIAS — regra de escolha do Animista pelo Ciclo Elemental
// (FM `Ciclo_Elemental` do hub; vizinhas = os "Requer [[X]] ou [[Y]]").
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import type { IndexManifest, VaultDoc } from '../src/data/types'
import {
  estadoRoda,
  elementoDaSintonia,
  opostoDe,
  parseEssencia,
  puraDe,
  rodaDoCatalogo,
  vizinhas,
  type RodaDef,
  type Tier,
} from '../src/rules/roda-essencias'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const dir = path.join(path.dirname(appDir), 'vault-data')
const catalog = buildCatalog(JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')) as IndexManifest)
const hub = JSON.parse(
  fs.readFileSync(path.join(dir, 'Sistema/Criação de Personagem/Habilidades/Essências Elementais/Essências Elementais.json'), 'utf8'),
) as VaultDoc
const roda = rodaDoCatalogo(catalog, hub.frontmatter) as RodaDef
const E = (n: string) => `Essência ${n}`
const tem = (a: string[], e: string[] = [], m: string[] = []): Record<Tier, Set<string>> => ({
  A: new Set(a.map(E)),
  E: new Set(e.map(E)),
  M: new Set(m.map(E)),
})

describe('a roda vem da vault', () => {
  it('12 essências, puras no meio de cada trio, Criação universal', () => {
    expect(roda.ordem).toHaveLength(12)
    expect([...roda.puras].sort()).toEqual([E('Flamejante'), E('Hidratante'), E('Mineral'), E('Ventania')])
    expect(roda.universais).toContain(E('de Criação'))
  })
  it('vizinhas batem com os "Requer" das notas', () => {
    for (const base of roda.ordem) {
      const nota = catalog.content.find((c) => (c.basename ?? '') === base)!
      const doc = JSON.parse(fs.readFileSync(path.join(dir, `${nota.id}.json`), 'utf8')) as VaultDoc
      const m = /Requer \[\[([^\]]+)\]\] ou \[\[([^\]]+)\]\]/.exec(doc.body)!
      expect(vizinhas(roda, base).sort()).toEqual([m[1], m[2]].sort())
    }
  })
  it('opostos: Fogo↔Água, Terra↔Vento', () => {
    expect(opostoDe(roda, 'Fogo')).toBe('Água')
    expect(opostoDe(roda, 'Terra')).toBe('Vento')
    expect(puraDe(roda, 'Vento')).toBe(E('Ventania'))
  })
  it('helpers de nome', () => {
    expect(elementoDaSintonia('[[Traço Elemental da Água]]')).toBe('Água')
    expect(parseEssencia('[[Essência Flamejante Experiente]]')).toEqual({ base: E('Flamejante'), tier: 'E' })
  })
})

describe('regras de escolha (Animista)', () => {
  it('sem nada: só a pura da sintonia (e a Criação) abre', () => {
    const s = estadoRoda({ roda, sintonia: 'Fogo', tem: tem([]), aplicaCiclo: true })
    const livres = Object.entries(s.no.A).filter(([, v]) => v === 'livre').map(([k]) => k).sort()
    expect(livres).toEqual([E('Flamejante'), E('de Criação')].sort())
    expect(s.no.A[E('Hidratante')]).toBe('oposto')
  })
  it('caminha de vizinha em vizinha', () => {
    const s = estadoRoda({ roda, sintonia: 'Fogo', tem: tem(['Flamejante', 'Explosiva']), aplicaCiclo: true })
    expect(s.no.A[E('Sísmica')]).toBe('livre')
    expect(s.no.A[E('Incendiária')]).toBe('livre')
    expect(s.no.A[E('Mineral')]).toBe('fechado')
  })
  it('Adepta solta (fora do caminho da pura) é sinalizada', () => {
    const s = estadoRoda({ roda, sintonia: 'Fogo', tem: tem(['Flamejante', 'Mineral']), aplicaCiclo: true })
    expect([...s.soltas]).toEqual([E('Mineral')])
  })
  it('Experiente: só de quem já tem, e a primeira é da sintonia', () => {
    const s = estadoRoda({ roda, sintonia: 'Fogo', tem: tem(['Flamejante', 'Explosiva', 'Sísmica']), aplicaCiclo: true })
    expect(s.no.E[E('Flamejante')]).toBe('livre')
    expect(s.no.E[E('Sísmica')]).toBe('fechado') // terra antes de uma de fogo
    expect(s.no.E[E('Mineral')]).toBe('fechado') // não tem a Adepta
    const s2 = estadoRoda({ roda, sintonia: 'Fogo', tem: tem(['Flamejante', 'Explosiva', 'Sísmica'], ['Flamejante']), aplicaCiclo: true })
    expect(s2.no.E[E('Sísmica')]).toBe('livre')
  })
  it('Mestre: só de quem tem a Experiente', () => {
    const s = estadoRoda({ roda, sintonia: 'Fogo', tem: tem(['Flamejante', 'Explosiva'], ['Flamejante', 'Explosiva']), aplicaCiclo: true })
    expect(s.no.M[E('Flamejante')]).toBe('livre')
    expect(s.no.M[E('Sísmica')]).toBe('fechado')
  })
  it('Druida (sem ciclo): só posse e opostos', () => {
    const s = estadoRoda({ roda, sintonia: 'Fogo', tem: tem([]), aplicaCiclo: false })
    expect(s.no.A[E('Mineral')]).toBe('livre')
    expect(s.no.A[E('Hidratante')]).toBe('oposto')
  })
})

describe('Mestre compostas (entre vizinhas)', () => {
  const docMestre = (n: string) => {
    const nota = catalog.content.find((c) => (c.basename ?? '') === n)!
    return JSON.parse(fs.readFileSync(path.join(dir, `${nota.id}.json`), 'utf8')) as VaultDoc
  }
  it('as 12 compostas da vault ligam duas VIZINHAS do ciclo', async () => {
    const { compostaDoDoc } = await import('../src/rules/roda-essencias')
    const nomes = catalog.content.filter((c) => c.path.includes('/Essências Mestre/')).map((c) => c.basename!)
    expect(nomes).toHaveLength(12)
    for (const n of nomes) {
      const c = compostaDoDoc(n, docMestre(n).frontmatter)!
      expect(c, n).toBeTruthy()
      expect(vizinhas(roda, c.a)).toContain(c.b)
    }
  })
  it('precisa das duas Experientes; a primeira toca a sintonia', async () => {
    const { compostaDoDoc, estadoCompostas } = await import('../src/rules/roda-essencias')
    const compostas = ['Essência do Meteoro', 'Essência do Magma', 'Essência do Terremoto'].map(
      (n) => compostaDoDoc(n, docMestre(n).frontmatter)!,
    )
    const st = (e: string[], m: string[] = []) =>
      estadoCompostas({ roda, compostas, sintonia: 'Fogo', temE: new Set(e.map(E)), temM: new Set(m) })
    expect(st(['Flamejante'])['Essência do Meteoro']).toBe('fechado')
    expect(st(['Flamejante', 'Explosiva'])['Essência do Meteoro']).toBe('livre')
    expect(st(['Explosiva', 'Sísmica', 'Mineral'])['Essência do Magma']).toBe('livre') // Explosiva é fogo
    expect(st(['Explosiva', 'Sísmica', 'Mineral'])['Essência do Terremoto']).toBe('fechado') // 1ª sem fogo
    expect(st(['Explosiva', 'Sísmica', 'Mineral'], ['Essência do Magma'])['Essência do Terremoto']).toBe('livre')
  })
})

describe('Druida: círculo de dois elementos', () => {
  it('Oceano (Água e Terra): interface de graça, qualquer essência dos dois elementos, resto fora', async () => {
    const { elementosDoCirculo, pontasDoElemento } = await import('../src/rules/roda-essencias')
    const opcoes = ['Congelante', 'Hidratante', 'Torrencial', 'Enraizante', 'Mineral', 'Sísmica'].map((n) => `[[Essência ${n} Adepta]]`)
    const els = elementosDoCirculo(roda, opcoes)!
    expect(els.sort()).toEqual(['Terra', 'Água'].sort())
    const s = estadoRoda({ roda, sintonia: 'Água', tem: tem(['Torrencial', 'Enraizante']), aplicaCiclo: true, elementos: els })
    expect(s.no.A[E('Sísmica')]).toBe('livre') // ponta da Terra, via corda Sísmica–Enraizante
    expect(s.no.A[E('Congelante')]).toBe('livre') // ponta da Água, via corda Congelante–Torrencial
    expect(s.no.A[E('Flamejante')]).toBe('oposto')
    expect(s.no.A[E('Ventania')]).toBe('oposto')
    expect(pontasDoElemento(roda, 'Terra')!.sort()).toEqual([E('Enraizante'), E('Sísmica')].sort())
  })
  it('Animista (três elementos nas opções) não é tratado como druida', async () => {
    const { elementosDoCirculo } = await import('../src/rules/roda-essencias')
    expect(elementosDoCirculo(roda, ['Flamejante', 'Sísmica', 'Ciclonal'].map((n) => `[[Essência ${n} Adepta]]`))).toBeNull()
  })
})
