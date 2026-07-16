// Aba EXPLORAÇÃO (issue #36) — dropdown de Localizações do Atlas pro ponto
// da trilha. REUSA o scan exportado das regras (listLocalizacoes em
// src/rules/naturalidade.ts, porta de listLocalizacoes do plugin) e espelha
// a APRESENTAÇÃO em árvore do naturalidade-picker (indentação de 2 NBSP por
// nível, ícone do registro por subcategoria, filhos por pasta em pt-BR,
// folhas Capital → Grande → Pequena → resto alfabético). Diferença de
// contrato, própria desta tela: TODO doc de Localização é selecionável
// (o grupo pode estar numa Região/Nação/Ponto de Interesse, não só numa
// cidade) e o value é o ID do doc no catálogo — o ponto guarda localId.
import type { Catalog } from '../data/catalog'
import { listLocalizacoes, type NaturalidadeOption } from '../rules/naturalidade'
import { tokens } from '../components/ficha/registry'

// ─────────────────────────────────────────────────────────────────────────
// GRADE HEXAGONAL do mapa (issue #48)
//
// O `Mapa do Mundo Livre.png` é hex-based (tiles flat-top desenhados na
// arte). A grade sobreposta reproduz ESSA malha em coordenadas de PIXEL DA
// FONTE (0..MAP_W × 0..MAP_H) — o overlay SVG usa esse viewBox e vive dentro
// do mesmo transform (zoom/pan) do mapa, então acompanha tudo sem recalcular.
//
// Números CALIBRADOS por autocorrelação + template-match das bordas escuras
// dos hexes da arte (luminância média nas arestas 69.9 vs 103.2 do mapa) e
// conferidos por overlay em toda a extensão (sem drift nos 4 cantos):
//   size 74 · offX 39 · offY 122 (px da fonte). Orientação flat-top:
//   largura 2·size=148, altura √3·size≈128, passo horiz 1.5·size=111, passo
//   vert √3·size≈128, colunas ímpares deslocadas √3·size/2≈64 pra baixo.
// Layout de offset "odd-q" (coluna ímpar empurrada meio-hex pra baixo).

/** Dimensões em pixel da imagem-fonte do mapa (viewBox do overlay SVG). */
export const MAP_W = 4352
export const MAP_H = 5888

/** Circunraio do hexágono flat-top na resolução da fonte (center→vértice). */
export const HEX_SIZE = 74
/** Origem calibrada do centro do hex (col,row)=(0,0), em px da fonte. */
export const HEX_OFFSET_X = 39
export const HEX_OFFSET_Y = 122

/** Passo horizontal entre centros de coluna (= 1.5·size). */
export const HEX_HSTEP = 1.5 * HEX_SIZE
/** Passo vertical entre centros na MESMA coluna (= √3·size = altura). */
export const HEX_VSTEP = Math.sqrt(3) * HEX_SIZE

export interface HexCell {
  col: number
  row: number
}
export interface Pt {
  x: number
  y: number
}

/** É odd-q? (coluna ímpar empurrada meio-hex pra baixo). `& 1` acerta o teste
 *  de paridade também pra col negativa em JS. */
function odd(col: number): number {
  return col & 1
}

/** Centro do hex (col,row) em pixel da fonte — derivado, nunca guardado. */
export function hexCenter(col: number, row: number): Pt {
  return {
    x: HEX_OFFSET_X + HEX_HSTEP * col,
    y: HEX_OFFSET_Y + HEX_VSTEP * (row + 0.5 * odd(col)),
  }
}

/** Seis vértices do hex flat-top (ângulos 0,60,…,300°), em px da fonte. */
export function hexVertices(col: number, row: number): Pt[] {
  const { x: cx, y: cy } = hexCenter(col, row)
  const out: Pt[] = []
  for (let k = 0; k < 6; k++) {
    const a = (Math.PI / 180) * 60 * k
    out.push({ x: cx + HEX_SIZE * Math.cos(a), y: cy + HEX_SIZE * Math.sin(a) })
  }
  return out
}

