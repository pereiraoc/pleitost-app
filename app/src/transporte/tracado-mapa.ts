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
  return cotovelos(s, e)[0] ?? [s, e]
}

/** As duas formas de metrô de S a E — eixo-e-depois-45° e 45°-e-depois-eixo.
 *  Vazio quando o trecho já é octilinear (reto ou diagonal). */
function cotovelos(s: PontoXY, e: PontoXY): PontoXY[][] {
  const dx = e.x - s.x
  const dy = e.y - s.y
  const adx = Math.abs(dx)
  const ady = Math.abs(dy)
  const d = Math.min(adx, ady)
  if (d < EPS || Math.abs(adx - ady) < EPS) return []
  const sx = Math.sign(dx)
  const sy = Math.sign(dy)
  const eixoPrimeiro = adx > ady ? { x: s.x + sx * (adx - d), y: s.y } : { x: s.x, y: s.y + sy * (ady - d) }
  const diagPrimeiro = { x: s.x + sx * d, y: s.y + sy * d }
  return [
    [s, eixoPrimeiro, e],
    [s, diagPrimeiro, e],
  ]
}

const dist = (a: PontoXY, b: PontoXY) => Math.hypot(b.x - a.x, b.y - a.y)

/** Ângulo (graus, 0–180) entre as direções a→b e c→d. */
function virada(a: PontoXY, b: PontoXY, c: PontoXY, d: PontoXY): number {
  const u = { x: b.x - a.x, y: b.y - a.y }
  const v = { x: d.x - c.x, y: d.y - c.y }
  const lu = Math.hypot(u.x, u.y)
  const lv = Math.hypot(v.x, v.y)
  if (lu < EPS || lv < EPS) return 0
  const cos = (u.x * v.x + u.y * v.y) / (lu * lv)
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI
}

/** `d` com cantos vivos, como o esquemático; só as viradas suaves (≤ 90°)
 *  ganham um arredondado pequeno, limitado pela perna — arredondar virada
 *  fechada é o que fazia gancho. */
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
    const g = virada(a, v, v, b)
    const r = Math.min(raio, lin * 0.3, lout * 0.3)
    if (g < 1 || g > 90 || r < EPS) {
      partes.push(`L${f(v.x)} ${f(v.y)}`)
      continue
    }
    const din = { x: (v.x - a.x) / lin, y: (v.y - a.y) / lin }
    const dout = { x: (b.x - v.x) / lout, y: (b.y - v.y) / lout }
    partes.push(`L${f(v.x - din.x * r)} ${f(v.y - din.y * r)}`)
    partes.push(`Q${f(v.x)} ${f(v.y)} ${f(v.x + dout.x * r)} ${f(v.y + dout.y * r)}`)
  }
  const u = p[p.length - 1]!
  partes.push(`L${f(u.x)} ${f(u.y)}`)
  return partes.join(' ')
}

interface Sub {
  a: PontoXY
  b: PontoXY
  /** deslocamento à ESQUERDA do sentido a→b */
  off: number
}

function deslocado(s: Sub): { a: PontoXY; b: PontoXY } {
  const l = dist(s.a, s.b) || 1
  const n = { x: -(s.b.y - s.a.y) / l, y: (s.b.x - s.a.x) / l }
  return {
    a: { x: s.a.x + n.x * s.off, y: s.a.y + n.y * s.off },
    b: { x: s.b.x + n.x * s.off, y: s.b.y + n.y * s.off },
  }
}

/** Junta segmentos deslocados consecutivos. A interseção (junta em mitra) só
 *  vale se cair PERTO da junta original — senão o segmento inverteria o
 *  sentido (o laço da primeira versão) e a junta vira o ponto médio. */
function juntar(subs: Sub[]): PontoXY[] {
  if (!subs.length) return []
  const ds = subs.map(deslocado)
  const out: PontoXY[] = [ds[0]!.a]
  for (let i = 0; i < ds.length - 1; i++) {
    const s1 = ds[i]!
    const s2 = ds[i + 1]!
    const d1 = { x: s1.b.x - s1.a.x, y: s1.b.y - s1.a.y }
    const d2 = { x: s2.b.x - s2.a.x, y: s2.b.y - s2.a.y }
    const den = d1.x * d2.y - d1.y * d2.x
    const meio = { x: (s1.b.x + s2.a.x) / 2, y: (s1.b.y + s2.a.y) / 2 }
    if (Math.abs(den) < EPS) {
      // paralelos: mesma faixa emenda reto; faixa diferente vira um degrau
      if (dist(s1.b, s2.a) < 0.5) out.push(meio)
      else out.push(s1.b, s2.a)
      continue
    }
    const t = ((s2.a.x - s1.a.x) * d2.y - (s2.a.y - s1.a.y) * d2.x) / den
    const u = ((s2.a.x - s1.a.x) * d1.y - (s2.a.y - s1.a.y) * d1.x) / den
    const junta = subs[i]!.b
    const alcance = 2 * Math.max(Math.abs(subs[i]!.off), Math.abs(subs[i + 1]!.off), 0.5)
    const x = { x: s1.a.x + d1.x * t, y: s1.a.y + d1.y * t }
    if (t > 0.05 && u < 0.95 && dist(x, junta) <= alcance) out.push(x)
    else out.push(meio)
  }
  out.push(ds[ds.length - 1]!.b)
  return out
}

