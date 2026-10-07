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
//    Os hexes preenchidos herdam o caráter comum das pontas (mesma rota /
//    as duas na água — ver lacunaHerdada), 2026-10-06.
//  • INSTANTÂNEO (2026-10-06): meio `instantaneo` (Portal) custa 0 em todo
//    terreno do `em` — sem costa nem rota; nunca automático (não é padrão).
//  • MEIO (2026-10-06, "um meio por trecho"): cada TRECHO (da parada
//    anterior até a parada de chegada) pode ter UM meio escolhido, gravado na
//    parada de CHEGADA (`GroupHex.meio`). Em cada hex do trecho: se o meio
//    escolhido faz aquele passo, usa ele; senão (caravana fora da
//    estrada, cavalo na montanha, barco em terra) cai no AUTOMÁTICO. Sem
//    escolha = automático em todo o trecho. Nome que a config não conhece =
//    sem escolha.
//  • AJUSTE POR ITEM (2026-10-06, "trecho define, item ajusta"): qualquer
//    hex do trecho (caminho ou a própria parada de chegada) pode ter
//    `GroupHex.meioPasso` — vale SÓ no passo que ENTRA nele. Resolução:
//    meioPasso ?? meio do trecho ?? automático, sempre respeitando o terreno
//    (o resolvido não faz o passo → automático naquele passo).
//  • SÓ ENTRE PARADAS (2026-10-06, "a distância sempre tem que ser entre
//    trechos, não antes ou depois"): caminho ANTES da 1ª parada e DEPOIS da
//    última não tem trecho → sem passo (null), fora do total, sem bloqueio.
//    A 1ª parada não tem tempo.
//  • AUTOMÁTICO: o mais rápido (menos DIAS) entre os meios automáticos (o
//    PRIMEIRO da config, o básico A pé, + os `padrao`: caravana, barco) que
//    fazem o passo. Nenhum → passo BLOQUEADO (reporta hex + terreno), não soma.
//  • REGRAS v3 (2026-10-06): DIAS = custo do terreno entrado (custoPorMeio ??
//    custo: normal 1, difícil 2, montanha 3, mar 3 — Barco no mar 1) /
//    (hexPorDia + bônus da ROTA do hex entrado: estrada +1 pra Cavalo e
//    Caravana, rota marítima +1 pro Barco). Caravana só em hex com estrada
//    (`soEmRota`). COSTA = passo entre hex de água e de terra: só meios
//    `costa` (Barco, A pé); o Barco paga pelo hex de mar (×1 + rota marítima
//    dele), o A pé pelo hex entrado (mar ×3 / terreno da terra). Mar → mar só
//    quem anda no mar (Barco). Nomes antigos gravados (Carruagem, Navio)
//    resolvem pelos `antigos` da config (resolverMeio).
//  • SOMA EXATA: custo/hexPorDia vira fração (inteiros → num/den reduzidos) e
//    a soma é racional, sem 0,999…; config não inteira cai pra float.
//  • TRECHOS: por PARADA de chegada (que tenha parada antes), a soma dos
//    passos desde a parada anterior — é o que a linha da parada mostra.
//  • SEGMENTOS: mesma segmentação da lista do caminho (PanelExploracao
//    buildSegments): começa numa PARADA (kind ≠ 'caminho'); antes da 1ª
//    parada, um segmento sem cabeçalho começando em 0 (soma 0). O segmento
//    soma os passos que SAEM dos seus hexes (da parada até chegar na próxima;
//    o da última parada soma 0).
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

/** Meios AUTOMÁTICOS, na ordem da config: o básico (1º) sempre + os
 *  `padrao` (a pé + caravana + barco na Fantasia). */
export function meiosAutomaticos(cfg: ViagemCfg): string[] {
  return cfg.meios.filter((m, i) => i === 0 || m.padrao === true).map((m) => m.nome)
}

/** Nome canônico de um meio gravado na trilha: o próprio nome ou um dos
 *  `antigos` da config (Carruagem → Caravana, Navio → Barco). undefined =
 *  a config não conhece (vale como "sem escolha"). */
