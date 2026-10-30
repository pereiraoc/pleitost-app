// Pedido do mestre (2026-10-29): "um foco só pode estar vinculado a um item
// tipo um implemento, mas tu não tá mostrando assim — no Carlos Facão tem um
// Broche Artístico e um Foco da Intensificação separados". Regra (Tesouros.md,
// "Focos as Imbuição"): o foco é trabalhado num implemento fundamental do
// mesmo tier e o preço do foco já inclui o implemento. Fichas antigas guardam
// foco solto em Inventario.Tesouros → migração ao carregar.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildCatalog } from '../src/data/catalog'
import type { IndexManifest } from '../src/data/types'
import { implementosDe, migrarFocosSoltos, rotuloImplemento, tipoImplementoPeloId } from '../src/data/implementos'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const dir = path.join(path.dirname(appDir), 'vault-data')
const catalog = buildCatalog(JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')) as IndexManifest)
const tipoDe = (base: string) => {
  const r = catalog.resolve(base)
  return r.kind === 'doc' ? tipoImplementoPeloId(r.id) : null
}
const heroi = (nome: string) =>
  JSON.parse(fs.readFileSync(path.join(dir, `Sistema/Criaturas/Heróis/${nome}.json`), 'utf8')).frontmatter as Record<string, any>
const comTesouros = (fm: Record<string, any>, tes: string[]) => ({ ...fm, Inventario: { ...fm.Inventario, Tesouros: tes } })
const rotulos = (fm: Record<string, unknown>) =>
  implementosDe(fm).map((l) => `${rotuloImplemento(l.nome, l.foco)} ${l.tier}${l.nome ? '' : ' (sem implemento)'}`)

describe('migrarFocosSoltos', () => {
  it('classifica pela pasta do catálogo', () => {
    expect(tipoDe('Broche Artístico')).toBe('fundamental')
    expect(tipoDe('Foco da Intensificação')).toBe('foco')
    expect(tipoDe('Anel Mensageiro')).toBeNull()
  })

  it('Carlos com Broche A: a Intensificação A é trabalhada no Broche; a Repetição fica sem implemento', () => {
    const c = heroi('Carlos Facão de Andradas')
    const fm = comTesouros(c, [...c.Inventario.Tesouros, '[[Broche Artístico|Broche Artístico (Adepto)]]'])
    const out = migrarFocosSoltos(fm, tipoDe) as Record<string, any>
    expect(rotulos(out)).toEqual(['Broche Artístico da Intensificação A', 'Foco da Repetição A (sem implemento)'])
    const restantes = (out.Inventario.Tesouros as string[]).join(' ')
    expect(restantes).not.toMatch(/Foco da|Broche/)
    expect(restantes).toMatch(/Anel Mensageiro/) // o resto fica
  })

  it('Carlos da vault (sem Broche): os dois focos ficam sem implemento, nada some', () => {
    const out = migrarFocosSoltos(heroi('Carlos Facão de Andradas'), tipoDe)
    expect(rotulos(out)).toEqual(['Foco da Intensificação A (sem implemento)', 'Foco da Repetição A (sem implemento)'])
  })

  it('Saladin: Luva E não casa com focos A (tier diferente)', () => {
    const out = migrarFocosSoltos(heroi('Saladin'), tipoDe)
    expect(rotulos(out)).toEqual([
      'Luva do Arcanista E',
      'Foco da Intensificação A (sem implemento)',
      'Foco da Penetração A (sem implemento)',
    ])
  })

  it('foco solto casa com implemento sem foco que JÁ estava em Implementos', () => {
    const c = heroi('Dante')
    const fm = {
      ...comTesouros(c, ['[[Foco da Repetição|Foco da Repetição (Experiente)]]']),
      Inventario: {
        ...c.Inventario,
        Tesouros: ['[[Foco da Repetição|Foco da Repetição (Experiente)]]'],
        Implementos: [{ Nome: '[[Broche Artístico]]', Propriedade: '', Categoria: '[[Experiente]]', Fonte: 'Comércio' }],
      },
    }
    expect(rotulos(migrarFocosSoltos(fm, tipoDe))).toEqual(['Broche Artístico da Repetição E'])
  })

  it('idempotente: segunda passada devolve o mesmo objeto; ficha sem implemento também', () => {
    const uma = migrarFocosSoltos(heroi('Saladin'), tipoDe)
    expect(migrarFocosSoltos(uma, tipoDe)).toBe(uma)
    const dante = heroi('Dante')
    expect(migrarFocosSoltos(dante, tipoDe)).toBe(dante)
  })
})

describe('comParDosFocos (useHeroModel)', () => {
  it('com migração pendente, gravar Tesouros leva Implementos junto (e vice-versa); sem pendência, nada muda', async () => {
    const { comParDosFocos } = await import('../src/data/useHeroModel')
    const fm = migrarFocosSoltos(heroi('Saladin'), tipoDe) as Record<string, any>
    const so = comParDosFocos([['Inventario.Tesouros', []]], fm, true)
    expect(so.map(([p]) => p)).toEqual(['Inventario.Tesouros', 'Inventario.Implementos'])
    expect(so[1]![1]).toEqual(fm.Inventario.Implementos)
    expect(comParDosFocos([['Inventario.Implementos', []]], fm, true).map(([p]) => p)).toEqual([
      'Inventario.Implementos',
      'Inventario.Tesouros',
    ])
    expect(comParDosFocos([['Inventario.Tesouros', []]], fm, false)).toHaveLength(1)
    expect(comParDosFocos([['Inventario.Ouro', 3]], fm, true)).toHaveLength(1)
  })
})

describe('Grupo: implemento com foco', () => {
  it('vale o preço do foco (que inclui o implemento) e vai pra Inventario.Implementos ao puxar', async () => {
    const { itemValorPO, pullItemToFm } = await import('../src/grupo/inventario-item')
    const docId = 'Sistema/Equipamento/Tesouros/Implementos/Fundamentais/Broche Artístico'
    const preco: Record<string, number> = { 'Broche Artístico': 30, 'Foco da Intensificação': 75 }
    const priceOf = (b: string) => preco[b] ?? 0
    const item = { kind: 'tesouro' as const, docId, nome: 'Broche Artístico', tier: 'A', focoBase: 'Foco da Intensificação', id: 'x' }
    expect(itemValorPO(item as any, priceOf)).toBe(75)
    expect(itemValorPO({ ...item, focoBase: undefined } as any, priceOf)).toBe(30)
    const w = pullItemToFm(item as any, { Inventario: { Tesouros: [], Implementos: [] } }, {})
    expect(w).toEqual([
      {
        path: 'Inventario.Implementos',
        value: [{ Nome: '[[Broche Artístico]]', Propriedade: '[[Foco da Intensificação]]', Categoria: '[[Adepto]]', Fonte: 'Grupo' }],
      },
    ])
  })
})
