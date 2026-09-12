// @vitest-environment node
// A MALHA SOBRE O MAPA REAL como os mapas de metrô (report 2026-09-10: "dá
// uma olhada como em geral se faz os mapas de metrô quando tem o mapa real",
// com o mapa de Paris). Duas tentativas antes deste desenho foram rejeitadas:
// reta parada-a-parada e cotovelo por trecho (voltas "nada a ver"). O que o
// metrô faz — e o esquemático da aba Transporte já fazia — é andar numa GRADE
// octilinear: estação no nó mais perto, trecho pelas arestas, feixe paralelo
// onde as linhas dividem aresta. As réguas aqui guardam isso na malha REAL.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { caminhoDaLinha, montarMalha, type LinhaMalha, type Malha } from '../src/transporte/malha'
import { parseRecurso } from '../src/recursos/parse-recurso'
import { caminhoArredondado, encaixarNaGrade, esquemaNoMapa, malhaNaGrade, trechoNoMapa, type PontoXY } from '../src/transporte/esquema-no-mapa'
import type { ContextoDef } from '../src/data/context-def'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const cyber = path.join(path.dirname(appDir), 'vault-data-cyberpunk')
const temDataset = fs.existsSync(path.join(cyber, 'contexto.json'))

/** Segmentos RETOS (L) de um `d` — as curvas (Q) ficam de fora. */
function segmentosRetos(d: string): [PontoXY, PontoXY][] {
  const out: [PontoXY, PontoXY][] = []
  const re = /([MLQ])([^MLQ]*)/g
  let atual: PontoXY | null = null
  for (let m = re.exec(d); m; m = re.exec(d)) {
    const n = m[2]!.trim().split(/[\s,]+/).map(Number)
    if (m[1] === 'M') atual = { x: n[0]!, y: n[1]! }
    else if (m[1] === 'L') {
      const p = { x: n[0]!, y: n[1]! }
      if (atual) out.push([atual, p])
      atual = p
    } else atual = { x: n[2]!, y: n[3]! }
  }
  return out
}
const octilinear = ([a, b]: [PontoXY, PontoXY]) => {
  const g = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
  return Math.abs(g / 45 - Math.round(g / 45)) * 45 < 1.5
}
const comp = ([a, b]: [PontoXY, PontoXY]) => Math.hypot(b.x - a.x, b.y - a.y)

describe('esquema no mapa: peças', () => {
  it('estações no mesmo quadrinho vão pra nós diferentes, perto de onde estão', () => {
    const reais = new Map([
      ['A', { x: 10, y: 10 }],
      ['B', { x: 11, y: 11 }],
      ['C', { x: 12, y: 9 }],
    ])
    const nos = encaixarNaGrade(reais, (n) => (n === 'A' ? 2 : 1), 8)
    const chaves = [...nos.values()].map((g) => `${g.x},${g.y}`)
    expect(new Set(chaves).size).toBe(3)
    // quem tem mais linhas fica com o nó mais perto
    expect(nos.get('A')).toEqual({ x: 1, y: -1 })
    for (const [n, g] of nos) {
      const r = reais.get(n)!
      expect(Math.hypot(g.x * 8 - r.x, -g.y * 8 - r.y)).toBeLessThan(8 * 1.5)
    }
  })

  it('virada de até 90° vira curva; reta segue reta; meia-volta fica em canto vivo', () => {
    expect(caminhoArredondado([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }], 5)).not.toContain('Q')
    expect(caminhoArredondado([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], 5)).toContain('Q')
    expect(caminhoArredondado([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 1, y: 1 }], 5)).not.toContain('Q')
  })

  it('duas linhas no mesmo trecho correm paralelas, na folga', () => {
    const linha = (id: string): LinhaMalha =>
      ({ id, nome: id, paradas: ['A', 'B'], circular: false, cor: '#000', fechada: false, nivel: null, traco: 'cheio', largura: 3 }) as unknown as LinhaMalha
    const malha: Malha = { linhas: [linha('L1'), linha('L2')], paradas: new Map() }
    const nos = new Map([
      ['A', { x: 0, y: 0 }],
      ['B', { x: 5, y: 0 }],
    ])
    const e = esquemaNoMapa(malha, malha.linhas, nos, { celula: 8, folga: 3, raio: 4 })
    const [s1] = segmentosRetos(e.tracos.get('L1')!.d)
    const [s2] = segmentosRetos(e.tracos.get('L2')!.d)
    expect(Math.abs(s1![0].y - s2![0].y)).toBeCloseTo(3, 5)
    expect(e.estacoes.get('B')).toEqual({ x: 40, y: 0, baldeacao: true })
  })
})