export function resolverMeio(cfg: ViagemCfg, nome: string | undefined): string | undefined {
  if (!nome) return undefined
  return (cfg.meios.find((m) => m.nome === nome) ?? cfg.meios.find((m) => m.antigos?.includes(nome)))?.nome
}

/** Ícone (config) de um meio pelo nome (ou nome antigo); '' se a config não conhece. */
export function iconeDoMeio(cfg: ViagemCfg, nome: string): string {
  const n = resolverMeio(cfg, nome)
  return cfg.meios.find((m) => m.nome === n)?.icone ?? ''
}

/** Onde o meio anda, em rótulos da config: a rota exigida (`soEmRota`:
 *  Caravana → "Estrada") ou os terrenos `em`. '' se a config não conhece. */
export function ondeAnda(cfg: ViagemCfg, nome: string): string {
  const m = cfg.meios.find((x) => x.nome === resolverMeio(cfg, nome))
  if (!m) return ''
  if (m.soEmRota) return cfg.rotas?.find((r) => r.chave === m.soEmRota)?.nome ?? m.soEmRota
  return m.em.map((k) => cfg.terrenos.find((t) => t.chave === k)?.nome ?? k).join(', ')
}

function terrenoEfetivo(chave: string | undefined, cfg: ViagemCfg) {
  return (
    (chave ? cfg.terrenos.find((t) => t.chave === chave) : undefined) ??
    cfg.terrenos.find((t) => t.chave === cfg.padrao) ??
    null
  )
}

/** O que um hex tem pra viagem: terreno-base (chave pintada; ausente =
 *  padrão) e a rota da camada de rotas (estrada, rota marítima), se houver. */
export interface HexTerreno {
  terreno?: string
  rota?: string
}

interface Custo {
  dias: number | null
  meio: string | null
  /** Fração exata [num, den] quando custo e velocidade são inteiros. */
  frac: [number, number] | null
}

const NENHUM: Custo = { dias: null, meio: null, frac: null }

function gcd(a: number, b: number): number {
  return b === 0 ? Math.abs(a) : gcd(b, a % b)
}

type MeioCfg = ViagemCfg['meios'][number]
type TerrenoCfg = ViagemCfg['terrenos'][number]

function bonusDaRota(rota: string | undefined, meio: MeioCfg, cfg: ViagemCfg): number {
  if (!rota) return 0
  const r = cfg.rotas?.find((x) => x.chave === rota)
  return r && r.meios.includes(meio.nome) ? r.bonus : 0
}

function fracao(custo: number, velocidade: number, meio: string): Custo {
  const inteiros = Number.isInteger(custo) && Number.isInteger(velocidade)
  const g = inteiros ? gcd(custo, velocidade) : 1
  return { dias: custo / velocidade, meio, frac: inteiros ? [custo / g, velocidade / g] : null }
}

/** Custo de UM meio pra entrar em `para` vindo de `de` (null = não faz o
 *  passo).
 *  • COSTA (um dos dois hexes é água, o outro terra): só meios `costa`
 *    (Barco, A pé). Quem anda na água (Barco) paga pelo hex de ÁGUA (custo
 *    dele pro meio + a rota marítima dele); o resto (A pé) paga pelo hex em
 *    que ENTRA (mar ×3 embarcando; o terreno da terra desembarcando).
 *  • Fora da costa: o meio precisa andar no terreno entrado (`em`) e, com
 *    `soEmRota`, o hex entrado precisa ter a rota (Caravana → estrada).
 *  Dias = custo (custoPorMeio ?? custo) / (hexPorDia + bônus da rota). */
function custoDoMeio(m: MeioCfg, para: HexTerreno, de: HexTerreno | null | undefined, cfg: ViagemCfg): Custo {
  const tp = terrenoEfetivo(para.terreno, cfg)
  if (!tp) return NENHUM
  // INSTANTÂNEO (Portal): 0 dias em todo terreno de `em` — sem costa, sem rota
  if (m.instantaneo) return m.em.includes(tp.chave) ? { dias: 0, meio: m.nome, frac: [0, 1] } : NENHUM
  const td = de ? terrenoEfetivo(de.terreno, cfg) : null
  let base: { t: TerrenoCfg; rota: string | undefined } = { t: tp, rota: para.rota }
  if (td && !!td.agua !== !!tp.agua) {
    if (!m.costa) return NENHUM
    const agua = tp.agua ? base : { t: td, rota: de!.rota }
    if (m.em.includes(agua.t.chave)) base = agua
  } else {
    if (!m.em.includes(tp.chave)) return NENHUM
    if (m.soEmRota && para.rota !== m.soEmRota) return NENHUM
  }
  const custo = base.t.custoPorMeio?.[m.nome] ?? base.t.custo
  return fracao(custo, m.hexPorDia + bonusDaRota(base.rota, m, cfg), m.nome)
}

