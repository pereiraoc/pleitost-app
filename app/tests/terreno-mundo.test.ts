// TERRENO DO MUNDO (2026-10-05): o terreno de cada hex é DADO DO MUNDO — a
// nota "Terreno do Mundo Livre" (FM `Terreno`: chave → lista de "col,row" na
// grade da trilha), pintada no Modo Dev (rascunho local → publicar → exportar).
// Módulo puro: índice rápido col,row → chave e a pintura de um traço.
import { describe, expect, it } from 'vitest'
import { indiceTerreno, pintarTerreno } from '../src/grupo/terreno-mundo'
import { reconstructMarkdown } from '../src/data/dev-publish'
import type { ViagemCfg } from '../src/grupo/viagem'
import type { VaultDoc } from '../src/data/types'
import { parse as parseYaml } from 'yaml'

const CFG: ViagemCfg = {
  padrao: 'normal',
  terrenos: [
    { chave: 'estrada', nome: 'Estrada', custo: 1 },
    { chave: 'normal', nome: 'Gramado', custo: 1 },
    { chave: 'mar', nome: 'Mar', custo: 1 },
    { chave: 'dificil', nome: 'Difícil', custo: 2 },
  ],
  meios: [{ nome: 'A pé', icone: '🚶', hexPorDia: 2, em: ['estrada', 'normal', 'dificil'] }],
}

describe('indiceTerreno', () => {
  it('mapa "col,row" → chave; entradas inválidas ignoradas', () => {
    const idx = indiceTerreno({ estrada: ['1,2', ' 3,4 '], mar: ['5,6', 'lixo', 7], dificil: null })
    expect(idx.get('1,2')).toBe('estrada')
    expect(idx.get('3,4')).toBe('estrada')
    expect(idx.get('5,6')).toBe('mar')
    expect(idx.size).toBe(3)
  })
  it('memoizado no objeto (mesmo FM → mesmo Map)', () => {
    const fm = { estrada: ['1,2'] }
    expect(indiceTerreno(fm)).toBe(indiceTerreno(fm))
  })
  it('FM ausente/estranho → vazio', () => {
    expect(indiceTerreno(undefined).size).toBe(0)
    expect(indiceTerreno('x').size).toBe(0)
  })
})

describe('pintarTerreno', () => {
  it('pinta os hexes do traço (tira de outras listas), sem mutar o original', () => {
    const fm = { estrada: ['1,2', '3,4'], mar: [] as string[] }
    const out = pintarTerreno(fm, [{ col: 3, row: 4 }, { col: 9, row: 9 }], 'mar', CFG)
    expect(out).toEqual({ estrada: ['1,2'], mar: ['3,4', '9,9'], dificil: [] })
    expect(fm.estrada).toEqual(['1,2', '3,4'])
  })
  it('limpar (null) e o terreno padrão tiram o hex de todas as listas', () => {
    const fm = { estrada: ['1,2'], dificil: ['5,5'] }
    expect(pintarTerreno(fm, [{ col: 1, row: 2 }], null, CFG)).toEqual({ estrada: [], mar: [], dificil: ['5,5'] })
    expect(pintarTerreno(fm, [{ col: 5, row: 5 }], 'normal', CFG)).toEqual({ estrada: ['1,2'], mar: [], dificil: [] })
  })
  it('listas ordenadas (col, depois row) — export estável', () => {
    const out = pintarTerreno({}, [{ col: 10, row: 2 }, { col: 2, row: 7 }, { col: 2, row: 3 }], 'estrada', CFG)
    expect(out.estrada).toEqual(['2,3', '2,7', '10,2'])
  })
})

describe('EXPORTAR do Modo Dev', () => {
  it('reconstructMarkdown devolve o FM Terreno como YAML legível de volta', () => {
    const base = {
      id: 'Atlas/Mundo Livre/Terreno do Mundo Livre',
      path: 'Atlas/Mundo Livre/Terreno do Mundo Livre.md',
      frontmatter: { Terreno: { estrada: [], mar: [] } },
      body: '# Terreno do Mundo Livre\n',
    } as unknown as VaultDoc
    const Terreno = pintarTerreno(base.frontmatter.Terreno, [{ col: 60, row: 21 }], 'estrada', CFG)
    const md = reconstructMarkdown(base, { frontmatter: { ...base.frontmatter, Terreno } })
    const fm = md.split('---\n')[1]!
    expect(parseYaml(fm)).toEqual({ Terreno: { estrada: ['60,21'], mar: [], dificil: [] } })
    expect(md.endsWith('# Terreno do Mundo Livre\n')).toBe(true)
  })
})
