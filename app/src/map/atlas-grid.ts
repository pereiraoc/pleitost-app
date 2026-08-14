// GRADE HEXAGONAL DO MAPA-MÚNDI (#420) — a malha desenhada no atlas.webp
// (7440×5262) é a MESMA grade do mundo do `Mapa do Mundo Livre.png`
// re-renderizada. Calibração (2026-08-06, "olha com a imagem do mapa mesmo"):
//   • transformação afim uniforme fitada por mínimos quadrados sobre âncoras
//     REAIS — pin do mestre no Krasnogor (3815,1614) + emblemas de Canto
//     Alto/Baar'Shava/Safira localizados na arte — s=0.74777,
//     t=(3620.1, 466.5), residuais ≤5px;
//   • autocorrelação da luminância da malha desenhada: HSTEP 83px e VSTEP
//     96px medidos = 0.748× os passos da grade antiga (111/128.17) —
//     confirmando que é a mesma malha;
//   • overlay visual da grade computada sobre recortes nos 4 cantos do mapa
//     (Krasnogor, Canto Alto, Magna Pátria, mar do sudeste): sem drift.
//
// REBASE: a origem herdada do Mundo Livre cairia em x≈3649 (Magna Pátria
// ficaria em colunas negativas). A grade do mundo desloca col+44/row+5
// (shift de coluna PAR — preserva a paridade do odd-q), cobrindo a imagem
// inteira: célula do Mundo Livre (c,r) ⇔ célula do mundo (c+44, r+5) — é o
// deslocamento aplicado ao derivar o seed `mapa:mundo` (seed-hexmaps.ts).
//
// A geometria replica exploracao.ts (flat-top, odd-q) com os parâmetros
// PRÓPRIOS deste mapa; exploracao.ts segue intocado (a grade/trilhas do
// Mundo Livre não migram de carona).

export const ATLAS_GRID_W = 7440
export const ATLAS_GRID_H = 5262

/** Paths EXATOS dos assets do mapa no manifest (byPath — sem resolução por
 *  basename). Moram aqui (módulo neutro da fonte do atlas) pra página do mapa
 *  E o wizard de criação (#452, preview da naturalidade) consumirem sem
 *  importar componente de página. */
export const ATLAS_MAPA_ASSET = 'Recursos e Mídia/Imagens/Mapas/atlas.webp'
export const ATLAS_OVERLAY_ASSET = 'Recursos e Mídia/Imagens/Mapas/atlas-overlay.webp'

/** Circunraio do hex flat-top na fonte do atlas.webp (74 × 0.74777). */
export const ATLAS_HEX_SIZE = 55.335
/** Origem REBASEADA do centro do hex (0,0): 39·s+tx − 44·HSTEP / 122·s+ty − 5·VSTEP. */
export const ATLAS_HEX_OFFSET_X = -2.85
export const ATLAS_HEX_OFFSET_Y = 78.52

export const ATLAS_HEX_HSTEP = 1.5 * ATLAS_HEX_SIZE
export const ATLAS_HEX_VSTEP = Math.sqrt(3) * ATLAS_HEX_SIZE

/** Deslocamento Mundo Livre → mundo (col PAR preserva paridade odd-q). */
export const ATLAS_COL_SHIFT = 44
export const ATLAS_ROW_SHIFT = 5

export interface AtlasHexCell {
  col: number
  row: number
}
export interface AtlasPt {
  x: number
  y: number
}

function odd(col: number): number {
  return col & 1
}

/** Centro do hex (col,row) em px da fonte do atlas.webp. */
export function atlasHexCenter(col: number, row: number): AtlasPt {
  return {
    x: ATLAS_HEX_OFFSET_X + ATLAS_HEX_HSTEP * col,
    y: ATLAS_HEX_OFFSET_Y + ATLAS_HEX_VSTEP * (row + 0.5 * odd(col)),
  }
}

/** Seis vértices do hex flat-top, em px da fonte. */
export function atlasHexVertices(col: number, row: number): AtlasPt[] {
  const { x: cx, y: cy } = atlasHexCenter(col, row)
  const out: AtlasPt[] = []
  for (let k = 0; k < 6; k++) {
    const a = (Math.PI / 180) * 60 * k
    out.push({ x: cx + ATLAS_HEX_SIZE * Math.cos(a), y: cy + ATLAS_HEX_SIZE * Math.sin(a) })
  }
  return out
}

/** `points` de um <polygon> SVG (1 casa decimal). */
export function atlasHexPolygonPoints(col: number, row: number): string {
  return atlasHexVertices(col, row)
    .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ')
}

/** Cube-round axial→offset odd-q — mesma matemática de exploracao.ts. */
function axialRound(q: number, r: number): AtlasHexCell {
  const x = q
  const z = r
  const y = -x - z
  let rx = Math.round(x)
  let ry = Math.round(y)
  let rz = Math.round(z)
  const dx = Math.abs(rx - x)
  const dy = Math.abs(ry - y)
  const dz = Math.abs(rz - z)
  if (dx > dy && dx > dz) rx = -ry - rz
  else if (dy > dz) ry = -rx - rz
  else rz = -rx - ry
  const col = rx + 0
  const row = rz + (rx - odd(rx)) / 2 + 0
  return { col, row }
}

/** Pixel da fonte → célula da grade do mundo. */
export function atlasPixelToHex(px: number, py: number): AtlasHexCell {
  const pxrel = px - ATLAS_HEX_OFFSET_X
  const pyrel = py - ATLAS_HEX_OFFSET_Y
  const q = ((2 / 3) * pxrel) / ATLAS_HEX_SIZE
  const r = ((-1 / 3) * pxrel + (Math.sqrt(3) / 3) * pyrel) / ATLAS_HEX_SIZE
  return axialRound(q, r)
}

/** Fração 0..1 da imagem → célula. */
export function atlasFracToHex(fx: number, fy: number): AtlasHexCell {
  return atlasPixelToHex(fx * ATLAS_GRID_W, fy * ATLAS_GRID_H)
}