/** O mais rápido (menos DIAS; empate = ordem da config) entre `meios` que
 *  fazem o passo. */
function custoInterno(
  para: HexTerreno,
  cfg: ViagemCfg,
  meios: readonly string[],
  de?: HexTerreno | null,
): Custo {
  let melhor: Custo = NENHUM
  for (const m of cfg.meios) {
    if (!meios.includes(m.nome)) continue
    const c = custoDoMeio(m, para, de, cfg)
    if (c.dias === null) continue
    if (melhor.dias === null || c.dias < melhor.dias - 1e-12) melhor = c
  }
  return melhor
}

/** Custo do passo com o meio ESCOLHIDO (nome canônico ou antigo), se ele faz
 *  o passo; senão (ou sem escolha) o automático. `fallback` = havia escolha e
 *  ela não serviu. */
function custoComEscolha(
  para: HexTerreno,
  cfg: ViagemCfg,
  escolha: string | undefined,
  de?: HexTerreno | null,
): Custo & { fallback: boolean } {
  const nome = resolverMeio(cfg, escolha)
  if (nome) {
    const c = custoInterno(para, cfg, [nome], de)
    if (c.dias !== null) return { ...c, fallback: false }
    return { ...custoInterno(para, cfg, meiosAutomaticos(cfg), de), fallback: true }
  }
  return { ...custoInterno(para, cfg, meiosAutomaticos(cfg), de), fallback: false }
}

/** Dias pra entrar num hex (vindo de `de`, se conhecido — decide a costa) com
 *  o meio escolhido do trecho (ou automático). */
export function custoHexNoTrecho(
  para: HexTerreno,
  cfg: ViagemCfg,
  escolha: string | undefined,
  de?: HexTerreno | null,
): { dias: number | null; meio: string | null } {
  const { dias, meio } = custoComEscolha(para, cfg, escolha, de)
  return { dias, meio }
}

/** Meio escolhido do TRECHO a que o hex `idx` pertence (entrar nele): o
 *  `meio` da 1ª parada em idx ou depois, se houver parada ANTES de idx;
 *  undefined = automático / sem trecho (antes da 1ª ou depois da última). */
export function meioDoTrecho<H extends Hex & { kind?: 'parada' | 'caminho'; meio?: string }>(
  hexes: readonly H[],
  idx: number,
  ehParada: (h: H) => boolean = (h) => h.kind !== 'caminho',
): string | undefined {
  let antes = false
  for (let i = 0; i < idx; i++) if (ehParada(hexes[i]!)) antes = true
  if (!antes) return undefined
  for (let i = idx; i < hexes.length; i++) if (ehParada(hexes[i]!)) return hexes[i]!.meio
  return undefined
}

/** Dias pra entrar em `para` (vindo de `de`) com os meios dados (ex.:
 *  meiosAutomaticos) — o mais rápido. `dias: null` = nenhum faz o passo. */
export function custoHex(
  para: HexTerreno,
  cfg: ViagemCfg,
  meios: readonly string[],
  de?: HexTerreno | null,
): { dias: number | null; meio: string | null } {
  const { dias, meio } = custoInterno(para, cfg, meios, de)
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
  /** Rota (camada de rotas, chave conhecida) do hex de chegada. */
  rota?: string
  bloqueado: boolean
  /** Ajuste do item (`meioPasso` do hex entrado, nome conhecido): o meio
   *  pedido SÓ pra este passo; ausente = herda do trecho. */
  ajuste?: string
}

/** Trecho que CHEGA numa parada: da parada anterior até ela — o tempo que a
 *  lista mostra na linha da parada (a 1ª parada não tem). */
