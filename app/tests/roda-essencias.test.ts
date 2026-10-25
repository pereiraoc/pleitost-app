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
    expect(roda.universais).toContain(E('de Destruição'))
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
  it('sem nada: só a pura da sintonia (e as universais, Criação e Destruição) abre', () => {
    const s = estadoRoda({ roda, sintonia: 'Fogo', tem: tem([]) })
    const livres = Object.entries(s.no.A).filter(([, v]) => v === 'livre').map(([k]) => k).sort()
    expect(livres).toEqual([E('Flamejante'), E('de Criação'), E('de Destruição')].sort())
    expect(s.no.A[E('Hidratante')]).toBe('oposto')
  })
  it('caminha de vizinha em vizinha', () => {
    const s = estadoRoda({ roda, sintonia: 'Fogo', tem: tem(['Flamejante', 'Explosiva']) })
    expect(s.no.A[E('Sísmica')]).toBe('livre')
    expect(s.no.A[E('Incendiária')]).toBe('livre')
    expect(s.no.A[E('Mineral')]).toBe('fechado')
  })
  it('Adepta solta (fora do caminho da pura) é sinalizada', () => {
    const s = estadoRoda({ roda, sintonia: 'Fogo', tem: tem(['Flamejante', 'Mineral']) })
    expect([...s.soltas]).toEqual([E('Mineral')])
  })
  it('Experiente: a primeira é do elemento da sintonia (com a Adepta)', () => {
    const s = estadoRoda({ roda, sintonia: 'Fogo', tem: tem(['Flamejante', 'Explosiva', 'Sísmica', 'Incendiária']) })
    expect(s.no.E[E('Flamejante')]).toBe('livre')
    expect(s.no.E[E('Explosiva')]).toBe('livre') // fogo
    expect(s.no.E[E('Incendiária')]).toBe('livre') // fogo
    expect(s.no.E[E('Sísmica')]).toBe('fechado') // terra: ainda não é caminho
    expect(s.no.E[E('Mineral')]).toBe('fechado') // não tem a Adepta
    expect(s.no.E[E('de Criação')]).toBe('fechado') // universal espera a primeira
  })
  it('Experiente: depois da primeira, anda de vizinha em vizinha (sempre com a Adepta)', () => {
    const s = estadoRoda({
      roda,
      sintonia: 'Fogo',
      tem: tem(['Flamejante', 'Explosiva', 'Sísmica', 'Mineral', 'Incendiária', 'de Criação'], ['Explosiva']),
    })
    expect(s.no.E[E('Sísmica')]).toBe('livre') // vizinha da Explosiva Experiente
    expect(s.no.E[E('Flamejante')]).toBe('livre')
    expect(s.no.E[E('Incendiária')]).toBe('fechado') // não é vizinha de uma Experiente
    expect(s.no.E[E('Mineral')]).toBe('fechado') // só passando pela Sísmica
    expect(s.no.E[E('de Criação')]).toBe('livre')
  })
  it('Experiente fora do caminho (não liga numa da sintonia) é inválida', () => {
    const s = estadoRoda({ roda, sintonia: 'Fogo', tem: tem(['Flamejante', 'Explosiva', 'Sísmica', 'Mineral'], ['Explosiva', 'Mineral']) })
    expect(s.invalidas.get(`E:${E('Mineral')}`)).toMatch(/fora do caminho das Experientes/)
    expect(s.invalidas.has(`E:${E('Explosiva')}`)).toBe(false)
  })
  it('Mestre: só de quem tem a Experiente', () => {
    const s = estadoRoda({ roda, sintonia: 'Fogo', tem: tem(['Flamejante', 'Explosiva'], ['Flamejante', 'Explosiva']) })
    expect(s.no.M[E('Flamejante')]).toBe('livre')
    expect(s.no.M[E('Sísmica')]).toBe('fechado')
  })
  it('a pura concedida é a âncora: o caminho sai dela pros dois lados', () => {
    const s = estadoRoda({ roda, sintonia: 'Fogo', tem: tem(['Flamejante']), ancoras: new Set([E('Flamejante')]) })
    expect(s.no.A[E('Explosiva')]).toBe('livre')
    expect(s.no.A[E('Incendiária')]).toBe('livre')
    expect(s.no.A[E('Sísmica')]).toBe('fechado')
  })
})

