// GRADE HEX EM ESPAÇO DE TELA (#573) — a matemática pura do canvas que
// desenha a malha do hexcrawl FORA do div transformado. O SVG mapeava o crop
// (viewBox) pra caixa do div e o div recebia translate(tx,ty) scale(s) com
// origem 0 0; aqui a mesma conta leva um px da fonte direto pra px da
// viewport, e só as células visíveis são traçadas, com linha de 1 px de tela
// em qualquer zoom (o que o `vector-effect: non-scaling-stroke` fazia).
//
// Por quê: no Gecko o path de 11k segmentos dentro do SVG transformado era o
// blob mais caro a re-rasterizar por quadro do gesto (57 ms por thread por
// gesto no desktop). Fora do div transformado, o custo é traçar as células
// visíveis uma vez por quadro — e some a re-rasterização.
import type { Geo, MapView } from './useMapView'

/** Recorte da fonte que a caixa do div mostra (o crop da vista; a imagem
 *  inteira é {0,0,W,H}). */
export interface Fonte {
  x: number
  y: number
  w: number
  h: number
}

export interface Ponto {
  x: number
  y: number
}

export interface Celula {
  col: number
  row: number
}

/** px da fonte → px da viewport (a mesma conta do SVG + transform). */
export function fonteParaTela(geo: Geo, view: MapView, fonte: Fonte, p: Ponto): Ponto {
  return {
    x: geo.layoutLeft + view.tx + ((p.x - fonte.x) / fonte.w) * geo.baseW * view.scale,
    y: geo.layoutTop + view.ty + ((p.y - fonte.y) / fonte.h) * geo.baseH * view.scale,
  }
}

/** Inverso: px da viewport → px da fonte (sem clamp). */
export function telaParaFonte(geo: Geo, view: MapView, fonte: Fonte, p: Ponto): Ponto {
  return {
    x: fonte.x + ((p.x - geo.layoutLeft - view.tx) / (geo.baseW * view.scale)) * fonte.w,
    y: fonte.y + ((p.y - geo.layoutTop - view.ty) / (geo.baseH * view.scale)) * fonte.h,
  }
}

/** Retângulo da fonte visível na viewport, clampado ao crop. */
export function retanguloFonteVisivel(geo: Geo, view: MapView, fonte: Fonte): Fonte {
  const a = telaParaFonte(geo, view, fonte, { x: 0, y: 0 })
  const b = telaParaFonte(geo, view, fonte, { x: geo.vpW, y: geo.vpH })
  const x0 = Math.max(fonte.x, Math.min(a.x, b.x))
  const y0 = Math.max(fonte.y, Math.min(a.y, b.y))
  const x1 = Math.min(fonte.x + fonte.w, Math.max(a.x, b.x))
  const y1 = Math.min(fonte.y + fonte.h, Math.max(a.y, b.y))
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) }
}

/** Célula com os vértices e a caixa já calculados — o pré-computo roda uma
 *  vez por troca de grade (vista/crop), não a cada quadro. */
export interface CelulaPreparada extends Celula {
  v: Ponto[]
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface GradePreparada {
  celulas: CelulaPreparada[]
  /** Maior extensão de uma célula (margem de culling), em px da fonte. */
  margem: number
}

export function prepararGrade(cells: readonly Celula[], vertices: (col: number, row: number) => Ponto[]): GradePreparada {
  const celulas: CelulaPreparada[] = []
  let margem = 0
  for (const c of cells) {
    const v = vertices(c.col, c.row)
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const p of v) {
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.y < minY) minY = p.y
      if (p.y > maxY) maxY = p.y
    }
    celulas.push({ col: c.col, row: c.row, v, minX, minY, maxX, maxY })
    margem = Math.max(margem, maxX - minX, maxY - minY)
  }
  return { celulas, margem }
}

/** Células cuja caixa toca o retângulo, com `margem` em px da fonte pra não
 *  deixar buraco na borda. */
export function celulasVisiveis<C extends Celula>(
  cells: readonly C[],
  vertices: (col: number, row: number) => Ponto[],
  ret: Fonte,
  margem: number,
): C[] {
  const prep = prepararGrade(cells, vertices)
  const idx = new Set(visiveisPreparadas(prep.celulas, ret, margem).map((c) => `${c.col},${c.row}`))
  return cells.filter((c) => idx.has(`${c.col},${c.row}`))
}

function visiveisPreparadas(celulas: readonly CelulaPreparada[], ret: Fonte, margem: number): CelulaPreparada[] {
  const x0 = ret.x - margem
  const y0 = ret.y - margem
  const x1 = ret.x + ret.w + margem
  const y1 = ret.y + ret.h + margem
  const out: CelulaPreparada[] = []
  for (const c of celulas) {
    if (c.maxX < x0 || c.minX > x1 || c.maxY < y0 || c.minY > y1) continue
    out.push(c)
  }
  return out
}

export interface EstiloGrade {
  cor: string
  alpha: number
}

/** Traça a malha: por célula visível, a cadeia v2→v3→v4→v5 (as mesmas arestas
 *  do `hexGridPath` — cada aresta interna sai uma vez), 1 px de tela, um único
 *  stroke. Devolve quantas células traçou. `dpr` escala o bitmap do canvas;
 *  o canvas tem `vpW×dpr` por `vpH×dpr` e a conta segue em px CSS. */
export function desenharGrade(
  ctx: CanvasRenderingContext2D,
  dpr: number,
  geo: Geo,
  view: MapView,
  fonte: Fonte,
  grade: GradePreparada,
  estilo: EstiloGrade,
): number {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, geo.vpW, geo.vpH)
  const visiveis = visiveisPreparadas(grade.celulas, retanguloFonteVisivel(geo, view, fonte), grade.margem)
  // a conta fonte→tela é afim: fatora fora do laço (sem alocar ponto por vértice)
  const kx = (geo.baseW * view.scale) / fonte.w
  const ky = (geo.baseH * view.scale) / fonte.h
  const ox = geo.layoutLeft + view.tx - fonte.x * kx
  const oy = geo.layoutTop + view.ty - fonte.y * ky
  ctx.lineWidth = 1
  ctx.strokeStyle = estilo.cor
  ctx.globalAlpha = estilo.alpha
  ctx.beginPath()
  for (const c of visiveis) {
    const v = c.v
    ctx.moveTo(v[2]!.x * kx + ox, v[2]!.y * ky + oy)
    ctx.lineTo(v[3]!.x * kx + ox, v[3]!.y * ky + oy)
    ctx.lineTo(v[4]!.x * kx + ox, v[4]!.y * ky + oy)
    ctx.lineTo(v[5]!.x * kx + ox, v[5]!.y * ky + oy)
  }
  ctx.stroke()
  return visiveis.length
}