export interface TrechoViagem {
  dias: number
  /** Meios usados (distintos, na ordem da viagem). */
  meios: string[]
  /** Dias por meio, na mesma ordem. `terrenos` (só quando houve escolha e
   *  ela não serviu): chaves dos terrenos onde este meio entrou no lugar. */
  partes: { meio: string; dias: number; terrenos?: string[] }[]
  /** Meio escolhido do trecho (GroupHex.meio da parada de chegada), se a
   *  config o conhece; ausente = automático. */
  escolhido?: string
  bloqueios: Bloqueio[]
}

export interface Viagem {
  /** Por índice da PARADA de chegada (nunca a 1ª linha da trilha). */
  trechos: Map<number, TrechoViagem>
  segmentos: SegmentoViagem[]
  /** Por índice da trilha; `passos[0]` (partida) = null, e também null
   *  fora de trecho (antes da 1ª parada / depois da última). */
  passos: (PassoViagem | null)[]
  /** Dias de viagem da trilha (soma dos trechos entre paradas). */
  total: number
  bloqueado: boolean
}

/** LACUNA (2026-10-06): dois hexes marcados consecutivos NÃO vizinhos são
 *  ligados pela linha hex reta, que pode sair da estrada curva ou cortar um
 *  cabo de terra no meio do mar — e aí o meio escolhido (Caravana, Barco)
 *  deixava de valer nos hexes preenchidos. Regra: quando as duas PONTAS
 *  dividem o caráter da rota, os preenchidos herdam esse caráter em vez do
 *  terreno pintado deles:
 *   • mesma ROTA nas duas pontas (estrada, rota marítima, escadaria) → os
 *     preenchidos têm essa rota e o terreno da ponta de CHEGADA (o custo da
 *     própria rota: estrada no gramado = ×1; a reta pode cortar uma montanha
 *     que a estrada contorna);
 *   • as duas pontas na ÁGUA (sem rota em comum) → os preenchidos são o
 *     terreno de água da ponta de chegada (o Barco não "encalha" num cabo);
 *   • pontas misturadas → null: cada preenchido usa o próprio terreno.
 *  O meio dos preenchidos é o do PASSO (meioPasso da chegada ?? meio do
 *  trecho ?? automático), como sempre. */
function lacunaHerdada(a: HexTerreno, b: HexTerreno, cfg: ViagemCfg): HexTerreno | null {
  const rota = a.rota && a.rota === b.rota && cfg.rotas?.some((r) => r.chave === a.rota) ? a.rota : undefined
  if (rota) return { terreno: b.terreno, rota }
  const ta = terrenoEfetivo(a.terreno, cfg)
  const tb = terrenoEfetivo(b.terreno, cfg)
  if (ta?.agua && tb?.agua) return { terreno: tb.chave }
  return null
}

type HexViagem = Hex & { kind?: 'parada' | 'caminho'; meio?: string; meioPasso?: string }

