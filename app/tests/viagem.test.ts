// VIAGEM DO HEXCRAWL (2026-10-04): tempo pra percorrer a trilha do grupo,
// regras do Contexto Fantasia (FM `viagem`, compilado no contexto.json).
// Custo: cada PASSO do hex i pro i+1 custa o terreno do hex ENTRADO (o de
// partida não conta). Hexes não adjacentes na trilha são ligados pela linha
// hex mais curta (cada hex do meio também é entrado). Meio por hex = o mais
// rápido entre os do grupo que andam naquele terreno; o PRIMEIRO meio da
// config (A pé) é o básico, sempre disponível. Sem meio possível → bloqueado.
import { describe, expect, it } from 'vitest'
import {
  calcularViagem,
  custoHex,
  formatarHoras,
  hexDistance,
  hexLine,
  meiosDoGrupo,
  type ViagemCfg,
} from '../src/grupo/viagem'

const CFG: ViagemCfg = {
  padrao: 'normal',
  terrenos: [
    { chave: 'estrada', nome: 'Estrada', horas: 8 },
    { chave: 'normal', nome: 'Gramado', horas: 16 },
    { chave: 'mar', nome: 'Mar navegável', horas: 16 },
    { chave: 'dificil', nome: 'Difícil', horas: 24 },
    { chave: 'muito_dificil', nome: 'Montanha', horas: 48 },
  ],
  meios: [
    { nome: 'A pé', fator: 1, em: ['estrada', 'normal', 'dificil', 'muito_dificil'] },
    { nome: 'Cavalo', fator: 2, em: ['estrada', 'normal'] },
    { nome: 'Caravana', fator: 2, em: ['estrada', 'normal'] },
    { nome: 'Barco', fator: 2, em: ['mar'] },
  ],
}

/** Trilha vertical na coluna 10 (hexes adjacentes), linhas 0..n. */
function coluna(n: number, kinds: Record<number, 'parada' | 'caminho'> = {}) {
  return Array.from({ length: n + 1 }, (_, i) => ({
    id: `h${i}`,
    col: 10,
    row: i,
    kind: kinds[i] ?? ('caminho' as const),
  }))
}

describe('custoHex', () => {
  it('cada terreno a pé = horas da config', () => {
    expect(custoHex('estrada', CFG, ['A pé']).horas).toBe(8)
    expect(custoHex('normal', CFG, ['A pé']).horas).toBe(16)
    expect(custoHex('dificil', CFG, ['A pé']).horas).toBe(24)
    expect(custoHex('muito_dificil', CFG, ['A pé']).horas).toBe(48)
  })
  it('cavalo/caravana dobram a velocidade onde andam; barco no mar', () => {
    expect(custoHex('estrada', CFG, ['A pé', 'Cavalo'])).toEqual({ horas: 4, meio: 'Cavalo' })
    expect(custoHex('normal', CFG, ['A pé', 'Caravana'])).toEqual({ horas: 8, meio: 'Caravana' })
    expect(custoHex('mar', CFG, ['A pé', 'Barco'])).toEqual({ horas: 8, meio: 'Barco' })
  })
  it('cavalo proibido no difícil → cai no A pé', () => {
    expect(custoHex('dificil', CFG, ['A pé', 'Cavalo'])).toEqual({ horas: 24, meio: 'A pé' })
    expect(custoHex('muito_dificil', CFG, ['A pé', 'Cavalo'])).toEqual({ horas: 48, meio: 'A pé' })
  })
  it('mar sem barco → bloqueado', () => {
    expect(custoHex('mar', CFG, ['A pé', 'Cavalo'])).toEqual({ horas: null, meio: null })
  })
  it('terreno desconhecido/ausente usa o padrão', () => {
    expect(custoHex(undefined, CFG, ['A pé']).horas).toBe(16)
    expect(custoHex('lava', CFG, ['A pé']).horas).toBe(16)
  })
})

describe('meiosDoGrupo', () => {
  it('sem escolha → só o primeiro meio da config (A pé)', () => {
    expect(meiosDoGrupo(CFG, undefined)).toEqual(['A pé'])
    expect(meiosDoGrupo(CFG, [])).toEqual(['A pé'])
  })
  it('o básico entra sempre; nomes fora da config caem', () => {
    expect(meiosDoGrupo(CFG, ['Cavalo', 'Dragão'])).toEqual(['A pé', 'Cavalo'])
  })
})