describe.skipIf(!temDataset)('esquema no mapa: a malha REAL da POA', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(cyber, 'index.json'), 'utf8')) as IndexManifest
  const def = JSON.parse(fs.readFileSync(path.join(cyber, 'contexto.json'), 'utf8')) as ContextoDef
  const ler = (id: string) => JSON.parse(fs.readFileSync(path.join(cyber, `${id}.json`), 'utf8')) as VaultDoc
  const docs = manifest.docs
    .filter((d) => d.type === 'Linha' || d.type === 'Recurso' || d.basename === 'Malha de Transportes' || d.basename === 'Porto Alegre')
    .map((d) => ler(d.id))
  const planos = new Map<string, number>()
  for (const d of docs) {
    const r = d.type === 'Recurso' ? parseRecurso(d) : null
    if (r?.tipo === def.recursos!.tipos.estilo && r.nivel) planos.set(r.nome, r.nivel)
  }
  const malha = montarMalha(docs, def.transporte!, (n) => planos.get(n) ?? null)
  const leaf = docs.find((d) => d.basename === 'Porto Alegre')!.locationBody!.leaflet! as unknown as {
    bounds: number[][]
    markers: { nome: string; lat: number; long: number }[]
  }
  const latMax = leaf.bounds[1]![0]!
  const linhas = malha.linhas.filter((l) => !l.fechada && l.paradas.length > 1)
  const usadas = new Set(linhas.flatMap((l) => l.paradas))
  const reais = new Map(leaf.markers.filter((m) => usadas.has(m.nome)).map((m) => [m.nome, { x: m.long, y: latMax - m.lat }]))
  const CEL = 8
  const nos = encaixarNaGrade(reais, (n) => linhas.filter((l) => l.paradas.includes(n)).length, CEL)
  const e = esquemaNoMapa(malha, linhas, nos, { celula: CEL, folga: 7, raio: CEL * 0.9 })

  it('toda estação fica perto do pino real (no máximo um quadrinho e meio)', () => {
    const longe = [...reais].filter(([n, r]) => {
      const p = e.estacoes.get(n)
      return !p || Math.hypot(p.x - r.x, p.y - r.y) > CEL * 1.5
    })
    expect(longe.map(([n]) => n)).toEqual([])
  })

  it('o traço anda em horizontal, vertical e 45° (as sobras são os degraus de faixa)', () => {
    let reto = 0
    let oct = 0
    for (const { d } of e.tracos.values()) {
      for (const s of segmentosRetos(d)) {
        reto += comp(s)
        if (octilinear(s)) oct += comp(s)
      }
    }
    expect(oct / reto).toBeGreaterThan(0.85)
  })

  it('linhas que passam pelos mesmos quadrinhos formam feixe', () => {
    const grade = malhaNaGrade(malha, nos)
    const uso = new Map<string, Set<string>>()
    for (const l of linhas) {
      const { pontos } = caminhoDaLinha(grade, l)
      for (let i = 0; i < pontos.length - 1; i++) {
        const [a, b] = [pontos[i]!, pontos[i + 1]!]
        const k = a.x < b.x || (a.x === b.x && a.y < b.y) ? `${a.x},${a.y}|${b.x},${b.y}` : `${b.x},${b.y}|${a.x},${a.y}`
        uso.set(k, (uso.get(k) ?? new Set()).add(l.id))
      }
    }
    const feixes = [...uso.values()].filter((s) => s.size >= 2).length
    expect(feixes).toBeGreaterThan(40)
  })

  // report 2026-09-11: "se eu paro na segunda parada e depois faria baldeação,
  // tu não deixa highlighted a terceira parada" — o destaque é do PEDAÇO
  // percorrido, então o traço do trecho é menor que o da linha inteira.
  it('o trecho percorrido de uma linha é um pedaço dela, não a linha toda', () => {
    const l2 = linhas.find((x) => x.nome === 'L2 POPULAR SUL')!
    const traco = e.tracos.get(l2.id)!
    const inteiro = traco.d
    // Central → Jardim Botânico: a linha segue até o Campus do Vale depois
    const trecho = trechoNoMapa(traco, 'Estação Central', 'Estação Jardim Botânico', CEL * 0.9)
    const nos = (d: string) => (d.match(/[MLQ]/g) ?? []).length
    expect(trecho).not.toBe('')
    expect(nos(trecho)).toBeLessThan(nos(inteiro))
    // fora da linha não devolve nada
    expect(trechoNoMapa(traco, 'Estação Central', 'Estação Zaffari', CEL * 0.9)).toBe('')
  })

  it('nenhuma linha dá volta: no máximo 60% mais comprida que o percurso parada-a-parada', () => {
    const voltas: string[] = []
    for (const l of linhas) {
      const seq = (l.circular && l.paradas.length > 2 ? [...l.paradas, l.paradas[0]!] : l.paradas)
        .map((n) => reais.get(n))
        .filter((p): p is PontoXY => !!p)
      let base = 0
      for (let i = 1; i < seq.length; i++) base += Math.hypot(seq[i]!.x - seq[i - 1]!.x, seq[i]!.y - seq[i - 1]!.y)
      const desenhado = segmentosRetos(e.tracos.get(l.id)?.d ?? '').reduce((s, x) => s + comp(x), 0)
      if (base > 0 && desenhado / base > 1.6) voltas.push(`${l.nome}: ${Math.round((desenhado / base - 1) * 100)}%`)
    }
    expect(voltas, voltas.join(' | ')).toEqual([])
  })
})
