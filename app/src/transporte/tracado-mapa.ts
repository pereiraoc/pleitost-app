// TRAÇADO DA MALHA SOBRE O MAPA REAL (report 2026-09-10: "conecta as linhas
// de uma forma que fique visualmente melhor, não tudo reto, mais tipo como tá
// na parte de transportes, pra ver as baldeações"). O esquemático (malha.ts)
// anda em grade octilinear com as linhas que dividem trecho correndo
// PARALELAS; aqui as paradas ficam onde estão no mapa e cada trecho entre duas
// paradas vira um COTOVELO de metrô — reta no eixo dominante + 45° — com o
// mesmo deslocamento perpendicular por trecho e cantos arredondados.
//
// Puro: recebe posições em unidades do desenho e devolve o `d` de cada linha.

export interface PontoXY {
  x: number
  y: number
}

export interface LinhaParaTracar {
  id: string
  paradas: string[]
  circular?: boolean
}

export interface OpcoesTracado {
  /** Distância entre linhas paralelas num trecho compartilhado. */
  folga: number
  /** Raio dos cantos arredondados. */
  raio: number
}

const EPS = 1e-6

/** Chave canônica do trecho entre duas paradas (sem sentido). */
function chaveTrecho(a: string, b: string): string {
  return a < b ? `${a} ⇄ ${b}` : `${b} ⇄ ${a}`
}

/** Cotovelo octilinear de S a E: primeiro a reta no eixo dominante, depois a
 *  diagonal de 45°. Sem cotovelo quando o trecho já é reto ou diagonal. */
export function cotovelo(s: PontoXY, e: PontoXY): PontoXY[] {
  const dx = e.x - s.x
  const dy = e.y - s.y
  const adx = Math.abs(dx)
  const ady = Math.abs(dy)
  const d = Math.min(adx, ady)
  if (d < EPS || Math.abs(adx - ady) < EPS) return [s, e]
  const k = adx > ady ? { x: s.x + Math.sign(dx) * (adx - d), y: s.y } : { x: s.x, y: s.y + Math.sign(dy) * (ady - d) }
  return [s, k, e]
}

/** Polilinha deslocada `off` pra esquerda de cada segmento; nas juntas, a
 *  interseção das duas retas deslocadas (junta em "mitra"). */
function deslocar(pts: PontoXY[], off: number): PontoXY[] {
  if (Math.abs(off) < EPS || pts.length < 2) return pts.map((p) => ({ ...p }))
  const normal = (a: PontoXY, b: PontoXY) => {
    const vx = b.x - a.x
    const vy = b.y - a.y
    const len = Math.hypot(vx, vy) || 1
    return { x: -vy / len, y: vx / len }
  }
  const segs = pts.slice(0, -1).map((a, i) => {
    const b = pts[i + 1]!
    const n = normal(a, b)
    return { a: { x: a.x + n.x * off, y: a.y + n.y * off }, b: { x: b.x + n.x * off, y: b.y + n.y * off } }
  })
  const out: PontoXY[] = [segs[0]!.a]
  for (let i = 0; i < segs.length - 1; i++) {
    const s1 = segs[i]!
    const s2 = segs[i + 1]!
    const d1 = { x: s1.b.x - s1.a.x, y: s1.b.y - s1.a.y }
    const d2 = { x: s2.b.x - s2.a.x, y: s2.b.y - s2.a.y }
    const den = d1.x * d2.y - d1.y * d2.x
    if (Math.abs(den) < EPS) {
      out.push({ x: (s1.b.x + s2.a.x) / 2, y: (s1.b.y + s2.a.y) / 2 })
      continue
    }
    const t = ((s2.a.x - s1.a.x) * d2.y - (s2.a.y - s1.a.y) * d2.x) / den
    out.push({ x: s1.a.x + d1.x * t, y: s1.a.y + d1.y * t })
  }
  out.push(segs[segs.length - 1]!.b)
  return out
}

/** `d` com cantos arredondados (curva quadrática com controle no vértice). */
export function caminhoArredondado(pts: PontoXY[], raio: number): string {
  const p = pts.filter((q, i) => i === 0 || Math.hypot(q.x - pts[i - 1]!.x, q.y - pts[i - 1]!.y) > EPS)
  if (p.length < 2) return ''
  const f = (n: number) => n.toFixed(1)
  const partes = [`M${f(p[0]!.x)} ${f(p[0]!.y)}`]
  for (let i = 1; i < p.length - 1; i++) {
    const a = p[i - 1]!
    const v = p[i]!
    const b = p[i + 1]!
    const lin = Math.hypot(v.x - a.x, v.y - a.y)
    const lout = Math.hypot(b.x - v.x, b.y - v.y)
    const din = { x: (v.x - a.x) / lin, y: (v.y - a.y) / lin }
    const dout = { x: (b.x - v.x) / lout, y: (b.y - v.y) / lout }
    const reto = Math.abs(din.x * dout.y - din.y * dout.x) < 1e-3 && din.x * dout.x + din.y * dout.y > 0
    const r = Math.min(raio, lin * 0.45, lout * 0.45)
    if (reto || r < EPS) {
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

/** Pontos (já deslocados) e `d` de cada linha. Trecho compartilhado por N
 *  linhas: cada uma corre deslocada (k − (N−1)/2) × folga, sempre do MESMO
 *  lado do sentido canônico do trecho — ida e volta de linhas diferentes não
 *  se cruzam. */
export function tracarLinhasNoMapa(
  linhas: LinhaParaTracar[],
  ponto: (parada: string) => PontoXY | null,
  opts: OpcoesTracado,
): Map<string, { d: string; pontos: PontoXY[] }> {
  const seqDe = (l: LinhaParaTracar) =>
    (l.circular && l.paradas.length > 2 ? [...l.paradas, l.paradas[0]!] : l.paradas).filter((n) => ponto(n))
  // 1. quem passa em cada trecho (ordem estável = ordem das linhas)
  const porTrecho = new Map<string, string[]>()
  for (const l of linhas) {
    const seq = seqDe(l)
    for (let i = 0; i < seq.length - 1; i++) {
      if (seq[i] === seq[i + 1]) continue
      const k = chaveTrecho(seq[i]!, seq[i + 1]!)
      const lst = porTrecho.get(k) ?? []
      if (!lst.includes(l.id)) lst.push(l.id)
      porTrecho.set(k, lst)
    }
  }
  // 2. cada linha: trecho a trecho, cotovelo canônico + deslocamento; na junta
  // entre dois trechos o deslocamento pode mudar — o arredondado vira degrau suave
  const out = new Map<string, { d: string; pontos: PontoXY[] }>()
  for (const l of linhas) {
    const seq = seqDe(l)
    const pontos: PontoXY[] = []
    for (let i = 0; i < seq.length - 1; i++) {
      const a = seq[i]!
      const b = seq[i + 1]!
      if (a === b) continue
      const canonico = a < b
      const s = ponto(canonico ? a : b)!
      const e = ponto(canonico ? b : a)!
      const lst = porTrecho.get(chaveTrecho(a, b)) ?? [l.id]
      const off = (lst.indexOf(l.id) - (lst.length - 1) / 2) * opts.folga
      const trecho = deslocar(cotovelo(s, e), off)
      pontos.push(...(canonico ? trecho : trecho.reverse()))
    }
    out.set(l.id, { d: caminhoArredondado(pontos, opts.raio), pontos })
  }
  return out
}