/** Pontos (já deslocados) e `d` de cada linha. Por trecho (par de paradas,
 *  sem sentido) decide-se UMA geometria — todas as linhas que passam ali
 *  correm paralelas nela, deslocadas (k − (N−1)/2) × folga do mesmo lado do
 *  sentido canônico:
 *   - cotovelo de metrô só quando as duas pernas cabem (≥ 3 × folga e ≥ o
 *     deslocamento do feixe); das duas formas, a que menos vira contra as
 *     paradas vizinhas — e nenhuma, se as duas virarem mais que a reta;
 *   - o deslocamento nunca passa de 20% da perna mais curta, e trecho curto
 *     (< 4 × folga) não abre feixe. */
export function tracarLinhasNoMapa(
  linhas: LinhaParaTracar[],
  ponto: (parada: string) => PontoXY | null,
  opts: OpcoesTracado,
): Map<string, { d: string; pontos: PontoXY[] }> {
  const seqDe = (l: LinhaParaTracar) =>
    (l.circular && l.paradas.length > 2 ? [...l.paradas, l.paradas[0]!] : l.paradas).filter((n) => ponto(n))
  // 1. quem passa em cada trecho e com que vizinhos (no sentido canônico)
  const porTrecho = new Map<string, { linhas: string[]; antes: PontoXY[]; depois: PontoXY[] }>()
  for (const l of linhas) {
    const seq = seqDe(l)
    for (let i = 0; i < seq.length - 1; i++) {
      const a = seq[i]!
      const b = seq[i + 1]!
      if (a === b) continue
      const k = chaveTrecho(a, b)
      const t = porTrecho.get(k) ?? { linhas: [], antes: [], depois: [] }
      if (!t.linhas.includes(l.id)) t.linhas.push(l.id)
      const canonico = a < b
      const prev = seq[i - 1] ? ponto(seq[i - 1]!) : null
      const next = seq[i + 2] ? ponto(seq[i + 2]!) : null
      // "antes" = vizinho do lado de S; "depois" = do lado de E (canônicos)
      if (canonico) {
        if (prev) t.antes.push(prev)
        if (next) t.depois.push(next)
      } else {
        if (next) t.antes.push(next)
        if (prev) t.depois.push(prev)
      }
      porTrecho.set(k, t)
    }
  }
  // 2. geometria de cada trecho (canônica S→E)
  const geometria = new Map<string, PontoXY[]>()
  for (const [k, t] of porTrecho) {
    const [na, nb] = k.split(' ⇄ ') as [string, string]
    const s = ponto(na)!
    const e = ponto(nb)!
    const n = t.linhas.length
    const feixe = ((n - 1) / 2) * opts.folga
    const pernaMin = Math.max(3 * opts.folga, feixe * 5)
    const custo = (pts: PontoXY[]) => {
      let soma = 0
      let pior = 0
      for (const p of t.antes) {
        const g = virada(p, s, pts[0]!, pts[1]!)
        soma += g
        pior = Math.max(pior, g)
      }
      for (const p of t.depois) {
        const g = virada(pts[pts.length - 2]!, pts[pts.length - 1]!, e, p)
        soma += g
        pior = Math.max(pior, g)
      }
      return { soma, pior }
    }
    const reta = [s, e]
    const cReta = custo(reta)
    let melhor = reta
    let cMelhor = { soma: Infinity, pior: Infinity }
    for (const c of cotovelos(s, e)) {
      if (dist(c[0]!, c[1]!) < pernaMin || dist(c[1]!, c[2]!) < pernaMin) continue
      const cc = custo(c)
      if (cc.soma < cMelhor.soma) {
        melhor = c
        cMelhor = cc
      }
    }
    if (melhor !== reta && cMelhor.pior > 120 && cMelhor.pior > cReta.pior) melhor = reta
    geometria.set(k, melhor)
  }
  // 3. cada linha: sub-segmentos no sentido dela, deslocados e juntados
  const out = new Map<string, { d: string; pontos: PontoXY[] }>()
  for (const l of linhas) {
    const seq = seqDe(l)
    const subs: Sub[] = []
    for (let i = 0; i < seq.length - 1; i++) {
      const a = seq[i]!
      const b = seq[i + 1]!
      if (a === b) continue
      const k = chaveTrecho(a, b)
      const geo = geometria.get(k)!
      const lst = porTrecho.get(k)!.linhas
      let perna = Infinity
      for (let j = 0; j < geo.length - 1; j++) perna = Math.min(perna, dist(geo[j]!, geo[j + 1]!))
      const bruto = (lst.indexOf(l.id) - (lst.length - 1) / 2) * opts.folga
      // trecho curto (aglomerado de paradas, circular de bairro) não abre
      // feixe: as linhas se sobrepõem ali — paralela é pra corredor
      const off = perna < 4 * opts.folga ? 0 : Math.sign(bruto) * Math.min(Math.abs(bruto), perna * 0.2)
      const canonico = a < b
      const pts = canonico ? geo : [...geo].reverse()
      // no sentido inverso, a esquerda troca de lado
      for (let j = 0; j < pts.length - 1; j++) subs.push({ a: pts[j]!, b: pts[j + 1]!, off: canonico ? off : -off })
    }
    const pontos = juntar(subs)
    out.set(l.id, { d: caminhoArredondado(pontos, opts.raio), pontos })
  }
  return out
}
