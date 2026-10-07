// VIAGEM DO HEXCRAWL (regras v3, 2026-10-06): tempo pra percorrer a trilha do
// grupo, regras do Contexto Fantasia (FM `viagem`, compilado no contexto.json).
// 1 dia de viagem: a pé = 2 hex, cavalo = 3, caravana = 4, barco = 5.
// Terreno: normal ×1, difícil ×2 (floresta, deserto da Pedra Fina), muito
// difícil ×3 (montanha), mar ×3 — mas ×1 pro Barco (`custoPorMeio`).
// ROTAS (camada separada sobre o terreno): `estrada` dá +1 hex/dia a Cavalo e
// Caravana; `rota_maritima` dá +1 hex/dia ao Barco. Onde cada meio anda: a pé
// em toda terra; cavalo no normal e difícil; caravana SÓ em hex com estrada;
// barco no mar. COSTA: passo entre terra e mar (embarcar/desembarcar) só de
// Barco ou A pé — o Barco paga pelo hex de mar (×1, + rota marítima dele), o
// A pé pelo hex em que entra (mar ×3 / terreno da terra). Mar → mar só de
// barco. Nomes antigos (Carruagem, Navio) valem pelos novos (`antigos`).
// Custo: cada PASSO do hex i pro i+1 custa o hex ENTRADO. Hexes não adjacentes
// são ligados pela linha hex. UM MEIO POR TRECHO + ajuste por item; o que não
// faz o passo cai no AUTOMÁTICO (o mais rápido entre A pé + os `padrao`).
import { describe, expect, it } from 'vitest'
import {
  calcularViagem,
  custoHex,
  formatarDias,
  hexDistance,
  hexLine,
  custoHexNoTrecho,
  iconeDoMeio,
  meioDoTrecho,
  meiosAutomaticos,
  resolverMeio,
  ondeAnda,
  type ViagemCfg,
} from '../src/grupo/viagem'

/** Como a config real da Fantasia: a pé + caravana + barco são `padrao`. */
const CFG: ViagemCfg = {
  padrao: 'normal',
  terrenos: [
    { chave: 'normal', nome: 'Gramado', custo: 1 },
    { chave: 'dificil', nome: 'Difícil', custo: 2 },
    { chave: 'muito_dificil', nome: 'Montanha', custo: 3 },
    { chave: 'mar', nome: 'Mar', custo: 3, agua: true, custoPorMeio: { Barco: 1 } },
  ],
  rotas: [
    { chave: 'estrada', nome: 'Estrada', bonus: 1, meios: ['Cavalo', 'Caravana'] },
    { chave: 'rota_maritima', nome: 'Rota marítima', bonus: 1, meios: ['Barco'] },
  ],
  meios: [
    { nome: 'A pé', icone: '🚶', padrao: true, hexPorDia: 2, em: ['normal', 'dificil', 'muito_dificil'], costa: true },
    { nome: 'Cavalo', icone: '🐎', hexPorDia: 3, em: ['normal', 'dificil'] },
    {
      nome: 'Caravana',
      icone: '🛞',
      padrao: true,
      hexPorDia: 4,
      em: ['normal', 'dificil', 'muito_dificil'],
      soEmRota: 'estrada',
      antigos: ['Carruagem'],
    },
    { nome: 'Barco', icone: '⛵', padrao: true, hexPorDia: 5, em: ['mar'], costa: true, antigos: ['Navio'] },
  ],
}

/** Sem `padrao` além do básico: o automático é só A pé. */
const CFG_BASE: ViagemCfg = { ...CFG, meios: CFG.meios.map((m) => ({ ...m, padrao: false })) }

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

const mapaDe = (mapa: Record<string, string>) => (col: number, row: number) => mapa[`${col},${row}`]
const terrenoDe = mapaDe

const N = { terreno: 'normal' }
const MAR = { terreno: 'mar' }

