// A MALHA SOBRE O MAPA REAL, do jeito dos mapas de metrô (report 2026-09-10,
// com o mapa de Paris de referência: "dá uma olhada como em geral se faz os
// mapas de metrô quando tem o mapa real"). O que deixa o esquemático da aba
// Transporte legível não é a posição das estações — é que cada trecho anda
// pelas ARESTAS de uma grade octilinear, e linhas que passam pelos mesmos
// quadrinhos dividem a aresta e correm em FEIXE paralelo. Aqui a mesma
// máquina (desenharMalha) roda numa grade fina estendida sobre o mapa real:
// cada estação vai pro nó mais perto da posição dela (quem tem mais linhas
// escolhe primeiro; aglomerado se espalha pros nós vizinhos livres) e anda,
// no máximo, uns poucos quadrinhos.
//
// Puro: malha + posições reais → traços (em unidades do mapa) e estações.
import { desenharMalha, type LinhaMalha, type Malha, type ParadaMalha } from './malha'

export interface PontoXY {
  x: number
  y: number
}

export interface OpcoesEsquema {
  /** Lado do quadrinho da grade, em unidades do mapa. */
  celula: number
  /** Distância entre linhas paralelas no feixe. */
  folga: number
  /** Raio das curvas. */
  raio: number
}

export interface EstacaoNoMapa extends PontoXY {
  baldeacao: boolean
}

export interface EsquemaNoMapa {
  /** `d` de cada linha visível (unidades do mapa). */
  tracos: Map<string, string>
  /** Onde cada estação desenhada ficou. */
  estacoes: Map<string, EstacaoNoMapa>
}

const EPS = 1e-6
const dist = (a: PontoXY, b: PontoXY) => Math.hypot(b.x - a.x, b.y - a.y)

/** Nó da grade de cada estação. A grade tem y crescendo pro NORTE (como o
 *  bloco ```malha```) — o mapa tem y crescendo pro sul. */
export function encaixarNaGrade(
  reais: Map<string, PontoXY>,
  prioridade: (nome: string) => number,
  celula: number,
): Map<string, { x: number; y: number }> {
  const ocupados = new Set<string>()
  const out = new Map<string, { x: number; y: number }>()
  const ordem = [...reais.keys()].sort((a, b) => prioridade(b) - prioridade(a) || a.localeCompare(b, 'pt-BR'))
  for (const nome of ordem) {
    const r = reais.get(nome)!
    const gx = Math.round(r.x / celula)
    const gy = Math.round(-r.y / celula)
    let achou: { x: number; y: number } | null = null
    for (let anel = 0; !achou && anel < 64; anel++) {
      let melhor = Infinity
      for (let dx = -anel; dx <= anel; dx++) {
        for (let dy = -anel; dy <= anel; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== anel) continue
          const x = gx + dx
          const y = gy + dy
          if (ocupados.has(`${x},${y}`)) continue
          const d = Math.hypot(x * celula - r.x, -y * celula - r.y)
          if (d < melhor) {
            melhor = d
            achou = { x, y }
          }
        }
      }
    }
    if (!achou) continue
    ocupados.add(`${achou.x},${achou.y}`)
    out.set(nome, achou)
  }
  return out
}

/** `d` com curvas: cada virada de até 90° vira um arco (quadrática com
 *  controle no vértice) de raio limitado pela perna; virada mais fechada fica
 *  em canto vivo — arredondar ali é o que fazia gancho. */
export function caminhoArredondado(pts: PontoXY[], raio: number): string {
  const p = pts.filter((q, i) => i === 0 || dist(pts[i - 1]!, q) > EPS)
  if (p.length < 2) return ''
  const f = (n: number) => n.toFixed(1)
  const partes = [`M${f(p[0]!.x)} ${f(p[0]!.y)}`]
  for (let i = 1; i < p.length - 1; i++) {
    const a = p[i - 1]!
    const v = p[i]!
    const b = p[i + 1]!
    const lin = dist(a, v)
    const lout = dist(v, b)
    const din = { x: (v.x - a.x) / lin, y: (v.y - a.y) / lin }
    const dout = { x: (b.x - v.x) / lout, y: (b.y - v.y) / lout }
    const cos = din.x * dout.x + din.y * dout.y
    const g = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI
    const r = Math.min(raio, lin * 0.45, lout * 0.45)
    if (g < 1 || g > 90 || r < EPS) {
      partes.push(`L${f(v.x)} ${f(v.y)}`)
      continue
    }
    partes.push(`L${f(v.x - din.x * r)} ${f(v.y - din.y * r)}`)
    partes.push(`Q${f(v.x)} ${f(v.y)} ${f(v.x + dout.x * r)} ${f(v.y + dout.y * r)}`)
  }
  const u = p[p.length - 1]!
  partes.push(`L${f(u.x)} ${f(u.y)}`)
  return partes.join(' ')
}

/** A malha com as estações nos nós da grade sobre o mapa real — a mesma
 *  estrutura que o esquemático usa, pronta pro roteamento dele. */
export function malhaNaGrade(malha: Malha, nos: Map<string, { x: number; y: number }>): Malha {
  const paradas = new Map<string, ParadaMalha>()
  for (const [nome, g] of nos) {
    const linhas = malha.linhas.filter((l) => !l.fechada && l.paradas.includes(nome)).map((l) => l.id)
    paradas.set(nome, { ...(malha.paradas.get(nome) ?? {}), nome, x: g.x, y: g.y, linhas })
  }
  return { linhas: malha.linhas, paradas }
}

/** A malha visível desenhada na grade sobre o mapa real. `nos` vem de
 *  encaixarNaGrade (calculado sobre TODAS as linhas, pra estação não mudar de
 *  lugar quando o filtro muda). */
export function esquemaNoMapa(
  malha: Malha,
  visiveis: LinhaMalha[],
  nos: Map<string, { x: number; y: number }>,
  opts: OpcoesEsquema,
): EsquemaNoMapa {
  const des = desenharMalha(malhaNaGrade(malha, nos), visiveis, {
    unidade: opts.celula,
    margem: 0,
    margemRotulo: 0,
    folga: opts.folga,
  })
  const tracos = new Map<string, string>()
  const estacoes = new Map<string, EstacaoNoMapa>()
  const ref = des.paradas[0]
  if (!ref) return { tracos, estacoes }
  // desenharMalha desenha em px relativos ao canto da malha; volta pro mapa
  const g0 = nos.get(ref.nome)!
  const tx = g0.x * opts.celula - ref.cx
  const ty = -g0.y * opts.celula - ref.cy
  for (const t of des.tracos) {
    const nums = (t.d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
    const pts: PontoXY[] = []
    for (let i = 0; i + 1 < nums.length; i += 2) pts.push({ x: nums[i]! + tx, y: nums[i + 1]! + ty })
    tracos.set(t.id, caminhoArredondado(pts, opts.raio))
  }
  for (const p of des.paradas) estacoes.set(p.nome, { x: p.cx + tx, y: p.cy + ty, baldeacao: p.baldeacao })
  return { tracos, estacoes }
}
