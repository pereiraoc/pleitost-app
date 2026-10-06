// VIAGEM DO HEXCRAWL (2026-10-04, regras v2): tempo pra percorrer a trilha do
// grupo, regras do Contexto Fantasia (FM `viagem`, compilado no contexto.json).
// 1 dia de viagem: a pé = 2 hex, cavalo = 3, carruagem = 4, navio = 5.
// Terreno normal = custo ×1, difícil ×2, muito difícil ×3 → tempo por hex =
// custo / hex_por_dia DIAS. Restrições: carruagem só na estrada; cavalo não
// entra em terreno muito difícil; navio só no mar.
// Custo: cada PASSO do hex i pro i+1 custa o terreno do hex ENTRADO (o de
// partida não conta). Hexes não adjacentes na trilha são ligados pela linha
// hex mais curta (cada hex do meio também é entrado). UM MEIO POR TRECHO
// (2026-10-06): a parada de chegada guarda o meio escolhido (`meio`); em cada
// hex do trecho ele vale onde anda, senão cai no AUTOMÁTICO (o mais rápido
// entre o básico A pé + os `padrao`). Sem meio possível → bloqueado.
import { describe, expect, it } from 'vitest'
import {
  calcularViagem,
  custoHex,
  formatarDias,
  hexDistance,
  hexLine,
  custoHexNoTrecho,
  meioDoTrecho,
  meiosAutomaticos,
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
    { nome: 'A pé', icone: '🚶', hexPorDia: 2, em: ['estrada', 'normal', 'dificil', 'muito_dificil'] },
    { nome: 'Cavalo', icone: '🐎', hexPorDia: 3, em: ['estrada', 'normal', 'dificil'] },
    { nome: 'Carruagem', icone: '🛞', hexPorDia: 4, em: ['estrada'] },
    { nome: 'Navio', icone: '⛵', hexPorDia: 5, em: ['mar'] },
  ],
}