describe('custoHex (um passo, com o hex de onde se sai)', () => {
  it('a pé: normal ½, difícil 1, montanha 1½; estrada não acelera quem anda a pé', () => {
    expect(custoHex(N, CFG, ['A pé'])).toEqual({ dias: 0.5, meio: 'A pé' })
    expect(custoHex({ terreno: 'dificil' }, CFG, ['A pé'])).toEqual({ dias: 1, meio: 'A pé' })
    expect(custoHex({ terreno: 'muito_dificil' }, CFG, ['A pé'])).toEqual({ dias: 1.5, meio: 'A pé' })
    expect(custoHex({ terreno: 'normal', rota: 'estrada' }, CFG, ['A pé'])).toEqual({ dias: 0.5, meio: 'A pé' })
  })
  it('cavalo: ⅓ no normal, ⅔ no difícil; montanha e mar não (cai no A pé / bloqueia)', () => {
    expect(custoHex(N, CFG, ['A pé', 'Cavalo'])).toEqual({ dias: 1 / 3, meio: 'Cavalo' })
    expect(custoHex({ terreno: 'dificil' }, CFG, ['A pé', 'Cavalo'])).toEqual({ dias: 2 / 3, meio: 'Cavalo' })
    expect(custoHex({ terreno: 'muito_dificil' }, CFG, ['A pé', 'Cavalo'])).toEqual({ dias: 1.5, meio: 'A pé' })
    expect(custoHex(MAR, CFG, ['Cavalo'], MAR)).toEqual({ dias: null, meio: null })
  })
  it('estrada: +1 hex/dia pro cavalo (¼ no normal, ½ no difícil) — o multiplicador do terreno fica', () => {
    expect(custoHex({ terreno: 'normal', rota: 'estrada' }, CFG, ['Cavalo'])).toEqual({ dias: 0.25, meio: 'Cavalo' })
    expect(custoHex({ terreno: 'dificil', rota: 'estrada' }, CFG, ['Cavalo'])).toEqual({ dias: 0.5, meio: 'Cavalo' })
  })
  it('caravana SÓ em hex com estrada (+1: ⅕ normal, ⅖ difícil, ⅗ montanha); fora dela não anda', () => {
    expect(custoHex({ terreno: 'normal', rota: 'estrada' }, CFG, ['Caravana'])).toEqual({ dias: 0.2, meio: 'Caravana' })
    expect(custoHex({ terreno: 'dificil', rota: 'estrada' }, CFG, ['Caravana'])).toEqual({ dias: 0.4, meio: 'Caravana' })
    expect(custoHex({ terreno: 'muito_dificil', rota: 'estrada' }, CFG, ['Caravana']).dias).toBeCloseTo(0.6, 12)
    expect(custoHex(N, CFG, ['Caravana'])).toEqual({ dias: null, meio: null })
    expect(custoHex(N, CFG, ['A pé', 'Caravana'])).toEqual({ dias: 0.5, meio: 'A pé' })
    // rota marítima não é estrada
    expect(custoHex({ terreno: 'normal', rota: 'rota_maritima' }, CFG, ['Caravana']).dias).toBeNull()
  })
  it('mar → mar: só de barco (×1 = ⅕; rota marítima +1 = ⅙); estrada não acelera barco', () => {
    expect(custoHex(MAR, CFG, ['Barco'], MAR)).toEqual({ dias: 0.2, meio: 'Barco' })
    expect(custoHex({ terreno: 'mar', rota: 'rota_maritima' }, CFG, ['Barco'], MAR)).toEqual({ dias: 1 / 6, meio: 'Barco' })
    expect(custoHex({ terreno: 'mar', rota: 'estrada' }, CFG, ['Barco'], MAR)).toEqual({ dias: 0.2, meio: 'Barco' })
    expect(custoHex(MAR, CFG, ['A pé', 'Cavalo', 'Caravana'], MAR)).toEqual({ dias: null, meio: null })
  })
  it('COSTA, embarcar (terra → mar): de barco (⅕, ⅙ com rota no mar) ou a pé (mar ×3 = 1½); cavalo/caravana não', () => {
    expect(custoHex(MAR, CFG, ['Barco'], N)).toEqual({ dias: 0.2, meio: 'Barco' })
    expect(custoHex({ terreno: 'mar', rota: 'rota_maritima' }, CFG, ['Barco'], N)).toEqual({ dias: 1 / 6, meio: 'Barco' })
    expect(custoHex(MAR, CFG, ['A pé'], N)).toEqual({ dias: 1.5, meio: 'A pé' })
    expect(custoHex(MAR, CFG, ['A pé', 'Barco'], N)).toEqual({ dias: 0.2, meio: 'Barco' })
    expect(custoHex(MAR, CFG, ['Cavalo'], N)).toEqual({ dias: null, meio: null })
    expect(custoHex(MAR, CFG, ['Caravana'], { terreno: 'normal', rota: 'estrada' })).toEqual({ dias: null, meio: null })
  })
  it('COSTA, desembarcar (mar → terra): barco paga o hex de mar; a pé paga a terra; cavalo/caravana não', () => {
    const marRota = { terreno: 'mar', rota: 'rota_maritima' }
    expect(custoHex({ terreno: 'dificil' }, CFG, ['Barco'], marRota)).toEqual({ dias: 1 / 6, meio: 'Barco' })
    expect(custoHex({ terreno: 'dificil' }, CFG, ['Barco'], MAR)).toEqual({ dias: 0.2, meio: 'Barco' })
    expect(custoHex({ terreno: 'dificil' }, CFG, ['A pé'], MAR)).toEqual({ dias: 1, meio: 'A pé' })
    expect(custoHex(N, CFG, ['Cavalo'], MAR)).toEqual({ dias: null, meio: null })
    expect(custoHex({ terreno: 'normal', rota: 'estrada' }, CFG, ['Caravana'], MAR)).toEqual({ dias: null, meio: null })
  })
  it('barco não anda em terra fora da costa', () => {
    expect(custoHex(N, CFG, ['Barco'], N)).toEqual({ dias: null, meio: null })
  })
  it('terreno desconhecido/ausente usa o padrão; rota desconhecida é ignorada', () => {
    expect(custoHex({}, CFG, ['A pé']).dias).toBe(0.5)
    expect(custoHex({ terreno: 'lava' }, CFG, ['A pé']).dias).toBe(0.5)
    expect(custoHex({ terreno: 'normal', rota: 'trilho' }, CFG, ['Cavalo']).dias).toBe(1 / 3)
  })
  it('automático = o mais rápido em DIAS (bônus de rota e custo por meio contam)', () => {
    const auto = meiosAutomaticos(CFG)
    expect(custoHex({ terreno: 'normal', rota: 'estrada' }, CFG, auto)).toEqual({ dias: 0.2, meio: 'Caravana' })
    expect(custoHex(N, CFG, auto)).toEqual({ dias: 0.5, meio: 'A pé' })
    expect(custoHex(MAR, CFG, auto, N)).toEqual({ dias: 0.2, meio: 'Barco' })
    expect(custoHex(N, CFG, auto, MAR)).toEqual({ dias: 0.2, meio: 'Barco' })
  })
})

