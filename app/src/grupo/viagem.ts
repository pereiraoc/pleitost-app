// VIAGEM DO HEXCRAWL (2026-10-04, regras v2) — tempo pra percorrer a trilha do grupo no
// mapa-múndi, com as regras do bloco `viagem` do Contexto-Def (só a Fantasia
// declara; sem ele não há UI). Módulo PURO.
//
// Decisões (documentadas nos testes, tests/viagem.test.ts):
//  • PASSO: andar do hex i pro i+1 custa o terreno do hex ENTRADO (i+1); o
//    hex de partida não custa nada. Hex sem terreno pintado (ou com chave que
//    a config não conhece mais) = `padrao`.
//  • BURACOS: hexes consecutivos não adjacentes na trilha são ligados pela
//    linha hex mais curta (cube lerp) — cada hex do meio também é entrado.
//  • MEIO: por hex, o mais rápido (maior `hexPorDia`) entre os meios do grupo
//    que andam naquele terreno; DIAS = terreno.custo / meio.hexPorDia (1 dia:
//    a pé 2 hex, cavalo 3, carruagem 4, navio 5; custo ×1/×2/×3). Nenhum →
//    passo BLOQUEADO (reporta hex + terreno) e não soma.
//  • SOMA EXATA: custo/hexPorDia vira fração (inteiros → num/den reduzidos) e
//    a soma é racional, sem 0,999…; config não inteira cai pra float.
//  • MEIOS DO GRUPO gravados com nomes que a config não conhece mais (antigos
//    Caravana/Barco) são IGNORADOS (meiosDoGrupo filtra pela config).
//  • MEIOS DO GRUPO: o PRIMEIRO meio da config é o básico (A pé) — sempre
//    disponível (quem tem cavalo desmonta na montanha); os escolhidos somam.
//    Sem escolha = os `padrao` da config (a pé + carruagem + navio: estrada
//    vai de carruagem, mar de navio sozinhos).
//  • TRECHOS: por PARADA de chegada, a soma dos passos desde a parada
//    anterior (ou do início da trilha) — é o que a linha da parada mostra.
//  • SEGMENTOS: mesma segmentação da lista do caminho (PanelExploracao
//    buildSegments): começa numa PARADA (kind ≠ 'caminho'); antes da 1ª
//    parada, um segmento sem cabeçalho começando em 0. O segmento soma os
//    passos que SAEM dos seus hexes (da parada até chegar na próxima).
//
// GRADE: a trilha (group-store) e o hexmap `mapa:mundo` usam as MESMAS coords
// (atlas-grid, flat-top odd-q) — PanelExploracao/HexInfo fazem cellAt(hexMap,
// h.col, h.row) direto, sem deslocamento; o terreno se busca igual.
import type { ViagemCfg } from '../data/context-def'

export type { ViagemCfg }

export interface Hex {
  col: number
  row: number
}

interface Cube {
  x: number
  y: number
  z: number
}

/** offset odd-q → cube. */
export function toCube(h: Hex): Cube {
  const x = h.col
  const z = h.row - (h.col - (h.col & 1)) / 2
  return { x, y: -x - z, z }
}

/** cube → offset odd-q. */
export function fromCube(c: Cube): Hex {
  const col = c.x
  const row = c.z + (c.x - (c.x & 1)) / 2
  return { col: col + 0, row: row + 0 }
}

function cubeRound(x: number, y: number, z: number): Cube {
  let rx = Math.round(x)
  let ry = Math.round(y)
  let rz = Math.round(z)
  const dx = Math.abs(rx - x)
  const dy = Math.abs(ry - y)
  const dz = Math.abs(rz - z)
  if (dx > dy && dx > dz) rx = -ry - rz
  else if (dy > dz) ry = -rx - rz
  else rz = -rx - ry
  return { x: rx, y: ry, z: rz }
}

export function hexDistance(a: Hex, b: Hex): number {
  const ca = toCube(a)
  const cb = toCube(b)
  return Math.max(Math.abs(ca.x - cb.x), Math.abs(ca.y - cb.y), Math.abs(ca.z - cb.z))
}

/** Linha hex de `a` a `b`, INCLUSIVE nas pontas, hexes consecutivos adjacentes. */
export function hexLine(a: Hex, b: Hex): Hex[] {
  const n = hexDistance(a, b)
  if (n === 0) return [{ col: a.col, row: a.row }]
  const ca = toCube(a)
  const cb = toCube(b)
  // nudge evita empate exato na aresta (desempate estável)
  const e = 1e-6
  const out: Hex[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    out.push(
      fromCube(
        cubeRound(
          ca.x + e + (cb.x - ca.x) * t,
          ca.y + e + (cb.y - ca.y) * t,
          ca.z - 2 * e + (cb.z - ca.z) * t,
        ),
      ),
    )
  }
  return out
}

/** Meios efetivos do grupo, na ordem da config: o básico (1º) sempre; sem
 *  escolha gravada (`undefined`) entram os `padrao` da config (a pé +
 *  carruagem + navio); com escolha (mesmo vazia), os escolhidos que a config
 *  conhece. */