/** Como a config real da Fantasia: a pé + carruagem + navio são `padrao`. */
const CFG_PADRAO: ViagemCfg = {
  ...CFG,
  meios: CFG.meios.map((m) => ({ ...m, padrao: m.nome !== 'Cavalo' })),
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

/** Grava o meio escolhido nas paradas dadas (índice → meio). */
function comMeio<T extends object>(hexes: T[], meios: Record<number, string>): (T & { meio?: string })[] {
  return hexes.map((h, i) => (meios[i] ? { ...h, meio: meios[i] } : h))
}

const terrenoDe = (mapa: Record<string, string>) => (col: number, row: number) => mapa[`${col},${row}`]

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

describe('meiosAutomaticos / escolha por trecho', () => {
  it('automáticos = o básico + os `padrao` da config (a pé, carruagem, navio)', () => {
    expect(meiosAutomaticos(CFG_PADRAO)).toEqual(['A pé', 'Carruagem', 'Navio'])
    expect(meiosAutomaticos(CFG)).toEqual(['A pé'])
  })
  it('padrões: estrada usa Carruagem, mar usa Navio, gramado A pé', () => {
    const v = calcularViagem({
      hexes: coluna(3, { 0: 'parada', 3: 'parada' }),
      terrenoDe: terrenoDe({ '10,1': 'estrada', '10,2': 'mar', '10,3': 'normal' }),
      cfg: CFG_PADRAO,
    })
    expect(v.passos.slice(1).map((p) => p!.meio)).toEqual(['Carruagem', 'Navio', 'A pé'])
    expect(v.bloqueado).toBe(false)
  })
  it('custoHexNoTrecho: escolha vale onde anda; senão automático', () => {
    expect(custoHexNoTrecho('normal', CFG_PADRAO, 'Cavalo')).toEqual({ dias: 1 / 3, meio: 'Cavalo' })
    expect(custoHexNoTrecho('muito_dificil', CFG_PADRAO, 'Cavalo')).toEqual({ dias: 1.5, meio: 'A pé' })
    expect(custoHexNoTrecho('estrada', CFG_PADRAO, 'A pé')).toEqual({ dias: 0.5, meio: 'A pé' })
    expect(custoHexNoTrecho('estrada', CFG_PADRAO, undefined)).toEqual({ dias: 0.25, meio: 'Carruagem' })
    expect(custoHexNoTrecho('normal', CFG_PADRAO, 'Dragão')).toEqual({ dias: 0.5, meio: 'A pé' })
  })
  it('meioDoTrecho: o meio da parada de chegada; antes da 1ª e após a última parada, nenhum', () => {
    const hexes = comMeio(coluna(4, { 0: 'parada', 2: 'parada' }), { 2: 'Cavalo', 0: 'Navio' })
    expect(meioDoTrecho(hexes, 1)).toBe('Cavalo')
    expect(meioDoTrecho(hexes, 2)).toBe('Cavalo')
    expect(meioDoTrecho(hexes, 3)).toBeUndefined()
    // caminho antes da 1ª parada não está em trecho nenhum
    const lead = comMeio(coluna(3, { 2: 'parada', 3: 'parada' }), { 2: 'Cavalo', 3: 'Navio' })
    expect(meioDoTrecho(lead, 1)).toBeUndefined()
    expect(meioDoTrecho(lead, 3)).toBe('Navio')
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

  it('soma o terreno de cada hex ENTRADO; partida não conta', () => {
    const v = calcularViagem({
      hexes: coluna(3, { 0: 'parada', 3: 'parada' }),
      terrenoDe: terrenoDe({ '10,1': 'estrada', '10,2': 'dificil', '10,3': 'muito_dificil' }),
      cfg: CFG,
    })
    expect(v.total).toBe(0.5 + 1 + 1.5)
    expect(v.bloqueado).toBe(false)
  })

  it('soma exata de terços (cavalo: 3 hex de gramado = 1 dia, sem 0,999…)', () => {
    const v = calcularViagem({
      hexes: comMeio(coluna(3, { 0: 'parada', 3: 'parada' }), { 3: 'Cavalo' }),
      terrenoDe: () => undefined,
      cfg: CFG,
    })
    expect(v.total).toBe(1)
    expect(formatarDias(v.total)).toBe('1 dia')
  })

  it('Carruagem escolhida: estrada de carruagem, gramado cai no automático (a pé)', () => {
    const v = calcularViagem({
      hexes: comMeio(coluna(3, { 0: 'parada', 3: 'parada' }), { 3: 'Carruagem' }),
      terrenoDe: terrenoDe({ '10,1': 'estrada', '10,2': 'estrada' }),
      cfg: CFG_PADRAO,
    })
    // ¼ + ¼ + ½ (gramado a pé) = 1
    expect(v.total).toBe(1)
    const t = v.trechos.get(3)!
    expect(t.escolhido).toBe('Carruagem')
    expect(t.meios).toEqual(['Carruagem', 'A pé'])
    expect(t.partes).toEqual([
      { meio: 'Carruagem', dias: 0.5 },
      { meio: 'A pé', dias: 0.5, terrenos: ['normal'] },
    ])
  })

  it('Cavalo escolhido num trecho de gramado: ⅓ por hex em vez de ½', () => {
    const hexes = coluna(2, { 0: 'parada', 2: 'parada' })
    expect(calcularViagem({ hexes, terrenoDe: () => undefined, cfg: CFG_PADRAO }).trechos.get(2)!.dias).toBe(1)
    const v = calcularViagem({ hexes: comMeio(hexes, { 2: 'Cavalo' }), terrenoDe: () => undefined, cfg: CFG_PADRAO })
    expect(v.trechos.get(2)!.dias).toBe(2 / 3)
    expect(v.trechos.get(2)!.meios).toEqual(['Cavalo'])
  })

  it('Navio escolhido num trecho em terra: automático em tudo (a pé), sem bloquear', () => {
    const v = calcularViagem({
      hexes: comMeio(coluna(2, { 0: 'parada', 2: 'parada' }), { 2: 'Navio' }),
      terrenoDe: () => undefined,
      cfg: CFG_PADRAO,
    })
    const t = v.trechos.get(2)!
    expect(t.dias).toBe(1)
    expect(t.meios).toEqual(['A pé'])
    expect(t.partes).toEqual([{ meio: 'A pé', dias: 1, terrenos: ['normal'] }])
    expect(v.bloqueado).toBe(false)
  })

  it('2026-10-06: caminho DEPOIS da última parada não conta (sem passo, fora do total)', () => {
    const v = calcularViagem({
      hexes: comMeio(coluna(4, { 0: 'parada', 2: 'parada' }), { 2: 'Cavalo' }),
      terrenoDe: () => undefined,
      cfg: CFG_PADRAO,
    })
    expect(v.passos.slice(1).map((p) => p?.meio ?? null)).toEqual(['Cavalo', 'Cavalo', null, null])
    expect(v.total).toBe(2 / 3)
    expect([...v.trechos.keys()]).toEqual([2])
  })

  it('2026-10-06: caminho ANTES da 1ª parada não conta; a 1ª parada não tem trecho', () => {
    const v = calcularViagem({
      hexes: comMeio(coluna(4, { 2: 'parada', 4: 'parada' }), { 2: 'Cavalo', 4: 'Cavalo' }),
      terrenoDe: () => undefined,
      cfg: CFG_PADRAO,
    })
    expect(v.trechos.has(2)).toBe(false)
    expect([...v.trechos.keys()]).toEqual([4])
    expect(v.passos.slice(0, 3)).toEqual([null, null, null])
    expect(v.total).toBe(2 / 3) // só 2→3→4 (a cavalo)
    // só caminho + uma parada: nada a somar
    const s = calcularViagem({ hexes: coluna(2, { 2: 'parada' }), terrenoDe: () => undefined, cfg: CFG_PADRAO })
    expect(s.total).toBe(0)
    expect(s.trechos.size).toBe(0)
  })

  it('bloqueio fora de um trecho (antes/depois das paradas) não conta', () => {
    const v = calcularViagem({
      hexes: coluna(4, { 1: 'parada', 3: 'parada' }),
      terrenoDe: terrenoDe({ '10,1': 'mar', '10,4': 'mar' }),
      cfg: CFG,
    })
    expect(v.bloqueado).toBe(false)
    expect(v.total).toBe(1)
  })

  it('nome desconhecido = automático', () => {
    const d = calcularViagem({
      hexes: comMeio(coluna(2, { 0: 'parada', 2: 'parada' }), { 2: 'Dragão' }),
      terrenoDe: () => undefined,
      cfg: CFG_PADRAO,
    })
    expect(d.trechos.get(2)!.dias).toBe(1)
    expect(d.trechos.get(2)!.escolhido).toBeUndefined()
  })

  it('buraco entre hexes não adjacentes é preenchido pela linha', () => {
    const v = calcularViagem({
      hexes: [
        { id: 'a', col: 10, row: 0, kind: 'parada' },
        { id: 'b', col: 10, row: 3, kind: 'parada' },
      ],
      terrenoDe: terrenoDe({ '10,1': 'dificil', '10,2': 'dificil' }),
      cfg: CFG,
    })
    // entra 10,1 (1) + 10,2 (1) + 10,3 (padrão ½)
    expect(v.total).toBe(2.5)
  })

  it('segmentos começam numa parada e somam os passos que saem dela', () => {
    const v = calcularViagem({
      hexes: comMeio(coluna(4, { 0: 'parada', 2: 'parada', 4: 'parada' }), { 2: 'Cavalo', 4: 'Cavalo' }),
      terrenoDe: () => undefined,
      cfg: CFG,
    })
    expect(v.segmentos.map((s) => [s.inicio, s.dias])).toEqual([
      [0, 2 / 3], // 0→1→2: 2 × gramado a cavalo (⅓)
      [2, 2 / 3], // 2→3→4
      [4, 0],
    ])
    expect(v.total).toBe(4 / 3)
  })

  it('caminho antes da primeira parada vira segmento sem cabeçalho (inicio 0) que não soma', () => {
    const v = calcularViagem({
      hexes: coluna(3, { 1: 'parada', 3: 'parada' }),
      terrenoDe: () => undefined,
      cfg: CFG,
    })
    expect(v.segmentos.map((s) => [s.inicio, s.dias])).toEqual([
      [0, 0],
      [1, 1],
      [3, 0],
    ])
  })

  it('mar sem navio automático bloqueia e aponta o hex; com navio padrão, ⅕ dia', () => {
    const hexes = comMeio(coluna(2, { 0: 'parada', 2: 'parada' }), { 2: 'Cavalo' })
    const v = calcularViagem({ hexes, terrenoDe: terrenoDe({ '10,2': 'mar' }), cfg: CFG })
    expect(v.bloqueado).toBe(true)
    expect(v.segmentos[0]!.bloqueios).toEqual([{ col: 10, row: 2, terreno: 'mar' }])
    expect(v.total).toBe(1 / 3) // o passo possível (gramado a cavalo) segue contando
    const n = calcularViagem({ hexes, terrenoDe: terrenoDe({ '10,2': 'mar' }), cfg: CFG_PADRAO })
    expect(n.bloqueado).toBe(false)
    expect(n.total).toBeCloseTo(1 / 3 + 1 / 5, 12)
    expect(n.trechos.get(2)!.partes).toEqual([
      { meio: 'Cavalo', dias: 1 / 3 },
      { meio: 'Navio', dias: 1 / 5, terrenos: ['mar'] },
    ])
  })

  it('custo não inteiro na config ainda soma (float)', () => {
    const cfg: ViagemCfg = { ...CFG, terrenos: [{ chave: 'normal', nome: 'Gramado', custo: 1.5 }] }
    const v = calcularViagem({ hexes: coluna(2, { 0: 'parada', 2: 'parada' }), terrenoDe: () => undefined, cfg })
    expect(v.total).toBeCloseTo(1.5, 12)
  })

  it('passos por índice: custo pra ENTRAR em cada hex (meio, terreno), somando o segmento', () => {
    const v = calcularViagem({
      hexes: comMeio(coluna(4, { 0: 'parada', 3: 'parada' }), { 3: 'Cavalo' }),
      terrenoDe: terrenoDe({ '10,1': 'estrada', '10,2': 'dificil', '10,4': 'mar' }),
      cfg: CFG,
    })
    expect(v.passos).toHaveLength(5)
    expect(v.passos[0]).toBeNull() // partida não custa
    expect(v.passos[1]).toEqual({ dias: 1 / 3, meio: 'Cavalo', meios: ['Cavalo'], terreno: 'estrada', bloqueado: false })
    expect(v.passos[2]).toEqual({ dias: 2 / 3, meio: 'Cavalo', meios: ['Cavalo'], terreno: 'dificil', bloqueado: false })
    expect(v.passos[3]).toEqual({ dias: 1 / 3, meio: 'Cavalo', meios: ['Cavalo'], terreno: 'normal', bloqueado: false })
    expect(v.passos[4]).toBeNull() // depois da última parada: fora de trecho
    // o segmento da parada 0 soma os passos 1..3 (até entrar na parada 3)
    const soma = [1, 2, 3].reduce((a, i) => a + (v.passos[i]!.dias ?? 0), 0)
    expect(soma).toBeCloseTo(v.segmentos[0]!.dias, 12)
    expect(v.segmentos[1]!.bloqueios).toHaveLength(0)
    expect(v.bloqueado).toBe(false)
  })

  it('passo com buraco soma a linha inteira até o hex de chegada', () => {
    const v = calcularViagem({
      hexes: [
        { id: 'a', col: 10, row: 0, kind: 'parada' },
        { id: 'b', col: 10, row: 3, kind: 'parada' },
      ],
      terrenoDe: terrenoDe({ '10,1': 'dificil', '10,2': 'dificil' }),
      cfg: CFG,
    })
    expect(v.passos[1]).toEqual({ dias: 2.5, meio: 'A pé', meios: ['A pé'], terreno: 'normal', bloqueado: false })
  })

  it('trechos por PARADA DE CHEGADA: soma desde a parada anterior, meios em ordem e por meio', () => {
    // 0 parada · 1 mar · 2 mar · 3 normal (parada) · 4 estrada (parada) · 5 normal (caminho, fim)
    const v = calcularViagem({
      hexes: coluna(5, { 0: 'parada', 3: 'parada', 4: 'parada' }),
      terrenoDe: terrenoDe({ '10,1': 'mar', '10,2': 'mar', '10,4': 'estrada' }),
      cfg: CFG_PADRAO,
    })
    expect(v.trechos.has(0)).toBe(false) // 1ª linha: nada
    const t3 = v.trechos.get(3)!
    expect(t3.dias).toBeCloseTo(2 / 5 + 1 / 2, 12)
    expect(t3.meios).toEqual(['Navio', 'A pé'])
    expect(t3.partes).toEqual([
      { meio: 'Navio', dias: 2 / 5 },
      { meio: 'A pé', dias: 1 / 2 },
    ])
    expect(t3.bloqueios).toEqual([])
    expect(v.trechos.get(4)!.meios).toEqual(['Carruagem'])
    expect(v.trechos.get(4)!.dias).toBe(0.25)
    // caminho depois da última parada não vira trecho
    expect([...v.trechos.keys()]).toEqual([3, 4])
  })

  it('1ª parada depois de caminho não tem trecho (o caminho antes não conta)', () => {
    const v = calcularViagem({
      hexes: coluna(2, { 2: 'parada' }),
      terrenoDe: () => undefined,
      cfg: CFG_PADRAO,
    })
    expect(v.trechos.has(2)).toBe(false)
    expect(v.total).toBe(0)
  })

  it('trecho bloqueado reporta hex e terreno', () => {
    const v = calcularViagem({
      hexes: coluna(2, { 0: 'parada', 2: 'parada' }),
      terrenoDe: terrenoDe({ '10,1': 'mar' }),
      cfg: CFG,
    })
    expect(v.trechos.get(2)!.bloqueios).toEqual([{ col: 10, row: 1, terreno: 'mar' }])
  })

  it('trilha vazia ou de um hex só = 0', () => {
    expect(calcularViagem({ hexes: [], terrenoDe: () => undefined, cfg: CFG }).total).toBe(0)
    expect(calcularViagem({ hexes: coluna(0), terrenoDe: () => undefined, cfg: CFG }).total).toBe(0)
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