describe('meios: automáticos, nomes antigos, escolha', () => {
  it('automáticos = o básico + os `padrao` da config (a pé, caravana, barco)', () => {
    expect(meiosAutomaticos(CFG)).toEqual(['A pé', 'Caravana', 'Barco'])
    expect(meiosAutomaticos(CFG_BASE)).toEqual(['A pé'])
  })
  it('nomes antigos (Carruagem, Navio) resolvem pros novos; desconhecido = nenhum', () => {
    expect(resolverMeio(CFG, 'Carruagem')).toBe('Caravana')
    expect(resolverMeio(CFG, 'Navio')).toBe('Barco')
    expect(resolverMeio(CFG, 'Barco')).toBe('Barco')
    expect(resolverMeio(CFG, 'Dragão')).toBeUndefined()
    expect(resolverMeio(CFG, undefined)).toBeUndefined()
    expect(iconeDoMeio(CFG, 'Navio')).toBe('⛵')
    expect(iconeDoMeio(CFG, 'Carruagem')).toBe('🛞')
  })
  it('ondeAnda: rótulos da config — a rota exigida (Caravana) ou os terrenos', () => {
    expect(ondeAnda(CFG, 'Caravana')).toBe('Estrada')
    expect(ondeAnda(CFG, 'Cavalo')).toBe('Gramado, Difícil')
    expect(ondeAnda(CFG, 'Navio')).toBe('Mar')
    expect(ondeAnda(CFG, 'Dragão')).toBe('')
  })
  it('custoHexNoTrecho: escolha vale onde faz o passo; senão automático', () => {
    const estrada = { terreno: 'normal', rota: 'estrada' }
    expect(custoHexNoTrecho(N, CFG, 'Cavalo')).toEqual({ dias: 1 / 3, meio: 'Cavalo' })
    expect(custoHexNoTrecho({ terreno: 'muito_dificil' }, CFG, 'Cavalo')).toEqual({ dias: 1.5, meio: 'A pé' })
    expect(custoHexNoTrecho(estrada, CFG, 'A pé')).toEqual({ dias: 0.5, meio: 'A pé' })
    expect(custoHexNoTrecho(estrada, CFG, undefined)).toEqual({ dias: 0.2, meio: 'Caravana' })
    expect(custoHexNoTrecho(estrada, CFG, 'Carruagem')).toEqual({ dias: 0.2, meio: 'Caravana' })
    expect(custoHexNoTrecho(N, CFG, 'Dragão')).toEqual({ dias: 0.5, meio: 'A pé' })
    expect(custoHexNoTrecho(MAR, CFG, 'A pé', N)).toEqual({ dias: 1.5, meio: 'A pé' })
  })
  it('meioDoTrecho: o meio da parada de chegada; antes da 1ª e após a última parada, nenhum', () => {
    const hexes = comMeio(coluna(4, { 0: 'parada', 2: 'parada' }), { 2: 'Cavalo', 0: 'Barco' })
    expect(meioDoTrecho(hexes, 1)).toBe('Cavalo')
    expect(meioDoTrecho(hexes, 2)).toBe('Cavalo')
    expect(meioDoTrecho(hexes, 3)).toBeUndefined()
    const lead = comMeio(coluna(3, { 2: 'parada', 3: 'parada' }), { 2: 'Cavalo', 3: 'Barco' })
    expect(meioDoTrecho(lead, 1)).toBeUndefined()
    expect(meioDoTrecho(lead, 3)).toBe('Barco')
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
  it('padrões: estrada → Caravana, embarque/mar/desembarque → Barco', () => {
    const v = calcularViagem({
      hexes: coluna(4, { 0: 'parada', 4: 'parada' }),
      terrenoDe: terrenoDe({ '10,2': 'mar', '10,3': 'mar' }),
      rotaDe: mapaDe({ '10,1': 'estrada' }),
      cfg: CFG,
    })
    expect(v.passos.slice(1).map((p) => p!.meio)).toEqual(['Caravana', 'Barco', 'Barco', 'Barco'])
    expect(v.total).toBe(4 / 5)
    expect(v.bloqueado).toBe(false)
  })

  it('soma o terreno de cada hex ENTRADO; partida não conta', () => {
    const v = calcularViagem({
      hexes: coluna(3, { 0: 'parada', 3: 'parada' }),
      terrenoDe: terrenoDe({ '10,2': 'dificil', '10,3': 'muito_dificil' }),
      cfg: CFG_BASE,
    })
    expect(v.total).toBe(0.5 + 1 + 1.5)
    expect(v.bloqueado).toBe(false)
  })

  it('soma exata de terços (cavalo: 3 hex de gramado = 1 dia, sem 0,999…)', () => {
    const v = calcularViagem({
      hexes: comMeio(coluna(3, { 0: 'parada', 3: 'parada' }), { 3: 'Cavalo' }),
      terrenoDe: () => undefined,
      cfg: CFG_BASE,
    })
    expect(v.total).toBe(1)
    expect(formatarDias(v.total)).toBe('1 dia')
  })

  it('Caravana escolhida: na estrada de caravana, fora dela cai no automático (a pé)', () => {
    const v = calcularViagem({
      hexes: comMeio(coluna(3, { 0: 'parada', 3: 'parada' }), { 3: 'Caravana' }),
      terrenoDe: () => undefined,
      rotaDe: mapaDe({ '10,1': 'estrada', '10,2': 'estrada' }),
      cfg: CFG,
    })
    expect(v.total).toBe(0.2 + 0.2 + 0.5)
    const t = v.trechos.get(3)!
    expect(t.escolhido).toBe('Caravana')
    expect(t.meios).toEqual(['Caravana', 'A pé'])
    expect(t.partes).toEqual([
      { meio: 'Caravana', dias: 0.4 },
      { meio: 'A pé', dias: 0.5, terrenos: ['normal'] },
    ])
  })

  it('nome antigo gravado (Carruagem) vale como Caravana', () => {
    const v = calcularViagem({
      hexes: comMeio(coluna(1, { 0: 'parada', 1: 'parada' }), { 1: 'Carruagem' }),
      terrenoDe: () => undefined,
      rotaDe: mapaDe({ '10,1': 'estrada' }),
      cfg: CFG_BASE,
    })
    expect(v.trechos.get(1)!.escolhido).toBe('Caravana')
    expect(v.passos[1]!.meio).toBe('Caravana')
    expect(v.total).toBe(0.2)
  })

  it('Cavalo escolhido: ⅓ por hex no gramado, ¼ na estrada', () => {
    const hexes = coluna(2, { 0: 'parada', 2: 'parada' })
    expect(calcularViagem({ hexes, terrenoDe: () => undefined, cfg: CFG }).trechos.get(2)!.dias).toBe(1)
    const v = calcularViagem({ hexes: comMeio(hexes, { 2: 'Cavalo' }), terrenoDe: () => undefined, cfg: CFG })
    expect(v.trechos.get(2)!.dias).toBe(2 / 3)
    expect(v.trechos.get(2)!.meios).toEqual(['Cavalo'])
    const e = calcularViagem({
      hexes: comMeio(hexes, { 2: 'Cavalo' }),
      terrenoDe: () => undefined,
      rotaDe: () => 'estrada',
      cfg: CFG_BASE,
    })
    expect(e.trechos.get(2)!.dias).toBe(0.5)
  })

  it('Barco escolhido num trecho em terra: automático em tudo (a pé), sem bloquear', () => {
    const v = calcularViagem({
      hexes: comMeio(coluna(2, { 0: 'parada', 2: 'parada' }), { 2: 'Barco' }),
      terrenoDe: () => undefined,
      cfg: CFG,
    })
    const t = v.trechos.get(2)!
    expect(t.dias).toBe(1)
    expect(t.meios).toEqual(['A pé'])
    expect(t.partes).toEqual([{ meio: 'A pé', dias: 1, terrenos: ['normal'] }])
    expect(v.bloqueado).toBe(false)
  })

  it('travessia: rota marítima acelera o barco (⅙) — embarque usa o hex de mar, desembarque também', () => {
    // 0 normal (parada) · 1 mar+rota · 2 mar+rota · 3 mar · 4 normal (parada)
    const v = calcularViagem({
      hexes: coluna(4, { 0: 'parada', 4: 'parada' }),
      terrenoDe: terrenoDe({ '10,1': 'mar', '10,2': 'mar', '10,3': 'mar' }),
      rotaDe: mapaDe({ '10,1': 'rota_maritima', '10,2': 'rota_maritima' }),
      cfg: CFG,
    })
    expect(v.passos.slice(1).map((p) => p!.dias)).toEqual([1 / 6, 1 / 6, 1 / 5, 1 / 5])
    expect(v.total).toBe(11 / 15)
    expect(v.passos[1]!.rota).toBe('rota_maritima')
    expect(v.passos[4]!.rota).toBeUndefined()
  })

  it('A pé escolhido na travessia: embarca a pé (1½), mar→mar cai no barco, desembarca a pé (½)', () => {
    const v = calcularViagem({
      hexes: comMeio(coluna(3, { 0: 'parada', 3: 'parada' }), { 3: 'A pé' }),
      terrenoDe: terrenoDe({ '10,1': 'mar', '10,2': 'mar' }),
      cfg: CFG,
    })
    expect(v.passos.slice(1).map((p) => p!.meio)).toEqual(['A pé', 'Barco', 'A pé'])
    expect(v.total).toBeCloseTo(1.5 + 0.2 + 0.5, 12)
    expect(v.trechos.get(3)!.partes).toEqual([
      { meio: 'A pé', dias: 2 },
      { meio: 'Barco', dias: 0.2, terrenos: ['mar'] },
    ])
  })

  it('sem barco no automático, mar → mar bloqueia (a pé só faz o passo da costa)', () => {
    const v = calcularViagem({
      hexes: comMeio(coluna(3, { 0: 'parada', 3: 'parada' }), { 3: 'Cavalo' }),
      terrenoDe: terrenoDe({ '10,1': 'mar', '10,2': 'mar' }),
      cfg: CFG_BASE,
    })
    expect(v.passos.slice(1).map((p) => p!.meio)).toEqual(['A pé', null, 'A pé'])
    expect(v.bloqueado).toBe(true)
    expect(v.trechos.get(3)!.bloqueios).toEqual([{ col: 10, row: 2, terreno: 'mar' }])
    expect(v.total).toBe(2) // 1½ embarcando a pé + ½ desembarcando
  })

  it('2026-10-06: caminho DEPOIS da última parada não conta (sem passo, fora do total)', () => {
    const v = calcularViagem({
      hexes: comMeio(coluna(4, { 0: 'parada', 2: 'parada' }), { 2: 'Cavalo' }),
      terrenoDe: () => undefined,
      cfg: CFG,
    })
    expect(v.passos.slice(1).map((p) => p?.meio ?? null)).toEqual(['Cavalo', 'Cavalo', null, null])
    expect(v.total).toBe(2 / 3)
    expect([...v.trechos.keys()]).toEqual([2])
  })

  it('2026-10-06: caminho ANTES da 1ª parada não conta; a 1ª parada não tem trecho', () => {
    const v = calcularViagem({
      hexes: comMeio(coluna(4, { 2: 'parada', 4: 'parada' }), { 2: 'Cavalo', 4: 'Cavalo' }),
      terrenoDe: () => undefined,
      cfg: CFG,
    })
    expect(v.trechos.has(2)).toBe(false)
    expect([...v.trechos.keys()]).toEqual([4])
    expect(v.passos.slice(0, 3)).toEqual([null, null, null])
    expect(v.total).toBe(2 / 3)
    const s = calcularViagem({ hexes: coluna(2, { 2: 'parada' }), terrenoDe: () => undefined, cfg: CFG })
    expect(s.total).toBe(0)
    expect(s.trechos.size).toBe(0)
  })

  it('bloqueio fora de um trecho (antes/depois das paradas) não conta', () => {
    const v = calcularViagem({
      hexes: coluna(4, { 1: 'parada', 3: 'parada' }),
      terrenoDe: terrenoDe({ '10,0': 'mar', '10,1': 'mar', '10,4': 'mar' }),
      cfg: CFG_BASE,
    })
    expect(v.bloqueado).toBe(false)
    expect(v.total).toBe(1) // desembarca a pé (½) + gramado (½)
  })

  it('nome desconhecido = automático', () => {
    const d = calcularViagem({
      hexes: comMeio(coluna(2, { 0: 'parada', 2: 'parada' }), { 2: 'Dragão' }),
      terrenoDe: () => undefined,
      cfg: CFG,
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
      cfg: CFG_BASE,
    })
    expect(v.total).toBe(2.5)
    expect(v.passos[1]).toEqual({ dias: 2.5, meio: 'A pé', meios: ['A pé'], terreno: 'normal', bloqueado: false })
  })

  it('segmentos começam numa parada e somam os passos que saem dela', () => {
    const v = calcularViagem({
      hexes: comMeio(coluna(4, { 0: 'parada', 2: 'parada', 4: 'parada' }), { 2: 'Cavalo', 4: 'Cavalo' }),
      terrenoDe: () => undefined,
      cfg: CFG_BASE,
    })
    expect(v.segmentos.map((s) => [s.inicio, s.dias])).toEqual([
      [0, 2 / 3],
      [2, 2 / 3],
      [4, 0],
    ])
    expect(v.total).toBe(4 / 3)
  })

  it('caminho antes da primeira parada vira segmento sem cabeçalho (inicio 0) que não soma', () => {
    const v = calcularViagem({ hexes: coluna(3, { 1: 'parada', 3: 'parada' }), terrenoDe: () => undefined, cfg: CFG_BASE })
    expect(v.segmentos.map((s) => [s.inicio, s.dias])).toEqual([
      [0, 0],
      [1, 1],
      [3, 0],
    ])
  })

  it('custo não inteiro na config ainda soma (float)', () => {
    const cfg: ViagemCfg = { ...CFG_BASE, terrenos: [{ chave: 'normal', nome: 'Gramado', custo: 1.5 }] }
    const v = calcularViagem({ hexes: coluna(2, { 0: 'parada', 2: 'parada' }), terrenoDe: () => undefined, cfg })
    expect(v.total).toBeCloseTo(1.5, 12)
  })

  it('passos por índice: custo pra ENTRAR em cada hex (meio, terreno, rota), somando o segmento', () => {
    const v = calcularViagem({
      hexes: comMeio(coluna(4, { 0: 'parada', 3: 'parada' }), { 3: 'Cavalo' }),
      terrenoDe: terrenoDe({ '10,2': 'dificil', '10,4': 'mar' }),
      rotaDe: mapaDe({ '10,1': 'estrada' }),
      cfg: CFG_BASE,
    })
    expect(v.passos).toHaveLength(5)
    expect(v.passos[0]).toBeNull()
    expect(v.passos[1]).toEqual({ dias: 1 / 4, meio: 'Cavalo', meios: ['Cavalo'], terreno: 'normal', rota: 'estrada', bloqueado: false })
    expect(v.passos[2]).toEqual({ dias: 2 / 3, meio: 'Cavalo', meios: ['Cavalo'], terreno: 'dificil', bloqueado: false })
    expect(v.passos[3]).toEqual({ dias: 1 / 3, meio: 'Cavalo', meios: ['Cavalo'], terreno: 'normal', bloqueado: false })
    expect(v.passos[4]).toBeNull()
    const soma = [1, 2, 3].reduce((a, i) => a + (v.passos[i]!.dias ?? 0), 0)
    expect(soma).toBeCloseTo(v.segmentos[0]!.dias, 12)
    expect(v.bloqueado).toBe(false)
  })

  it('trechos por PARADA DE CHEGADA: soma desde a parada anterior, meios em ordem e por meio', () => {
    // 0 parada · 1 mar · 2 mar · 3 normal (parada) · 4 normal+estrada (parada) · 5 (caminho, fim)
    const v = calcularViagem({
      hexes: coluna(5, { 0: 'parada', 3: 'parada', 4: 'parada' }),
      terrenoDe: terrenoDe({ '10,1': 'mar', '10,2': 'mar' }),
      rotaDe: mapaDe({ '10,4': 'estrada' }),
      cfg: CFG,
    })
    expect(v.trechos.has(0)).toBe(false)
    const t3 = v.trechos.get(3)!
    expect(t3.dias).toBe(3 / 5)
    expect(t3.meios).toEqual(['Barco'])
    expect(t3.partes).toEqual([{ meio: 'Barco', dias: 3 / 5 }])
    expect(t3.bloqueios).toEqual([])
    expect(v.trechos.get(4)!.meios).toEqual(['Caravana'])
    expect(v.trechos.get(4)!.dias).toBe(0.2)
    expect([...v.trechos.keys()]).toEqual([3, 4])
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

// MEIO POR ITEM (2026-10-06, "trecho define, item ajusta"): o seletor do
// trecho grava `meio` na parada de chegada; cada hex do trecho pode ajustar
// SÓ o passo que entra nele com `meioPasso`. Resolução por passo:
// hex.meioPasso ?? parada.meio ?? automático — sempre respeitando o terreno
// (o meio resolvido não anda ali → automático naquele passo).
describe('meioPasso (ajuste por item do trecho)', () => {
  const comPasso = <T extends object>(hexes: T[], m: Record<number, string>) =>
    hexes.map((h, i) => (m[i] ? { ...h, meioPasso: m[i] } : h))

  it('ajuste vale só no passo que entra no hex; o resto segue o trecho', () => {
    const base = comMeio(coluna(3, { 0: 'parada', 3: 'parada' }), { 3: 'Cavalo' })
    const v = calcularViagem({ hexes: comPasso(base, { 2: 'A pé' }), terrenoDe: () => undefined, cfg: CFG })
    expect(v.passos.map((p) => p?.meio ?? null)).toEqual([null, 'Cavalo', 'A pé', 'Cavalo'])
    expect(v.trechos.get(3)!.dias).toBe(7 / 6)
    expect(v.trechos.get(3)!.escolhido).toBe('Cavalo')
    expect(v.passos[2]!.ajuste).toBe('A pé')
    expect(v.passos[1]!.ajuste).toBeUndefined()
  })

  it('ajuste na PARADA de chegada vale só no passo que entra nela', () => {
    const v = calcularViagem({
      hexes: comPasso(coluna(2, { 0: 'parada', 2: 'parada' }), { 2: 'Cavalo' }),
      terrenoDe: () => undefined,
      cfg: CFG,
    })
    expect(v.passos.map((p) => p?.meio ?? null)).toEqual([null, 'A pé', 'Cavalo'])
    expect(v.trechos.get(2)!.escolhido).toBeUndefined()
  })

  it('ajuste que não anda no terreno cai no automático naquele passo', () => {
    const base = comMeio(coluna(2, { 0: 'parada', 2: 'parada' }), { 2: 'Cavalo' })
    const v = calcularViagem({ hexes: comPasso(base, { 1: 'Caravana' }), terrenoDe: () => undefined, cfg: CFG })
    expect(v.passos[1]!.meio).toBe('A pé')
    expect(v.passos[2]!.meio).toBe('Cavalo')
  })

  it('ajuste com nome desconhecido = herda do trecho; fora de trecho não conta', () => {
    const base = comMeio(coluna(3, { 0: 'parada', 2: 'parada' }), { 2: 'Cavalo' })
    const v = calcularViagem({ hexes: comPasso(base, { 1: 'Balão', 3: 'Cavalo' }), terrenoDe: () => undefined, cfg: CFG })
    expect(v.passos[1]!.meio).toBe('Cavalo')
    expect(v.passos[3]).toBeNull()
  })
})

it('meioPasso com nome antigo (Navio) vale como Barco', () => {
  const v = calcularViagem({
    hexes: coluna(2, { 0: 'parada', 2: 'parada' }).map((h, i) => (i === 2 ? { ...h, meioPasso: 'Navio' } : h)),
    terrenoDe: mapaDe({ '10,1': 'mar', '10,2': 'mar' }),
    cfg: CFG,
  })
  expect(v.passos[2]!.ajuste).toBe('Barco')
  expect(v.passos[2]!.meio).toBe('Barco')
})
