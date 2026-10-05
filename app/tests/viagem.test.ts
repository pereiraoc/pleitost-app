// VIAGEM DO HEXCRAWL (2026-10-04, regras v2): tempo pra percorrer a trilha do
// grupo, regras do Contexto Fantasia (FM `viagem`, compilado no contexto.json).
// 1 dia de viagem: a pé = 2 hex, cavalo = 3, carruagem = 4, navio = 5.
// Terreno normal = custo ×1, difícil ×2, muito difícil ×3 → tempo por hex =
// custo / hex_por_dia DIAS. Restrições: carruagem só na estrada; cavalo não
// entra em terreno muito difícil; navio só no mar.
// Custo: cada PASSO do hex i pro i+1 custa o terreno do hex ENTRADO (o de
// partida não conta). Hexes não adjacentes na trilha são ligados pela linha
// hex mais curta (cada hex do meio também é entrado). Meio por hex = o mais
// rápido entre os do grupo que andam naquele terreno; o PRIMEIRO meio da
// config (A pé) é o básico, sempre disponível. Sem meio possível → bloqueado.
import { describe, expect, it } from 'vitest'
import {
  calcularViagem,
  custoHex,
  formatarDias,
  hexDistance,
  hexLine,
  meiosDoGrupo,
  type ViagemCfg,
} from '../src/grupo/viagem'

const CFG: ViagemCfg = {
  padrao: 'normal',
  terrenos: [
    { chave: 'estrada', nome: 'Estrada', custo: 1 },
    { chave: 'normal', nome: 'Gramado', custo: 1 },
    { chave: 'mar', nome: 'Mar navegável', custo: 1 },
    { chave: 'dificil', nome: 'Difícil', custo: 2 },
    { chave: 'muito_dificil', nome: 'Montanha', custo: 3 },
  ],
  meios: [
    { nome: 'A pé', hexPorDia: 2, em: ['estrada', 'normal', 'dificil', 'muito_dificil'] },
    { nome: 'Cavalo', hexPorDia: 3, em: ['estrada', 'normal', 'dificil'] },
    { nome: 'Carruagem', hexPorDia: 4, em: ['estrada'] },
    { nome: 'Navio', hexPorDia: 5, em: ['mar'] },
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
  it('a pé: normal = ½ dia/hex; difícil = 1 dia; montanha = 1½ dia', () => {
    expect(custoHex('estrada', CFG, ['A pé'])).toEqual({ dias: 0.5, meio: 'A pé' })
    expect(custoHex('normal', CFG, ['A pé'])).toEqual({ dias: 0.5, meio: 'A pé' })
    expect(custoHex('dificil', CFG, ['A pé'])).toEqual({ dias: 1, meio: 'A pé' })
    expect(custoHex('muito_dificil', CFG, ['A pé'])).toEqual({ dias: 1.5, meio: 'A pé' })
  })
  it('cavalo: ⅓ dia no normal, ⅔ no difícil; na montanha cai no A pé (1½ dia)', () => {
    expect(custoHex('normal', CFG, ['A pé', 'Cavalo'])).toEqual({ dias: 1 / 3, meio: 'Cavalo' })
    expect(custoHex('dificil', CFG, ['A pé', 'Cavalo'])).toEqual({ dias: 2 / 3, meio: 'Cavalo' })
    expect(custoHex('muito_dificil', CFG, ['A pé', 'Cavalo'])).toEqual({ dias: 1.5, meio: 'A pé' })
  })
  it('carruagem só na estrada (¼ dia); fora dela cai no cavalo ou no A pé', () => {
    expect(custoHex('estrada', CFG, ['A pé', 'Cavalo', 'Carruagem'])).toEqual({ dias: 0.25, meio: 'Carruagem' })
    expect(custoHex('normal', CFG, ['A pé', 'Cavalo', 'Carruagem'])).toEqual({ dias: 1 / 3, meio: 'Cavalo' })
    expect(custoHex('normal', CFG, ['A pé', 'Carruagem'])).toEqual({ dias: 0.5, meio: 'A pé' })
  })
  it('navio no mar = ⅕ dia; mar sem navio → bloqueado', () => {
    expect(custoHex('mar', CFG, ['A pé', 'Navio'])).toEqual({ dias: 0.2, meio: 'Navio' })
    expect(custoHex('mar', CFG, ['A pé', 'Cavalo', 'Carruagem'])).toEqual({ dias: null, meio: null })
  })
  it('terreno desconhecido/ausente usa o padrão', () => {
    expect(custoHex(undefined, CFG, ['A pé']).dias).toBe(0.5)
    expect(custoHex('lava', CFG, ['A pé']).dias).toBe(0.5)
  })
})