describe('linha MENOR (Treinamento de Animista)', () => {
  it('sem nada: qualquer essência do elemento da sintonia; universais esperam a primeira', () => {
    const s = estadoRoda({ roda, sintonia: 'Água', tem: tem([]), primeiraDaSintonia: true })
    const livres = Object.entries(s.no.A).filter(([, v]) => v === 'livre').map(([k]) => k).sort()
    expect(livres).toEqual([E('Congelante'), E('Hidratante'), E('Torrencial')].sort())
    expect(s.no.A[E('de Criação')]).toBe('fechado')
    expect(s.no.A[E('Flamejante')]).toBe('oposto')
  })
  it('depois da primeira: vizinhas e universais', () => {
    const s = estadoRoda({ roda, sintonia: 'Água', tem: tem(['Torrencial']), primeiraDaSintonia: true })
    expect(s.no.A[E('de Criação')]).toBe('livre')
    expect(s.no.A[E('Hidratante')]).toBe('livre')
    expect(s.invalidas.size).toBe(0)
  })
  it('nomes Menor', async () => {
    const { parseEssenciaMenor } = await import('../src/rules/roda-essencias')
    expect(parseEssenciaMenor('[[Essência Flamejante Menor]]')).toEqual({ base: E('Flamejante'), tier: 'A' })
    expect(parseEssenciaMenor('Essência de Criação Experiente Menor')).toEqual({ base: E('de Criação'), tier: 'E' })
    expect(parseEssenciaMenor('Essência Flamejante Adepta')).toBeNull()
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
  it('precisa das DUAS Experientes; a primeira toca a sintonia', async () => {
    const { compostaDoDoc, estadoCompostas } = await import('../src/rules/roda-essencias')
    const compostas = ['Essência do Meteoro', 'Essência do Magma', 'Essência do Terremoto'].map(
      (n) => compostaDoDoc(n, docMestre(n).frontmatter)!,
    )
    const st = (a: string[], e: string[], m: string[] = []) =>
      estadoCompostas({ roda, compostas, sintonia: 'Fogo', temA: new Set(a.map(E)), temE: new Set(e.map(E)), temM: new Set(m) })
    const A3 = ['Flamejante', 'Explosiva', 'Sísmica', 'Mineral']
    expect(st(A3, [])['Essência do Meteoro']).toBe('fechado') // nenhuma Experiente
    expect(st(A3, ['Explosiva'])['Essência do Meteoro']).toBe('fechado') // uma só não basta
    expect(st(A3, ['Flamejante', 'Explosiva'])['Essência do Meteoro']).toBe('livre')
    expect(st(A3, ['Explosiva', 'Sísmica'])['Essência do Magma']).toBe('livre')
    expect(st(A3, ['Sísmica', 'Mineral'])['Essência do Terremoto']).toBe('fechado') // 1ª Mestre sem fogo
    expect(st(A3, ['Sísmica', 'Mineral'], ['Essência do Magma'])['Essência do Terremoto']).toBe('livre')
  })
})

describe('Druida: círculo de dois elementos', () => {
  const concessoes = (pai: string, ns: string[]) => ns.map((n) => ({ essencia: `Essência ${n} Adepta`, pai }))
  it('Oceano (Água e Terra): a interface é âncora; slots vão de vizinha em vizinha, sem corda; resto fora', async () => {
    const { elementosDoCirculo } = await import('../src/rules/roda-essencias')
    const els = elementosDoCirculo(roda, concessoes('Círculo do Oceano (Água e Terra)', ['Torrencial', 'Enraizante']))!
    expect(els.sort()).toEqual(['Terra', 'Água'].sort())
    const ancoras = new Set([E('Torrencial'), E('Enraizante')])
    const s = estadoRoda({ roda, sintonia: 'Água', tem: tem(['Torrencial', 'Enraizante']), ancoras, elementos: els })
    expect(s.no.A[E('Hidratante')]).toBe('livre') // vizinha da Torrencial
    expect(s.no.A[E('Mineral')]).toBe('livre') // vizinha da Enraizante
    expect(s.no.A[E('Sísmica')]).toBe('fechado') // ponta da Terra: só passando pela Mineral (sem corda)
    expect(s.no.A[E('Congelante')]).toBe('fechado')
    expect(s.no.A[E('Flamejante')]).toBe('oposto')
    expect(s.no.A[E('Ventania')]).toBe('oposto')
  })
  it('pura do Animista e Essência Invertida (uma por nota) não fazem druida', async () => {
    const { elementosDoCirculo } = await import('../src/rules/roda-essencias')
    expect(
      elementosDoCirculo(roda, [...concessoes('Magias Anima', ['Flamejante']), ...concessoes('Essência Invertida', ['Hidratante'])]),
    ).toBeNull()
  })
})

describe('inválidas (ficha antiga/editada por fora)', () => {
  it('Adepta solta, oposta e Experiente sem Adepta viram inválidas com motivo', () => {
    const s = estadoRoda({
      roda,
      sintonia: 'Fogo',
      tem: tem(['Flamejante', 'Mineral', 'Hidratante'], ['Ventania']),
    })
    expect(s.invalidas.get(`A:${E('Mineral')}`)).toMatch(/caminho/)
    expect(s.invalidas.get(`A:${E('Hidratante')}`)).toMatch(/oposto/)
    expect(s.invalidas.get(`E:${E('Ventania')}`)).toMatch(/Adepta/)
    expect(s.invalidas.has(`A:${E('Flamejante')}`)).toBe(false)
  })
  it('ficha válida não tem inválidas', () => {
    const s = estadoRoda({ roda, sintonia: 'Fogo', tem: tem(['Flamejante', 'Explosiva'], ['Flamejante']) })
    expect(s.invalidas.size).toBe(0)
  })
})

describe('Essência Invertida', () => {
  it('a pura oposta vinda da técnica não é inválida', () => {
    const s = estadoRoda({
      roda,
      sintonia: 'Fogo',
      tem: tem(['Flamejante', 'Hidratante']),
      invertidas: new Set([E('Hidratante')]),
    })
    expect(s.invalidas.size).toBe(0)
    expect(s.no.A[E('Hidratante')]).toBe('tem')
    // isolada: não abre caminho no elemento oposto
    expect(s.no.A[E('Congelante')]).toBe('oposto')
  })
})