export function meiosDoGrupo(cfg: ViagemCfg, escolhidos: readonly string[] | undefined): string[] {
  const set = escolhidos ? new Set(escolhidos) : null
  return cfg.meios
    .filter((m, i) => i === 0 || (set ? set.has(m.nome) : m.padrao === true))
    .map((m) => m.nome)
}

/** Ícone (config) de um meio pelo nome; '' se a config não conhece. */
export function iconeDoMeio(cfg: ViagemCfg, nome: string): string {
  return cfg.meios.find((m) => m.nome === nome)?.icone ?? ''
}

function terrenoEfetivo(chave: string | undefined, cfg: ViagemCfg) {
  return (
    (chave ? cfg.terrenos.find((t) => t.chave === chave) : undefined) ??
    cfg.terrenos.find((t) => t.chave === cfg.padrao) ??
    null
  )
}

interface Custo {
  dias: number | null
  meio: string | null
  /** Fração exata [num, den] quando custo e hexPorDia são inteiros. */
  frac: [number, number] | null
}

function gcd(a: number, b: number): number {
  return b === 0 ? Math.abs(a) : gcd(b, a % b)
}

function custoInterno(chave: string | undefined, cfg: ViagemCfg, meios: readonly string[]): Custo {
  const t = terrenoEfetivo(chave, cfg)
  if (!t) return { dias: null, meio: null, frac: null }
  let melhor: ViagemCfg['meios'][number] | null = null
  for (const m of cfg.meios) {
    if (!meios.includes(m.nome) || !m.em.includes(t.chave)) continue
    if (!melhor || m.hexPorDia > melhor.hexPorDia) melhor = m
  }
  if (!melhor) return { dias: null, meio: null, frac: null }
  const inteiros = Number.isInteger(t.custo) && Number.isInteger(melhor.hexPorDia)
  const g = inteiros ? gcd(t.custo, melhor.hexPorDia) : 1
  return {
    dias: t.custo / melhor.hexPorDia,
    meio: melhor.nome,
    frac: inteiros ? [t.custo / g, melhor.hexPorDia / g] : null,
  }
}

/** Dias pra entrar num hex do terreno `chave` com os meios EFETIVOS dados
 *  (use meiosDoGrupo). `dias: null` = nenhum meio anda ali (bloqueado). */
export function custoHex(
  chave: string | undefined,
  cfg: ViagemCfg,
  meios: readonly string[],
): { dias: number | null; meio: string | null } {
  const { dias, meio } = custoInterno(chave, cfg, meios)
  return { dias, meio }
}

/** Acumulador racional (num/den) com escape pra float. */
class Soma {
  private num = 0
  private den = 1
  private flt = 0
  add(c: Custo) {
    if (c.frac) {
      const [n, d] = c.frac
      const num = this.num * d + n * this.den
      const den = this.den * d
      const g = gcd(num, den) || 1
      this.num = num / g
      this.den = den / g
    } else if (c.dias !== null) this.flt += c.dias
  }
  get valor(): number {
    return this.num / this.den + this.flt
  }
  somar(o: Soma) {
    this.add({ dias: null, meio: null, frac: [o.num, o.den] })
    this.flt += o.flt
  }
}

/** Chave do terreno efetiva de um hex (pintada ou padrão). */
export function terrenoDoHex(chave: string | undefined, cfg: ViagemCfg): ViagemCfg['terrenos'][number] | null {
  return terrenoEfetivo(chave, cfg)
}

export interface Bloqueio {
  col: number
  row: number
  terreno: string
}

export interface SegmentoViagem {
  /** Índice (na trilha) do hex que abre o segmento. */
  inicio: number
  /** Dias de viagem do segmento. */
  dias: number
  bloqueios: Bloqueio[]
}

/** Custo pra ENTRAR no hex `i` da trilha (vindo do i-1; com buraco, soma a
 *  linha inteira). `meio`/`terreno` = os do hex de chegada. `dias: null` =
 *  nenhum hex do passo é andável; `bloqueado` = algum não é. */
export interface PassoViagem {
  dias: number | null
  meio: string | null
  /** Meios usados no passo (distintos, na ordem da viagem — com buraco pode
   *  haver mais de um). */
  meios: string[]
  /** Chave do terreno efetivo (pintado ou padrão) do hex de chegada. */
  terreno: string
  bloqueado: boolean
}

/** Trecho que CHEGA numa parada: da parada anterior (ou do início da trilha)
 *  até ela — o tempo que a lista mostra na linha da parada. */
export interface TrechoViagem {
  dias: number
  /** Meios usados (distintos, na ordem da viagem). */
  meios: string[]
  /** Dias por meio, na mesma ordem. */
  partes: { meio: string; dias: number }[]
  bloqueios: Bloqueio[]
}

export interface Viagem {
  /** Por índice da PARADA de chegada (nunca a 1ª linha da trilha). */
  trechos: Map<number, TrechoViagem>
  segmentos: SegmentoViagem[]
  /** Por índice da trilha; `passos[0]` (partida) = null. */
  passos: (PassoViagem | null)[]
  /** Dias de viagem da trilha inteira. */
  total: number
  bloqueado: boolean
}