describe('grade odd-q', () => {
  it('distância e linha preenchem buracos', () => {
    expect(hexDistance({ col: 10, row: 0 }, { col: 10, row: 3 })).toBe(3)
    expect(hexDistance({ col: 10, row: 0 }, { col: 11, row: 0 })).toBe(1)
    expect(hexDistance({ col: 10, row: 0 }, { col: 11, row: -1 })).toBe(1)
    expect(hexDistance({ col: 11, row: 0 }, { col: 12, row: 1 })).toBe(1)
    const l = hexLine({ col: 10, row: 0 }, { col: 10, row: 3 })
    expect(l).toEqual([
      { col: 10, row: 0 },
      { col: 10, row: 1 },
      { col: 10, row: 2 },
      { col: 10, row: 3 },
    ])
    const diag = hexLine({ col: 10, row: 0 }, { col: 14, row: 2 })
    expect(diag).toHaveLength(hexDistance({ col: 10, row: 0 }, { col: 14, row: 2 }) + 1)
    for (let i = 1; i < diag.length; i++) expect(hexDistance(diag[i - 1]!, diag[i]!)).toBe(1)
  })
})

describe('calcularViagem', () => {
  const terrenoDe = (mapa: Record<string, string>) => (col: number, row: number) => mapa[`${col},${row}`]

  it('soma o terreno de cada hex ENTRADO; partida não conta', () => {
    const v = calcularViagem({
      hexes: coluna(3, { 0: 'parada' }),
      terrenoDe: terrenoDe({ '10,1': 'estrada', '10,2': 'dificil', '10,3': 'muito_dificil' }),
      cfg: CFG,
      meios: undefined,
    })
    expect(v.total).toBe(8 + 24 + 48)
    expect(v.bloqueado).toBe(false)
  })

  it('buraco entre hexes não adjacentes é preenchido pela linha', () => {
    const v = calcularViagem({
      hexes: [
        { id: 'a', col: 10, row: 0, kind: 'parada' },
        { id: 'b', col: 10, row: 3, kind: 'parada' },
      ],
      terrenoDe: terrenoDe({ '10,1': 'estrada', '10,2': 'estrada' }),
      cfg: CFG,
      meios: ['A pé'],
    })
    // entra 10,1 (8) + 10,2 (8) + 10,3 (padrão 16)
    expect(v.total).toBe(32)
  })

  it('segmentos começam numa parada e somam os passos que saem dela', () => {
    const v = calcularViagem({
      hexes: coluna(4, { 0: 'parada', 2: 'parada' }),
      terrenoDe: () => undefined,
      cfg: CFG,
      meios: ['Cavalo'],
    })
    expect(v.segmentos.map((s) => [s.inicio, s.horas])).toEqual([
      [0, 16], // 0→1→2: 2 × gramado a cavalo (8)
      [2, 16], // 2→3→4
    ])
    expect(v.total).toBe(32)
  })

  it('trecho antes da primeira parada vira segmento sem cabeçalho (inicio 0)', () => {
    const v = calcularViagem({
      hexes: coluna(2, { 1: 'parada' }),
      terrenoDe: () => undefined,
      cfg: CFG,
      meios: undefined,
    })
    expect(v.segmentos.map((s) => [s.inicio, s.horas])).toEqual([
      [0, 16],
      [1, 16],
    ])
  })

  it('mar sem barco bloqueia o segmento e aponta o hex', () => {
    const v = calcularViagem({
      hexes: coluna(2, { 0: 'parada' }),
      terrenoDe: terrenoDe({ '10,2': 'mar' }),
      cfg: CFG,
      meios: ['Cavalo'],
    })
    expect(v.bloqueado).toBe(true)
    expect(v.segmentos[0]!.bloqueios).toEqual([{ col: 10, row: 2, terreno: 'mar' }])
    expect(v.total).toBe(8) // o passo possível (gramado a cavalo) segue contando
  })

  it('trilha vazia ou de um hex só = 0h', () => {
    expect(calcularViagem({ hexes: [], terrenoDe: () => undefined, cfg: CFG, meios: undefined }).total).toBe(0)
    expect(calcularViagem({ hexes: coluna(0), terrenoDe: () => undefined, cfg: CFG, meios: undefined }).total).toBe(0)
  })
})

describe('formatarHoras', () => {
  it('horas + dias corridos de 24h', () => {
    expect(formatarHoras(8)).toBe('8h')
    expect(formatarHoras(24)).toBe('24h (1d)')
    expect(formatarHoras(56)).toBe('56h (2d 8h)')
    expect(formatarHoras(4.5)).toBe('4,5h')
  })
})
