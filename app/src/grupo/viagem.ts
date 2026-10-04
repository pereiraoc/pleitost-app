// VIAGEM DO HEXCRAWL (2026-10-04) — tempo pra percorrer a trilha do grupo no
// mapa-múndi, com as regras do bloco `viagem` do Contexto-Def (só a Fantasia
// declara; sem ele não há UI). Módulo PURO.
//
// Decisões (documentadas nos testes, tests/viagem.test.ts):
//  • PASSO: andar do hex i pro i+1 custa o terreno do hex ENTRADO (i+1); o
//    hex de partida não custa nada. Hex sem terreno pintado (ou com chave que
//    a config não conhece mais) = `padrao`.
//  • BURACOS: hexes consecutivos não adjacentes na trilha são ligados pela
//    linha hex mais curta (cube lerp) — cada hex do meio também é entrado.
//  • MEIO: por hex, o mais rápido (maior `fator`) entre os meios do grupo que
//    andam naquele terreno; horas = terreno.horas / fator. Nenhum → passo
//    BLOQUEADO (reporta hex + terreno) e não soma.
//  • MEIOS DO GRUPO: o PRIMEIRO meio da config é o básico (A pé) — sempre
//    disponível (quem tem cavalo desmonta na montanha); os escolhidos somam.
//    Sem escolha = só o básico.
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

/** Meios efetivos do grupo: o básico (1º da config) + os escolhidos que a
 *  config conhece, na ordem da config. */
export function meiosDoGrupo(cfg: ViagemCfg, escolhidos: readonly string[] | undefined): string[] {
  const set = new Set(escolhidos ?? [])
  return cfg.meios.filter((m, i) => i === 0 || set.has(m.nome)).map((m) => m.nome)
}

function terrenoEfetivo(chave: string | undefined, cfg: ViagemCfg) {
  return (
    (chave ? cfg.terrenos.find((t) => t.chave === chave) : undefined) ??
    cfg.terrenos.find((t) => t.chave === cfg.padrao) ??
    null
  )
}

/** Horas pra entrar num hex do terreno `chave` com os meios EFETIVOS dados
 *  (use meiosDoGrupo). `horas: null` = nenhum meio anda ali (bloqueado). */
export function custoHex(
  chave: string | undefined,
  cfg: ViagemCfg,
  meios: readonly string[],
): { horas: number | null; meio: string | null } {
  const t = terrenoEfetivo(chave, cfg)
  if (!t) return { horas: null, meio: null }
  let melhor: { nome: string; fator: number } | null = null
  for (const m of cfg.meios) {
    if (!meios.includes(m.nome) || !m.em.includes(t.chave)) continue
    if (!melhor || m.fator > melhor.fator) melhor = m
  }
  return melhor ? { horas: t.horas / melhor.fator, meio: melhor.nome } : { horas: null, meio: null }
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
  horas: number
  bloqueios: Bloqueio[]
}

export interface Viagem {
  segmentos: SegmentoViagem[]
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
  const segmentos: SegmentoViagem[] = []
  hexes.forEach((h, i) => {
    if (ehParada(h) || segmentos.length === 0) segmentos.push({ inicio: i, horas: 0, bloqueios: [] })
    const next = hexes[i + 1]
    if (!next) return
    const seg = segmentos[segmentos.length - 1]!
    const linha = hexLine(h, next)
    for (let k = 1; k < linha.length; k++) {
      const p = linha[k]!
      const chave = terrenoDe(p.col, p.row)
      const c = custoHex(chave, cfg, efetivos)
      if (c.horas === null) {
        seg.bloqueios.push({ col: p.col, row: p.row, terreno: terrenoEfetivo(chave, cfg)?.chave ?? cfg.padrao })
      } else seg.horas += c.horas
    }
  })
  const total = segmentos.reduce((s, x) => s + x.horas, 0)
  return { segmentos, total, bloqueado: segmentos.some((s) => s.bloqueios.length > 0) }
}

/** "8h" · "24h (1d)" · "56h (2d 8h)" — dias corridos de 24h; vírgula decimal. */
export function formatarHoras(h: number): string {
  const num = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',')
  if (h < 24) return `${num(h)}h`
  const d = Math.floor(h / 24)
  const r = h - d * 24
  return `${num(h)}h (${d}d${r > 0.05 ? ` ${num(r)}h` : ''})`
}