export function calcularViagem({
  hexes,
  terrenoDe,
  rotaDe = () => undefined,
  cfg,
  ehParada = (h) => h.kind !== 'caminho',
}: {
  /** `meio` na PARADA = meio escolhido do trecho que chega nela;
   *  `meioPasso` em qualquer hex = ajuste SÓ do passo que entra nele. */
  hexes: readonly HexViagem[]
  terrenoDe: (col: number, row: number) => string | undefined
  /** Camada de rotas por hex (estrada, rota marítima); ausente = nenhuma. */
  rotaDe?: (col: number, row: number) => string | undefined
  cfg: ViagemCfg
  ehParada?: (h: HexViagem) => boolean
}): Viagem {
  // escolha por hex ENTRADO: a da parada de chegada do trecho (varre de trás
  // pra frente). Só há trecho entre a 1ª e a última parada.
  const conhecido = (m: string | undefined) => resolverMeio(cfg, m)
  const escolhaDe: (string | undefined)[] = new Array(hexes.length).fill(undefined)
  let corrente: string | undefined
  for (let i = hexes.length - 1; i >= 1; i--) {
    if (ehParada(hexes[i]!)) corrente = conhecido(hexes[i]!.meio)
    escolhaDe[i] = corrente
  }
  // ajuste do item (meioPasso) vence o meio do trecho, só no passo dele
  const ajusteDe = hexes.map((h) => conhecido(h.meioPasso))
  const segs: { seg: SegmentoViagem; soma: Soma }[] = []
  const passos: (PassoViagem | null)[] = hexes.length ? [null] : []
  const trechos = new Map<number, TrechoViagem>()
  let primeira = -1
  let ultima = -1
  hexes.forEach((h, i) => {
    if (!ehParada(h)) return
    if (primeira === -1) primeira = i
    ultima = i
  })
  let trecho = novoTrecho()
  hexes.forEach((h, i) => {
    if (ehParada(h) || segs.length === 0) segs.push({ seg: { inicio: i, dias: 0, bloqueios: [] }, soma: new Soma() })
    const next = hexes[i + 1]
    if (!next) return
    // passo pra entrar em i+1 só conta dentro de um trecho (entre paradas)
    if (primeira === -1 || i < primeira || i + 1 > ultima) {
      passos.push(null)
      return
    }
    const cur = segs[segs.length - 1]!
    const linha = hexLine(h, next)
    const passo = new Soma()
    let andou = false
    let bloqueado = false
    let ultimo: { meio: string | null; terreno: string; rota?: string } = { meio: null, terreno: cfg.padrao }
    const meiosPasso: string[] = []
    const ajuste = ajusteDe[i + 1]
    const escolhaPasso = ajuste ?? escolhaDe[i + 1]
    const infoPintado = (q: Hex): HexTerreno => ({ terreno: terrenoDe(q.col, q.row), rota: rotaDe(q.col, q.row) })
    const lacuna = lacunaHerdada(infoPintado(h), infoPintado(next), cfg)
    // hexes PREENCHIDOS (entre as pontas) herdam o caráter comum das pontas
    const infoDe = (q: Hex, k: number): HexTerreno =>
      lacuna && k > 0 && k < linha.length - 1 ? lacuna : infoPintado(q)
    for (let k = 1; k < linha.length; k++) {
      const p = linha[k]!
      const para = infoDe(p, k)
      const c = custoComEscolha(para, cfg, escolhaPasso, infoDe(linha[k - 1]!, k - 1))
      const terreno = terrenoEfetivo(para.terreno, cfg)?.chave ?? cfg.padrao
      const rota = para.rota && cfg.rotas?.some((r) => r.chave === para.rota) ? para.rota : undefined
      ultimo = { meio: c.meio, terreno, ...(rota ? { rota } : {}) }
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
        // fallback do MEIO DO TRECHO (o ajuste do item não conta aqui)
        if (c.fallback && !ajuste) {
          let ts = trecho.fallbackTerrenos.get(c.meio!)
          if (!ts) trecho.fallbackTerrenos.set(c.meio!, (ts = []))
          if (!ts.includes(terreno)) ts.push(terreno)
        }
        if (!meiosPasso.includes(c.meio!)) meiosPasso.push(c.meio!)
      }
    }
    passos.push({
      dias: andou ? passo.valor : null,
      meio: ultimo.meio,
      meios: meiosPasso,
      terreno: ultimo.terreno,
      ...(ultimo.rota ? { rota: ultimo.rota } : {}),
      bloqueado,
      ...(ajuste ? { ajuste } : {}),
    })
    // chegou numa PARADA: fecha o trecho (da parada anterior / início até aqui)
    if (ehParada(next)) {
      const meiosT = [...trecho.porMeio.keys()]
      const escolhido = escolhaDe[i + 1]
      trechos.set(i + 1, {
        dias: trecho.soma.valor,
        meios: meiosT,
        partes: meiosT.map((m) => {
          const ts = trecho.fallbackTerrenos.get(m)
          return { meio: m, dias: trecho.porMeio.get(m)!.valor, ...(ts ? { terrenos: ts } : {}) }
        }),
        ...(escolhido ? { escolhido } : {}),
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
  return {
    soma: new Soma(),
    porMeio: new Map<string, Soma>(),
    fallbackTerrenos: new Map<string, string[]>(),
    bloqueios: [] as Bloqueio[],
  }
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
