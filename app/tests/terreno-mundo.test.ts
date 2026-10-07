// TERRENO DO MUNDO (2026-10-05; duas camadas 2026-10-06): o terreno de cada
// hex é DADO DO MUNDO — a nota "Terreno do Mundo Livre": FM `Terreno` (camada
// BASE: chave do terreno → lista de "col,row"; fora das listas = padrão) e FM
// `Rotas` (camada de ROTAS por cima: estrada, rota marítima). Pintada no Modo
// Dev (rascunho local → publicar → exportar). Módulo puro: índices rápidos
// col,row → chave e a pintura de um traço em cada camada.
import { describe, expect, it, beforeEach } from 'vitest'
import { gravarTracoTerreno, indiceTerreno, marcasDoMapa, pintarRota, pintarTerreno } from '../src/grupo/terreno-mundo'
import { reconstructMarkdown } from '../src/data/dev-publish'
import { localDraftFor, clearLocalDraft } from '../src/data/local-draft-store'
import type { ViagemCfg } from '../src/grupo/viagem'
import type { VaultDoc } from '../src/data/types'
import { parse as parseYaml } from 'yaml'

const CFG: ViagemCfg = {
  padrao: 'normal',
  terrenos: [
    { chave: 'normal', nome: 'Gramado', custo: 1 },
    { chave: 'mar', nome: 'Mar', custo: 3, agua: true },
    { chave: 'dificil', nome: 'Difícil', custo: 2 },
  ],
  rotas: [
    { chave: 'estrada', nome: 'Estrada', bonus: 1, meios: ['Cavalo'] },
    { chave: 'rota_maritima', nome: 'Rota marítima', bonus: 1, meios: ['Barco'] },
  ],
  meios: [{ nome: 'A pé', icone: '🚶', hexPorDia: 2, em: ['normal', 'dificil'] }],
}

describe('indiceTerreno', () => {
  it('mapa "col,row" → chave; entradas inválidas ignoradas', () => {
    const idx = indiceTerreno({ dificil: ['1,2', ' 3,4 '], mar: ['5,6', 'lixo', 7], normal: null })
    expect(idx.get('1,2')).toBe('dificil')
    expect(idx.get('3,4')).toBe('dificil')
    expect(idx.get('5,6')).toBe('mar')
    expect(idx.size).toBe(3)
  })
  it('memoizado no objeto (mesmo FM → mesmo Map)', () => {
    const fm = { dificil: ['1,2'] }
    expect(indiceTerreno(fm)).toBe(indiceTerreno(fm))
  })
  it('FM ausente/estranho → vazio', () => {
    expect(indiceTerreno(undefined).size).toBe(0)
    expect(indiceTerreno('x').size).toBe(0)
  })
})

describe('pintarTerreno (camada base)', () => {
  it('pinta os hexes do traço (tira de outras listas), sem mutar o original', () => {
    const fm = { dificil: ['1,2', '3,4'], mar: [] as string[] }
    const out = pintarTerreno(fm, [{ col: 3, row: 4 }, { col: 9, row: 9 }], 'mar', CFG)
    expect(out).toEqual({ mar: ['3,4', '9,9'], dificil: ['1,2'] })
    expect(fm.dificil).toEqual(['1,2', '3,4'])
  })
  it('limpar (null) e o terreno padrão tiram o hex de todas as listas', () => {
    const fm = { mar: ['1,2'], dificil: ['5,5'] }
    expect(pintarTerreno(fm, [{ col: 1, row: 2 }], null, CFG)).toEqual({ mar: [], dificil: ['5,5'] })
    expect(pintarTerreno(fm, [{ col: 5, row: 5 }], 'normal', CFG)).toEqual({ mar: ['1,2'], dificil: [] })
  })
  it('listas ordenadas (col, depois row) — export estável', () => {
    const out = pintarTerreno({}, [{ col: 10, row: 2 }, { col: 2, row: 7 }, { col: 2, row: 3 }], 'dificil', CFG)
    expect(out.dificil).toEqual(['2,3', '2,7', '10,2'])
  })
})

describe('pintarRota (camada de rotas)', () => {
  it('pinta a rota (troca de rota tira da outra lista); toda rota da config aparece', () => {
    const out = pintarRota({ estrada: ['1,1', '2,2'] }, [{ col: 2, row: 2 }, { col: 7, row: 0 }], 'rota_maritima', CFG)
    expect(out).toEqual({ estrada: ['1,1'], rota_maritima: ['2,2', '7,0'] })
  })
  it('limpar rota (null) tira o hex de todas as rotas, sem tocar o terreno-base', () => {
    expect(pintarRota({ estrada: ['1,1'], rota_maritima: ['4,4'] }, [{ col: 1, row: 1 }], null, CFG)).toEqual({
      estrada: [],
      rota_maritima: ['4,4'],
    })
  })
})

describe('gravarTracoTerreno', () => {
  const doc = {
    id: 'Atlas/Mundo Livre/Terreno do Mundo Livre',
    path: 'Atlas/Mundo Livre/Terreno do Mundo Livre.md',
    frontmatter: { Terreno: { dificil: ['1,1'] }, Rotas: { estrada: ['3,3'] } },
    body: '',
  } as unknown as VaultDoc
  beforeEach(() => clearLocalDraft(doc.id))
  it('camada base grava `Terreno` e preserva `Rotas`; camada de rotas grava `Rotas` e preserva `Terreno`', () => {
    gravarTracoTerreno(doc, [{ col: 2, row: 2 }], 'mar', CFG)
    expect(localDraftFor(doc.id)!.frontmatter).toEqual({
      Terreno: { mar: ['2,2'], dificil: ['1,1'] },
      Rotas: { estrada: ['3,3'] },
    })
    gravarTracoTerreno(doc, [{ col: 2, row: 2 }], 'rota_maritima', CFG, 'rotas')
    expect(localDraftFor(doc.id)!.frontmatter).toEqual({
      Terreno: { mar: ['2,2'], dificil: ['1,1'] },
      Rotas: { estrada: ['3,3'], rota_maritima: ['2,2'] },
    })
  })
})