describe('meiosDoGrupo', () => {
  it('sem escolha → só o primeiro meio da config (A pé)', () => {
    expect(meiosDoGrupo(CFG, undefined)).toEqual(['A pé'])
    expect(meiosDoGrupo(CFG, [])).toEqual(['A pé'])
  })
  it('o básico entra sempre; nomes fora da config (inclusive os antigos Caravana/Barco) caem', () => {
    expect(meiosDoGrupo(CFG, ['Cavalo', 'Dragão'])).toEqual(['A pé', 'Cavalo'])
    expect(meiosDoGrupo(CFG, ['Caravana', 'Barco'])).toEqual(['A pé'])
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
    expect(v.total).toBe(0.5 + 1 + 1.5)
    expect(v.bloqueado).toBe(false)
  })

  it('soma exata de terços (cavalo: 3 hex de gramado = 1 dia, sem 0,999…)', () => {
    const v = calcularViagem({ hexes: coluna(3), terrenoDe: () => undefined, cfg: CFG, meios: ['Cavalo'] })
    expect(v.total).toBe(1)
    expect(formatarDias(v.total)).toBe('1 dia')
  })

  it('carruagem na estrada e cavalo fora dela, no mesmo trecho', () => {
    const v = calcularViagem({
      hexes: coluna(3),
      terrenoDe: terrenoDe({ '10,1': 'estrada', '10,2': 'estrada' }),
      cfg: CFG,
      meios: ['Cavalo', 'Carruagem'],
    })
    // ¼ + ¼ + ⅓ (gramado a cavalo) = ⅚
    expect(v.total).toBeCloseTo(5 / 6, 12)
    expect(formatarDias(v.total)).toBe('⅚ dia')
  })

  it('buraco entre hexes não adjacentes é preenchido pela linha', () => {
    const v = calcularViagem({
      hexes: [
        { id: 'a', col: 10, row: 0, kind: 'parada' },
        { id: 'b', col: 10, row: 3, kind: 'parada' },
      ],
      terrenoDe: terrenoDe({ '10,1': 'dificil', '10,2': 'dificil' }),
      cfg: CFG,
      meios: ['A pé'],
    })
    // entra 10,1 (1) + 10,2 (1) + 10,3 (padrão ½)
    expect(v.total).toBe(2.5)
  })

  it('segmentos começam numa parada e somam os passos que saem dela', () => {
    const v = calcularViagem({
      hexes: coluna(4, { 0: 'parada', 2: 'parada' }),
      terrenoDe: () => undefined,
      cfg: CFG,
      meios: ['Cavalo'],
    })
    expect(v.segmentos.map((s) => [s.inicio, s.dias])).toEqual([
      [0, 2 / 3], // 0→1→2: 2 × gramado a cavalo (⅓)
      [2, 2 / 3], // 2→3→4
    ])
    expect(v.total).toBe(4 / 3)
  })

  it('trecho antes da primeira parada vira segmento sem cabeçalho (inicio 0)', () => {
    const v = calcularViagem({
      hexes: coluna(2, { 1: 'parada' }),
      terrenoDe: () => undefined,
      cfg: CFG,
      meios: undefined,
    })
    expect(v.segmentos.map((s) => [s.inicio, s.dias])).toEqual([
      [0, 0.5],
      [1, 0.5],
    ])
  })

  it('mar sem navio bloqueia o segmento e aponta o hex; com navio, ⅕ dia', () => {
    const args = {
      hexes: coluna(2, { 0: 'parada' }),
      terrenoDe: terrenoDe({ '10,2': 'mar' }),
      cfg: CFG,
    }
    const v = calcularViagem({ ...args, meios: ['Cavalo'] })
    expect(v.bloqueado).toBe(true)
    expect(v.segmentos[0]!.bloqueios).toEqual([{ col: 10, row: 2, terreno: 'mar' }])
    expect(v.total).toBe(1 / 3) // o passo possível (gramado a cavalo) segue contando
    const n = calcularViagem({ ...args, meios: ['Cavalo', 'Navio'] })
    expect(n.bloqueado).toBe(false)
    expect(n.total).toBeCloseTo(1 / 3 + 1 / 5, 12)
  })

  it('custo não inteiro na config ainda soma (float)', () => {
    const cfg: ViagemCfg = { ...CFG, terrenos: [{ chave: 'normal', nome: 'Gramado', custo: 1.5 }] }
    const v = calcularViagem({ hexes: coluna(2), terrenoDe: () => undefined, cfg, meios: undefined })
    expect(v.total).toBeCloseTo(1.5, 12)
  })

  it('passos por índice: custo pra ENTRAR em cada hex (meio, terreno), somando o segmento', () => {
    const v = calcularViagem({
      hexes: coluna(4, { 0: 'parada', 3: 'parada' }),
      terrenoDe: terrenoDe({ '10,1': 'estrada', '10,2': 'dificil', '10,4': 'mar' }),
      cfg: CFG,
      meios: ['Cavalo', 'Carruagem'],
    })
    expect(v.passos).toHaveLength(5)
    expect(v.passos[0]).toBeNull() // partida não custa
    expect(v.passos[1]).toEqual({ dias: 0.25, meio: 'Carruagem', terreno: 'estrada', bloqueado: false })
    expect(v.passos[2]).toEqual({ dias: 2 / 3, meio: 'Cavalo', terreno: 'dificil', bloqueado: false })
    expect(v.passos[3]).toEqual({ dias: 1 / 3, meio: 'Cavalo', terreno: 'normal', bloqueado: false })
    expect(v.passos[4]).toEqual({ dias: null, meio: null, terreno: 'mar', bloqueado: true })
    // o segmento da parada 0 soma os passos 1..3 (até entrar na parada 3)
    const soma = [1, 2, 3].reduce((a, i) => a + (v.passos[i]!.dias ?? 0), 0)
    expect(soma).toBeCloseTo(v.segmentos[0]!.dias, 12)
    expect(v.segmentos[1]!.bloqueios).toHaveLength(1)
  })

  it('passo com buraco soma a linha inteira até o hex de chegada', () => {
    const v = calcularViagem({
      hexes: [
        { id: 'a', col: 10, row: 0, kind: 'parada' },
        { id: 'b', col: 10, row: 3, kind: 'parada' },
      ],
      terrenoDe: terrenoDe({ '10,1': 'dificil', '10,2': 'dificil' }),
      cfg: CFG,
      meios: ['A pé'],
    })
    expect(v.passos[1]).toEqual({ dias: 2.5, meio: 'A pé', terreno: 'normal', bloqueado: false })
  })

  it('trilha vazia ou de um hex só = 0', () => {
    expect(calcularViagem({ hexes: [], terrenoDe: () => undefined, cfg: CFG, meios: undefined }).total).toBe(0)
    expect(calcularViagem({ hexes: coluna(0), terrenoDe: () => undefined, cfg: CFG, meios: undefined }).total).toBe(0)
  })
})

describe('formatarDias', () => {
  it('frações simples com glifo; plural acima de 1', () => {
    expect(formatarDias(0.5)).toBe('½ dia')
    expect(formatarDias(1)).toBe('1 dia')
    expect(formatarDias(2.5)).toBe('2½ dias')
    expect(formatarDias(1 / 3)).toBe('⅓ dia')
    expect(formatarDias(4 / 3)).toBe('1⅓ dias')
    expect(formatarDias(0.25)).toBe('¼ dia')
    expect(formatarDias(0.2)).toBe('⅕ dia')
    expect(formatarDias(2 / 3)).toBe('⅔ dia')
    expect(formatarDias(3)).toBe('3 dias')
    expect(formatarDias(0)).toBe('0 dias')
  })
  it('fração não simples → uma casa decimal com vírgula', () => {
    expect(formatarDias(1.7)).toBe('1,7 dias')
    expect(formatarDias(0.7)).toBe('0,7 dia') // ½ + ⅕
    expect(formatarDias(1 / 3 + 1 / 5)).toBe('0,5 dia')
  })
})