export function calcularViagem({
  hexes,
  terrenoDe,
  cfg,
  meios,
  ehParada = (h) => h.kind !== 'caminho',
}: {
  hexes: readonly (Hex & { kind?: 'parada' | 'caminho' })[]
  terrenoDe: (col: number, row: number) => string | undefined
  cfg: ViagemCfg
  /** Escolha do grupo (GroupState.exploracao meios); undefined = só o básico. */
  meios: readonly string[] | undefined
  ehParada?: (h: Hex & { kind?: 'parada' | 'caminho' }) => boolean
}): Viagem {
  const efetivos = meiosDoGrupo(cfg, meios)
  const segs: { seg: SegmentoViagem; soma: Soma }[] = []
  const passos: (PassoViagem | null)[] = hexes.length ? [null] : []
  const trechos = new Map<number, TrechoViagem>()
  let trecho = novoTrecho()
  hexes.forEach((h, i) => {
    if (ehParada(h) || segs.length === 0) segs.push({ seg: { inicio: i, dias: 0, bloqueios: [] }, soma: new Soma() })
    const next = hexes[i + 1]
    if (!next) return
    const cur = segs[segs.length - 1]!
    const linha = hexLine(h, next)
    const passo = new Soma()
    let andou = false
    let bloqueado = false
    let ultimo: { meio: string | null; terreno: string } = { meio: null, terreno: cfg.padrao }
    const meiosPasso: string[] = []
    for (let k = 1; k < linha.length; k++) {
      const p = linha[k]!
      const chave = terrenoDe(p.col, p.row)
      const c = custoInterno(chave, cfg, efetivos)
      const terreno = terrenoEfetivo(chave, cfg)?.chave ?? cfg.padrao
      ultimo = { meio: c.meio, terreno }
      if (c.dias === null) {
        bloqueado = true
        cur.seg.bloqueios.push({ col: p.col, row: p.row, terreno })
        trecho.bloqueios.push({ col: p.col, row: p.row, terreno })
      } else {
        andou = true
        cur.soma.add(c)
        passo.add(c)
        trecho.soma.add(c)
        let pm = trecho.porMeio.get(c.meio!)
        if (!pm) trecho.porMeio.set(c.meio!, (pm = new Soma()))
        pm.add(c)
        if (!meiosPasso.includes(c.meio!)) meiosPasso.push(c.meio!)
      }
    }
    passos.push({ dias: andou ? passo.valor : null, meio: ultimo.meio, meios: meiosPasso, terreno: ultimo.terreno, bloqueado })
    // chegou numa PARADA: fecha o trecho (da parada anterior / início até aqui)
    if (ehParada(next)) {
      const meiosT = [...trecho.porMeio.keys()]
      trechos.set(i + 1, {
        dias: trecho.soma.valor,
        meios: meiosT,
        partes: meiosT.map((m) => ({ meio: m, dias: trecho.porMeio.get(m)!.valor })),
        bloqueios: trecho.bloqueios,
      })
      trecho = novoTrecho()
    }
  })
  const total = new Soma()
  for (const x of segs) {
    x.seg.dias = x.soma.valor
    total.somar(x.soma)
  }
  const segmentos = segs.map((x) => x.seg)
  return { trechos, segmentos, passos, total: total.valor, bloqueado: segmentos.some((s) => s.bloqueios.length > 0) }
}

function novoTrecho() {
  return { soma: new Soma(), porMeio: new Map<string, Soma>(), bloqueios: [] as Bloqueio[] }
}

/** Frações "humanas" com glifo (denominadores 2..6 e 8). */
const GLIFOS: [number, string][] = [
  [1 / 8, '⅛'],
  [1 / 6, '⅙'],
  [1 / 5, '⅕'],
  [1 / 4, '¼'],
  [1 / 3, '⅓'],
  [3 / 8, '⅜'],
  [2 / 5, '⅖'],
  [1 / 2, '½'],
  [3 / 5, '⅗'],
  [5 / 8, '⅝'],
  [2 / 3, '⅔'],
  [3 / 4, '¾'],
  [4 / 5, '⅘'],
  [5 / 6, '⅚'],
  [7 / 8, '⅞'],
]

/** "½ dia" · "1 dia" · "2½ dias" · "1⅓ dias" · "1,7 dias" — frações simples
 *  com glifo; o resto com uma casa decimal (vírgula). Plural acima de 1. */
export function formatarDias(d: number): string {
  const EPS = 1e-6
  const unidade = (v: number) => (v > 0 && v <= 1 + EPS ? 'dia' : 'dias')
  const inteiro = Math.round(d)
  if (Math.abs(d - inteiro) < EPS) return `${inteiro} ${unidade(inteiro)}`
  const base = Math.floor(d)
  const resto = d - base
  const g = GLIFOS.find(([v]) => Math.abs(v - resto) < EPS)
  if (g) return `${base > 0 ? base : ''}${g[1]} ${unidade(d)}`
  const r = Math.round(d * 10) / 10
  return `${String(r).replace('.', ',')} ${unidade(r)}`
}