describe('EXPORTAR do Modo Dev', () => {
  it('reconstructMarkdown devolve o FM Terreno + Rotas como YAML legível de volta', () => {
    const base = {
      id: 'Atlas/Mundo Livre/Terreno do Mundo Livre',
      path: 'Atlas/Mundo Livre/Terreno do Mundo Livre.md',
      frontmatter: { Terreno: { mar: [] }, Rotas: { estrada: [] } },
      body: '# Terreno do Mundo Livre\n',
    } as unknown as VaultDoc
    const Terreno = pintarTerreno(base.frontmatter.Terreno, [{ col: 60, row: 21 }], 'dificil', CFG)
    const Rotas = pintarRota(base.frontmatter.Rotas, [{ col: 60, row: 21 }], 'estrada', CFG)
    const md = reconstructMarkdown(base, { frontmatter: { ...base.frontmatter, Terreno, Rotas } })
    const fm = md.split('---\n')[1]!
    expect(parseYaml(fm)).toEqual({
      Terreno: { mar: [], dificil: ['60,21'] },
      Rotas: { estrada: ['60,21'], rota_maritima: [] },
    })
    expect(md.endsWith('# Terreno do Mundo Livre\n')).toBe(true)
  })
})

// MODIFICADORES DO MAPA (toggle da Exploração, 2026-10-06): uma marca por hex
// derivada da CONFIG (nunca da chave): água = onda; terreno com custo > 1 =
// triângulos (custo − 1: difícil ▲, montanha ▲▲); rota cujos meios só andam
// na água = anel; as outras rotas, por ordem: losango, degrau, barra. UM path
// por classe (geometria concatenada) — DOM constante no gesto (#573).
describe('marcasDoMapa', () => {
  const CFG_M: ViagemCfg = {
    ...CFG,
    terrenos: [...CFG.terrenos, { chave: 'muito_dificil', nome: 'Montanha', custo: 3, cor: '#8a8a8a' }],
    rotas: [...CFG.rotas!, { chave: 'escadaria', nome: 'Escadaria', bonus: 1, meios: ['A pé'] }],
    meios: [...CFG.meios, { nome: 'Barco', icone: '⛵', hexPorDia: 5, em: ['mar'] }],
  }
  const T = indiceTerreno({ dificil: ['10,10', '11,10', '12,10'], muito_dificil: ['13,10'], mar: ['14,10', '15,10'] })
  const R = indiceTerreno({ estrada: ['10,10', '11,10'], rota_maritima: ['14,10'], escadaria: ['13,10'] })
  const subpaths = (d: string) => (d.match(/M/g) ?? []).length

  it('uma marca por classe presente, na ordem da config, com nome/cor/forma da config', () => {
    const m = marcasDoMapa(T, R, CFG_M)
    expect(m.map((x) => [x.classe, x.forma, x.nome])).toEqual([
      ['terreno:mar', 'onda', 'Mar'],
      ['terreno:dificil', 'tri1', 'Difícil'],
      ['terreno:muito_dificil', 'tri2', 'Montanha'],
      ['rota:estrada', 'losango', 'Estrada'],
      ['rota:rota_maritima', 'anel', 'Rota marítima'],
      ['rota:escadaria', 'degrau', 'Escadaria'],
    ])
    expect(m.find((x) => x.chave === 'muito_dificil')!.cor).toBe('#8a8a8a')
  })
  it('a geometria cobre cada hex (subpaths por hex: tri1 = 1, tri2 = 2, onda = 2)', () => {
    const m = new Map(marcasDoMapa(T, R, CFG_M).map((x) => [x.chave, x.d]))
    expect(subpaths(m.get('dificil')!)).toBe(3)
    expect(subpaths(m.get('muito_dificil')!)).toBe(2)
    expect(subpaths(m.get('mar')!)).toBe(4)
    expect(subpaths(m.get('estrada')!)).toBe(2)
    expect(subpaths(m.get('rota_maritima')!)).toBe(1)
    expect(subpaths(m.get('escadaria')!)).toBe(1)
  })
  it('número de marcas não cresce com o número de hexes', () => {
    const muitos = indiceTerreno({ dificil: Array.from({ length: 500 }, (_, i) => `${i},3`) })
    expect(marcasDoMapa(muitos, new Map(), CFG_M)).toHaveLength(1)
  })
  it('recorte (área da vista) deixa de fora hexes longe; memoizado por índice + recorte', () => {
    const area = { x: 0, y: 0, w: 1000, h: 1000 }
    const longe = indiceTerreno({ dificil: ['1,1', '80,50'] })
    const semRotas = new Map<string, string>()
    const m = marcasDoMapa(longe, semRotas, CFG_M, area)
    expect(subpaths(m[0]!.d)).toBe(1)
    expect(marcasDoMapa(longe, semRotas, CFG_M, { ...area })).toBe(m)
  })
})