/** `points` de um <polygon> SVG (px da fonte) — 1 casa decimal. */
export function hexPolygonPoints(col: number, row: number): string {
  return hexVertices(col, row)
    .map((p) => `${round1(p.x)},${round1(p.y)}`)
    .join(' ')
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/** Subpath fechado de UM hex (px da fonte) — pra compor a união de uma área. */
function hexSubpath(col: number, row: number): string {
  const v = hexVertices(col, row)
  let d = `M${round1(v[0].x)},${round1(v[0].y)}`
  for (let k = 1; k < 6; k++) d += `L${round1(v[k].x)},${round1(v[k].y)}`
  return d + 'Z'
}

/** `d` de um <path> ÚNICO cobrindo TODOS os hexes de `cells` — uma ÁREA
 *  desenhada como um só nó DOM (barato mesmo com centenas de hexes). Preenchida
 *  com nonzero, hexes adjacentes fundem numa zona sólida (#79). */
export function hexUnionPath(cells: { col: number; row: number }[]): string {
  let d = ''
  for (const c of cells) d += hexSubpath(c.col, c.row)
  return d
}

/** Arredondamento em coordenadas cubo (Red Blob) pra achar o hex mais próximo. */
function axialRound(q: number, r: number): HexCell {
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
  // axial (q=rx, r=rz) → offset odd-q. `+ 0` normaliza -0 → +0 (senão o
  // toEqual dos testes distingue { col: -0 } de { col: 0 }).
  const col = rx + 0
  const row = rz + (rx - odd(rx)) / 2 + 0
  return { col, row }
}

/** Pixel da fonte → célula (col,row) da grade — inverso EXATO de hexCenter
 *  (fronteiras reais de hex, não células retangulares). */
export function pixelToHex(px: number, py: number): HexCell {
  const pxrel = px - HEX_OFFSET_X
  const pyrel = py - HEX_OFFSET_Y
  const q = ((2 / 3) * pxrel) / HEX_SIZE
  const r = ((-1 / 3) * pxrel + (Math.sqrt(3) / 3) * pyrel) / HEX_SIZE
  return axialRound(q, r)
}

/** Fração 0..1 da imagem (x,y) → célula da grade. */
export function fracToHex(fx: number, fy: number): HexCell {
  return pixelToHex(fx * MAP_W, fy * MAP_H)
}

/** Todas as células que cobrem a imagem (com 1 hex de margem nas bordas
 *  superior/esquerda pra não deixar buraco). ~40 colunas × ~47 linhas. */
export function hexGridCells(): HexCell[] {
  const cells: HexCell[] = []
  for (let col = -1; HEX_OFFSET_X + HEX_HSTEP * col < MAP_W + HEX_SIZE; col++) {
    if (HEX_OFFSET_X + HEX_HSTEP * col < -HEX_SIZE) continue
    const cyoff = HEX_OFFSET_Y + (odd(col) ? HEX_VSTEP / 2 : 0)
    for (let row = -1; cyoff + HEX_VSTEP * row < MAP_H + HEX_SIZE; row++) {
      if (cyoff + HEX_VSTEP * row < -HEX_SIZE) continue
      cells.push({ col, row })
    }
  }
  return cells
}

/** `d` de um <path> ÚNICO com a grade inteira: por hex, a cadeia contígua
 *  v2→v3→v4→v5 (arestas inferior-esq · superior-esq · topo). Cada aresta
 *  interna do mosaico sai desenhada UMA vez (as arestas direita/inferior são
 *  o lado-esquerdo/topo do vizinho), então a malha inteira é 1 nó DOM sem
 *  traços duplicados — barato mesmo com ~1.9k hexes. */
export function hexGridPath(): string {
  let d = ''
  for (const { col, row } of hexGridCells()) {
    const v = hexVertices(col, row)
    d += `M${round1(v[2].x)},${round1(v[2].y)}L${round1(v[3].x)},${round1(v[3].y)}L${round1(v[4].x)},${round1(v[4].y)}L${round1(v[5].x)},${round1(v[5].y)}`
  }
  return d
}

/** Ponto dentro do polígono? (ray casting — ímpar de cruzamentos). `poly` em
 *  px da fonte, mesma base de hexCenter. Fronteira conta como dentro o
 *  suficiente pro uso (seleção por laço). */
export function pointInPolygon(pt: Pt, poly: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    const straddles = a.y > pt.y !== b.y > pt.y
    if (straddles) {
      const xCross = ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x
      if (pt.x < xCross) inside = !inside
    }
  }
  return inside
}

/** Todas as células cujo CENTRO cai dentro do polígono `poly` (px da fonte) —
 *  a seleção do laço/polígono do editor de regiões (#79). Varre só a caixa
 *  envolvente do polígono na grade (barato mesmo com toda a malha). */
export function hexesInPolygon(poly: Pt[]): HexCell[] {
  if (poly.length < 3) return []
  return hexGridCells().filter((c) => pointInPolygon(hexCenter(c.col, c.row), poly))
}

