// VISTAS do mapa-múndi pro hexcrawl de GRUPOS (pedido do mestre): a exploração
// passa a usar o atlas.webp inteiro (grade calibrada de atlas-grid.ts) e cada
// VISTA limita o VIEWPORT a um recorte do mundo — as trilhas continuam em
// coordenadas do MUNDO (uma só grade), a vista é só a janela:
//   • Mundo Livre   → só a parte à DIREITA do hex mais à direita da Magna Pátria
//   • Magna Pátria  → o inverso (a parte à ESQUERDA do mesmo corte)
//   • Pátria Aurora → zoom na caixa dos hexes da região
//   • Mundo Completo→ tudo
// O corte deriva das CÉLULAS das regiões marcadas no mapa do mestre
// (mapa-atlas-store; o seed embarcado garante a geometria pra todo viewer) —
// nada de pixel mágico. Região ausente (renomeada/apagada) → cai no mundo
// completo, nunca quebra.
import {
  ATLAS_GRID_H,
  ATLAS_GRID_W,
  ATLAS_HEX_SIZE,
  ATLAS_HEX_HSTEP,
  ATLAS_HEX_VSTEP,
  ATLAS_HEX_OFFSET_X,
  ATLAS_HEX_OFFSET_Y,
  atlasHexCenter,
  atlasHexVertices,
} from './atlas-grid'
import type { MapaRegiao } from './mapa-atlas-store'

/** Path EXATO do asset do mapa-múndi no manifest (o mesmo do /mapa). */
export const MAPA_MUNDO_ASSET = 'Recursos e Mídia/Imagens/Mapas/atlas.webp'

export const VISTA_MUNDO_COMPLETO = 'vista:mundo-completo'

export interface MapaVista {
  /** Valor persistido em group-store.regiaoAtiva (ids de doc quando o lugar
   *  existe no Atlas — o do Mundo Livre é o MESMO id do registro antigo, então
   *  a escolha já salva dos grupos continua valendo). */
  id: string
  /** Rótulo fallback (vista sem doc no catálogo). */
  nome: string
  modo: 'direita-de' | 'esquerda-de' | 'bbox' | 'tudo'
  /** Nome da REGIÃO do mapa do mestre (mapa-atlas-store) que define o corte. */
  regiaoNome?: string
}

export const MAPA_VISTAS: MapaVista[] = [
  {
    id: 'Atlas/Mundo Livre/Mundo Livre',
    nome: 'Mundo Livre',
    modo: 'direita-de',
    regiaoNome: 'Magna Pátria',
  },
  {
    id: 'Atlas/Magna Pátria/Magna Pátria',
    nome: 'Magna Pátria',
    modo: 'esquerda-de',
    regiaoNome: 'Magna Pátria',
  },
  { id: 'vista:patria-aurora', nome: 'Pátria Aurora', modo: 'bbox', regiaoNome: 'Pátria Aurora' },
  { id: VISTA_MUNDO_COMPLETO, nome: 'Mundo Completo', modo: 'tudo' },
]

/** Recorte do mapa em px da FONTE (atlas.webp 7440×5262). */
export interface MapaCrop {
  x: number
  y: number
  w: number
  h: number
}

export const CROP_MUNDO: MapaCrop = { x: 0, y: 0, w: ATLAS_GRID_W, h: ATLAS_GRID_H }

function clampCrop(x0: number, y0: number, x1: number, y1: number): MapaCrop {
  const cx0 = Math.max(0, Math.min(ATLAS_GRID_W, x0))
  const cy0 = Math.max(0, Math.min(ATLAS_GRID_H, y0))
  const cx1 = Math.max(cx0 + 1, Math.min(ATLAS_GRID_W, x1))
  const cy1 = Math.max(cy0 + 1, Math.min(ATLAS_GRID_H, y1))
  return { x: cx0, y: cy0, w: cx1 - cx0, h: cy1 - cy0 }
}

/** Borda DIREITA (px) do hex mais à direita da região — a linha de corte
 *  Mundo Livre ⇄ Magna Pátria. */
function bordaDireita(r: MapaRegiao): number {
  let px = -Infinity
  for (const c of r.cells) px = Math.max(px, atlasHexCenter(c.col, c.row).x + ATLAS_HEX_SIZE)
  return px
}

/** Crop da vista, derivado das regiões do mapa do mestre. Vista desconhecida
 *  ou região ausente → mundo completo. */
export function vistaCrop(vistaId: string, regioes: MapaRegiao[]): MapaCrop {
  const vista = MAPA_VISTAS.find((v) => v.id === vistaId)
  if (!vista || vista.modo === 'tudo') return CROP_MUNDO
  const regiao = regioes.find((r) => r.nome === vista.regiaoNome && r.cells.length > 0)
  if (!regiao) return CROP_MUNDO
  if (vista.modo === 'direita-de') {
    const corte = bordaDireita(regiao)
    return clampCrop(corte, 0, ATLAS_GRID_W, ATLAS_GRID_H)
  }
  if (vista.modo === 'esquerda-de') {
    const corte = bordaDireita(regiao)
    return clampCrop(0, 0, corte, ATLAS_GRID_H)
  }
  // bbox: caixa dos hexes da região + 1 hex de folga (o "zoom" da Pátria Aurora)
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const c of regiao.cells) {
    const p = atlasHexCenter(c.col, c.row)
    x0 = Math.min(x0, p.x)
    y0 = Math.min(y0, p.y)
    x1 = Math.max(x1, p.x)
    y1 = Math.max(y1, p.y)
  }
  const mx = ATLAS_HEX_SIZE * 2
  const my = ATLAS_HEX_VSTEP
  return clampCrop(x0 - mx, y0 - my, x1 + mx, y1 + my)
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/** Células da grade do mundo que cobrem o crop (com 1 hex de margem). */
export function vistaGridCells(crop: MapaCrop): { col: number; row: number }[] {
  const cells: { col: number; row: number }[] = []
  const c0 = Math.floor((crop.x - ATLAS_HEX_SIZE - ATLAS_HEX_OFFSET_X) / ATLAS_HEX_HSTEP)
  const c1 = Math.ceil((crop.x + crop.w + ATLAS_HEX_SIZE - ATLAS_HEX_OFFSET_X) / ATLAS_HEX_HSTEP)
  const r0 = Math.floor((crop.y - ATLAS_HEX_SIZE - ATLAS_HEX_OFFSET_Y) / ATLAS_HEX_VSTEP) - 1
  const r1 = Math.ceil((crop.y + crop.h + ATLAS_HEX_SIZE - ATLAS_HEX_OFFSET_Y) / ATLAS_HEX_VSTEP)
  for (let col = c0; col <= c1; col++) {
    for (let row = r0; row <= r1; row++) cells.push({ col, row })
  }
  return cells
}

/** `d` de um <path> ÚNICO com a malha do crop — mesma técnica do hexGridPath
 *  da exploração (cadeia v2→v3→v4→v5 por hex; arestas internas saem 1×). */
export function vistaGridPath(crop: MapaCrop): string {
  let d = ''
  for (const { col, row } of vistaGridCells(crop)) {
    const v = atlasHexVertices(col, row)
    d += `M${round1(v[2]!.x)},${round1(v[2]!.y)}L${round1(v[3]!.x)},${round1(v[3]!.y)}L${round1(v[4]!.x)},${round1(v[4]!.y)}L${round1(v[5]!.x)},${round1(v[5]!.y)}`
  }
  return d
}