/** Ícones por subcategoria — mesmo espelho de SUBCATEGORIA_ICON do plugin
 *  (registro central de emojis); subcategoria fora do registro (ex.: Ponto
 *  de Interesse) fica sem ícone — nunca inventar fallback. */
const SUBCATEGORIA_ICON: Record<string, string> = {
  Capital: tokens.emojis.subcategoria.Capital,
  'Pequena Cidade': tokens.emojis.subcategoria.PequenaCidade,
  'Grande Cidade': tokens.emojis.subcategoria.GrandeCidade,
  Região: tokens.emojis.subcategoria.Regiao,
  Nação: tokens.emojis.subcategoria.Nacao,
}

/** Emoji da subcategoria (registro central; subcategoria fora do registro —
 *  ex.: Ponto de Interesse — devolve ''). Sem inventar fallback. */
export function subcategoriaEmoji(sub: string | null | undefined): string {
  return sub ? (SUBCATEGORIA_ICON[sub] ?? '') : ''
}

/** Espelho de SUBCATEGORIA_ORDER do naturalidade-picker. */
const SUBCATEGORIA_ORDER: Record<string, number> = {
  Capital: 0,
  'Grande Cidade': 1,
  'Pequena Cidade': 2,
}

const ATLAS_PREFIX = 'Atlas/'

/** Linha plana do <select> de local (value = id do doc no catálogo). */
export interface LocalLine {
  value: string | null
  label: string
  disabled: boolean
}

interface TreeNode {
  segment: string
  indexNote?: NaturalidadeOption
  leaves: NaturalidadeOption[]
  children: Map<string, TreeNode>
}

/** fullPath do scan (Atlas/....md) → id do doc no catálogo. */
function docId(o: NaturalidadeOption): string {
  return o.fullPath.replace(/\.md$/, '')
}

function label(o: NaturalidadeOption, depth: number): string {
  const indent = '  '.repeat(Math.max(0, depth))
  const icon = SUBCATEGORIA_ICON[o.subcategoria] ?? ''
  return `${indent}${icon ? `${icon} ` : ''}${o.nome}`
}

/** Árvore por pasta — mesmo agrupamento do buildTree do naturalidade-picker
 *  (nota-índice = nota homônima da pasta). */
function buildTree(opts: NaturalidadeOption[]): TreeNode {
  const root: TreeNode = { segment: '', leaves: [], children: new Map() }
  for (const o of opts) {
    if (!o.fullPath.startsWith(ATLAS_PREFIX)) continue
    const rel = o.fullPath.slice(ATLAS_PREFIX.length).replace(/\.md$/, '')
    const parts = rel.split('/')
    let node = root
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i]
      if (!node.children.has(seg)) {
        node.children.set(seg, { segment: seg, leaves: [], children: new Map() })
      }
      node = node.children.get(seg)!
    }
    const last = parts[parts.length - 1]
    if (parts.length >= 2 && last === parts[parts.length - 2]) node.indexNote = o
    else if (parts.length === 1) continue
    else node.leaves.push(o)
  }
  return root
}

function flatten(node: TreeNode, depth: number): LocalLine[] {
  const out: LocalLine[] = []
  if (depth >= 0 && node.indexNote) {
    // Nota-índice (Região/Nação) é SELECIONÁVEL aqui — vira o value da pasta.
    out.push({ value: docId(node.indexNote), label: label(node.indexNote, depth), disabled: false })
  } else if (depth >= 0 && node.segment) {
    const indent = '  '.repeat(Math.max(0, depth))
    out.push({ value: null, label: `${indent}${node.segment}`, disabled: true })
  }
  const childKeys = Array.from(node.children.keys()).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  for (const k of childKeys) out.push(...flatten(node.children.get(k)!, depth + 1))
  const sortedLeaves = node.leaves.slice().sort((a, b) => {
    const oa = SUBCATEGORIA_ORDER[a.subcategoria] ?? 99
    const ob = SUBCATEGORIA_ORDER[b.subcategoria] ?? 99
    if (oa !== ob) return oa - ob
    return a.nome.localeCompare(b.nome, 'pt-BR')
  })
  for (const leaf of sortedLeaves) {
    out.push({ value: docId(leaf), label: label(leaf, depth + 1), disabled: false })
  }
  return out
}

/** Linhas do <select> LOCAL: vazio ("—", sem associação) + árvore do Atlas
 *  com todos os docs de Localização selecionáveis. */
export function locaisSelectLines(catalog: Catalog): LocalLine[] {
  return [{ value: '', label: '—', disabled: false }, ...flatten(buildTree(listLocalizacoes(catalog)), -1)]
}
