// MAPA DO MUNDO — fase 2 (#419): regiões marcadas pelo GM + lugares (pins) +
// habilitação POR GRUPO. Pedido do mestre: "dividir em basicamente 3 regiões
// que poderão ser habilitadas conforme o grupo (pelo GM); quando uma região
// estiver desabilitada, o mapa de overlay estará por cima e nenhum lugar
// abaixo aparecerá como clicável, não terá nenhuma informação".
//
// Arquitetura (sem tocar a vault — tudo do lado do app):
//   • REGIÕES = polígonos em px da FONTE do atlas.webp (7440×5262), desenhados
//     pelo mestre no próprio /mapa (padrão de autoria do HexMapEditor: dado do
//     GM, local-first).
//   • LUGARES = pins {x,y} ligados a um doc de Localização do catálogo —
//     clicáveis pra abrir a página do lugar (o mapa é o atlas navegável que o
//     AtlasNav anunciava).
//   • HABILITAÇÃO por grupo: `habilitadas[grupoId] = regiaoIds`; a chave
//     DEFAULT_VIEWER aplica a quem não tem grupo resolvido. Desabilitada ⇒
//     overlay clipado por cima + pins da região inertes/ocultos.
//   • Persistência local-first no padrão do group-store (leitura síncrona,
//     memória + notify, canal imediato) num único namespace
//     `pleitost.mapaAtlas` (sincronizado por conta via user_state, prefixo
//     pleitost.). A PROPAGAÇÃO viva pros jogadores da mesa vai pelo
//     sessions.state (jsonb `mapaAtlas`, mesmo veículo da exploração #5) —
//     conectado, o jogador lê o state; o local é a fonte do GM.
import { useSyncExternalStore } from 'react'
import { SEED_MAPA_ATLAS } from './seed-mapa-atlas'
import {
  ATLAS_GRID_H,
  ATLAS_GRID_W,
  ATLAS_HEX_HSTEP,
  ATLAS_HEX_SIZE,
  ATLAS_HEX_VSTEP,
  atlasHexCenter,
  atlasHexVertices,
  atlasPixelToHex,
  type AtlasHexCell,
} from './atlas-grid'

export interface MapaPonto {
  x: number
  y: number
}

export interface MapaRegiao {
  id: string
  nome: string
  /** CÉLULAS (hex inteiros) que compõem a região — fonte de verdade da
   *  membership desde o feedback do mestre ("marcar sempre hex inteiro") e da
   *  edição por pintura (toggleRegiaoHex). Blob legado sem cells é derivado
   *  no sanitize (centros dentro do polígono). */
  cells: AtlasHexCell[]
  /** Contorno DERIVADO da união das células (maior anel — render/back-compat). */
  pontos: MapaPonto[]
  /** TODOS os anéis do contorno (região pintada pode ter mais de um blob);
   *  o clip do overlay usa estes. Derivado — recalculado a cada mudança. */
  aneis?: MapaPonto[][]
}

export interface MapaPin {
  id: string
  /** Doc de Localização do catálogo. */
  localId: string
  x: number
  y: number
}

export interface MapaAtlasState {
  regioes: MapaRegiao[]
  pins: MapaPin[]
  /** regiaoIds habilitadas por grupoId (ou DEFAULT_VIEWER). Ausente = nada
   *  habilitado ("poderão ser habilitadas" — default fechado). */
  habilitadas: Record<string, string[]>
}

/** Chave de habilitação pra viewer SEM grupo resolvido (fora da mesa). */
export const DEFAULT_VIEWER = 'default'

const STORE_KEY = 'pleitost.mapaAtlas'

let memory: MapaAtlasState | null = null
const listeners = new Set<() => void>()
const notify = () => {
  for (const cb of listeners) cb()
}

function emptyState(): MapaAtlasState {
  return { regioes: [], pins: [], habilitadas: {} }
}

function storage(): Storage | null {
  return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null
}

// #424 ("salvarmos como padrão pra tudo"): seed embarcado com o mapa oficial
// do mestre — default de quem nunca editou neste aparelho (modelo do
// SEED_HEXMAPS; mutável só pra teste, __setSeedMapaAtlasForTests).
let seed: unknown = SEED_MAPA_ATLAS
export function __setSeedMapaAtlasForTests(next: unknown): void {
  seed = next
  memory = null
}

/** true quando ESTE aparelho já tem estado próprio gravado (o raw existe) —
 *  gate da adoção da mesa e do push do mestre (#423/#424): seed carregado não
 *  conta como edição local. */
export function mapaAtlasFoiEditadoLocalmente(): boolean {
  try {
    return storage()?.getItem(STORE_KEY) != null
  } catch {
    return false
  }
}

function isPonto(p: unknown): p is MapaPonto {
  const o = p as Record<string, unknown> | null
  return !!o && Number.isFinite(o.x) && Number.isFinite(o.y)
}

/** Hidrata com validação estrita (padrão isHex do group-store). Sem estado
 *  local gravado, o DEFAULT é o seed embarcado (#424). */
function hydrate(): MapaAtlasState {
  if (memory) return memory
  let state: MapaAtlasState | null = null
  try {
    const raw = storage()?.getItem(STORE_KEY)
    if (raw) state = sanitize(JSON.parse(raw))
  } catch {
    state = emptyState()
  }
  state ??= sanitize(seed)
  memory = state
  return state
}

/** Sanitiza um blob externo (localStorage OU state da sessão) pro shape. */
export function sanitize(raw: unknown): MapaAtlasState {
  const o = (raw ?? {}) as Record<string, unknown>
  const isCell = (c: unknown): c is AtlasHexCell => {
    const x = c as Record<string, unknown> | null
    return !!x && Number.isInteger(x.col) && Number.isInteger(x.row)
  }
  const regioes = (Array.isArray(o.regioes) ? o.regioes : [])
    .map((r) => r as Record<string, unknown>)
    .filter(
      (r) =>
        typeof r.id === 'string' &&
        typeof r.nome === 'string' &&
        Array.isArray(r.pontos) &&
        (r.pontos as unknown[]).every(isPonto),
    )
    .map((r) => {
      const pontos = (r.pontos as MapaPonto[]).map((p) => ({ x: p.x, y: p.y }))
      // Blob legado (só polígono) → deriva as células dos centros contidos;
      // com células válidas, o contorno é REderivado delas (fonte de verdade).
      const cells = (Array.isArray(r.cells) ? (r.cells as unknown[]).filter(isCell) : []).map(
        (c) => ({ col: (c as AtlasHexCell).col, row: (c as AtlasHexCell).row }),
      )
      return montarRegiao(r.id as string, r.nome as string, cells.length ? cells : cellsFromStroke(pontos), pontos)
    })
  const pins = (Array.isArray(o.pins) ? o.pins : [])
    .map((p) => p as Record<string, unknown>)
    .filter(
      (p) =>
        typeof p.id === 'string' &&
        typeof p.localId === 'string' &&
        Number.isFinite(p.x) &&
        Number.isFinite(p.y),
    )
    .map((p) => ({ id: p.id as string, localId: p.localId as string, x: p.x as number, y: p.y as number }))
  const habRaw = (o.habilitadas ?? {}) as Record<string, unknown>
  const habilitadas: Record<string, string[]> = {}
  for (const [k, v] of Object.entries(habRaw)) {
    if (Array.isArray(v)) habilitadas[k] = v.filter((x): x is string => typeof x === 'string')
  }
  return { regioes, pins, habilitadas }
}

function commit(next: MapaAtlasState): void {
  memory = next
  notify()
  try {
    storage()?.setItem(STORE_KEY, JSON.stringify(next))
  } catch {
    /* memória continua a fonte da sessão */
  }
}

export function getMapaAtlas(): MapaAtlasState {
  return hydrate()
}

export function subscribeMapaAtlas(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function useMapaAtlas(): MapaAtlasState {
  return useSyncExternalStore(subscribeMapaAtlas, getMapaAtlas)
}

function newId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

/** Fecha um desenho livre como REGIÃO nomeada ("marcar sempre hex inteiro"):
 *  vira o conjunto de hexes cujo centro caiu no traço + contorno derivado.
 *  Desenho que não pegou hex nenhum não cria região. */
export function addRegiao(nome: string, pontos: MapaPonto[]): MapaRegiao | null {
  const limpo = nome.trim()
  if (!limpo || pontos.length < 3) return null
  const cells = cellsFromStroke(pontos)
  if (cells.length === 0) return null
  const cur = hydrate()
  const regiao = montarRegiao(newId('regiao'), limpo, cells, pontos)
  commit({ ...cur, regioes: [...cur.regioes, regiao] })
  return regiao
}

/** EDIÇÃO por pintura (feedback: "adicionar novos hex a uma região"): liga/
 *  desliga uma célula da região e re-deriva o contorno. */
export function toggleRegiaoHex(regiaoId: string, cell: AtlasHexCell): void {
  const cur = hydrate()
  const regioes = cur.regioes.map((r) => {
    if (r.id !== regiaoId) return r
    const tem = r.cells.some((c) => c.col === cell.col && c.row === cell.row)
    const cells = tem
      ? r.cells.filter((c) => !(c.col === cell.col && c.row === cell.row))
      : [...r.cells, { col: cell.col, row: cell.row }]
    return montarRegiao(r.id, r.nome, cells, r.pontos)
  })
  commit({ ...cur, regioes })
}

/** Normaliza blobs antigos — o sanitize já DERIVA as células na leitura; aqui
 *  só detecta se o blob PERSISTIDO ainda está na forma velha (região sem
 *  cells) e regrava a forma migrada (o push da mesa propaga). Roda no load do
 *  MESTRE. */
export function normalizeRegioesToHex(): boolean {
  const cur = hydrate()
  if (cur.regioes.length === 0) return false
  let rawMigrado = true
  try {
    const raw = storage()?.getItem(STORE_KEY)
    if (raw) {
      const o = JSON.parse(raw) as { regioes?: Array<{ cells?: unknown[] }> }
      rawMigrado = (o.regioes ?? []).every((r) => Array.isArray(r.cells) && r.cells.length > 0)
    }
  } catch {
    rawMigrado = false
  }
  if (rawMigrado) return false
  commit({ ...cur })
  return true
}

export function removeRegiao(id: string): void {
  const cur = hydrate()
  const habilitadas: Record<string, string[]> = {}
  for (const [k, v] of Object.entries(cur.habilitadas)) habilitadas[k] = v.filter((r) => r !== id)
  commit({ ...cur, regioes: cur.regioes.filter((r) => r.id !== id), habilitadas })
}

export function addPin(localId: string, x: number, y: number): void {
  if (!localId) return
  const cur = hydrate()
  commit({ ...cur, pins: [...cur.pins, { id: newId('pin'), localId, x, y }] })
}

export function removePin(id: string): void {
  const cur = hydrate()
  commit({ ...cur, pins: cur.pins.filter((p) => p.id !== id) })
}

/** Liga/desliga uma região pra um grupo (ou DEFAULT_VIEWER). */
export function toggleRegiaoHabilitada(grupoId: string, regiaoId: string): void {
  const cur = hydrate()
  const atual = cur.habilitadas[grupoId] ?? []
  const next = atual.includes(regiaoId) ? atual.filter((r) => r !== regiaoId) : [...atual, regiaoId]
  commit({ ...cur, habilitadas: { ...cur.habilitadas, [grupoId]: next } })
}

/** Aplica um estado COMPLETO (pull do state da sessão — remoto do GM). */
export function setMapaAtlasFull(raw: unknown): void {
  commit(sanitize(raw))
}

/** Serialização canônica pro compare do sync (ordem de chaves estável). */
export function mapaAtlasJson(s: MapaAtlasState): string {
  return JSON.stringify({ regioes: s.regioes, pins: s.pins, habilitadas: s.habilitadas })
}

// ── Células e contorno ("marcar sempre hex inteiro") ───────────────────────

/** Chave canônica de um vértice (0.1px absorve o ruído de FP entre hexes
 *  vizinhos, que computam o MESMO vértice a partir de centros diferentes). */
const vk = (p: MapaPonto): string => `${p.x.toFixed(1)},${p.y.toFixed(1)}`

/** Desenho livre → hexes inteiros cujo CENTRO caiu no polígono. A margem de
 *  1 hex além da imagem INCLUI as células de borda (a coluna 0 tem centro em
 *  x≈−2.8; o corte da esquerda do report veio de exigir centro ≥ 0). */
export function cellsFromStroke(pontos: MapaPonto[]): AtlasHexCell[] {
  if (pontos.length < 3) return []
  const desenho: MapaRegiao = { id: '~', nome: '~', cells: [], pontos }
  const xs = pontos.map((p) => p.x)
  const ys = pontos.map((p) => p.y)
  const c0 = Math.floor((Math.min(...xs) - ATLAS_HEX_HSTEP * 2) / ATLAS_HEX_HSTEP)
  const c1 = Math.ceil((Math.max(...xs) + ATLAS_HEX_HSTEP * 2) / ATLAS_HEX_HSTEP)
  const r0 = Math.floor((Math.min(...ys) - ATLAS_HEX_VSTEP * 2) / ATLAS_HEX_VSTEP)
  const r1 = Math.ceil((Math.max(...ys) + ATLAS_HEX_VSTEP * 2) / ATLAS_HEX_VSTEP)
  const out: AtlasHexCell[] = []
  for (let c = c0; c <= c1; c++) {
    for (let r = r0; r <= r1; r++) {
      const centro = atlasHexCenter(c, r)
      if (
        centro.x < -ATLAS_HEX_SIZE ||
        centro.y < -ATLAS_HEX_SIZE ||
        centro.x > ATLAS_GRID_W + ATLAS_HEX_SIZE ||
        centro.y > ATLAS_GRID_H + ATLAS_HEX_SIZE
      )
        continue
      if (pontoNaRegiao(centro, desenho)) out.push({ col: c, row: r })
    }
  }
  return out
}

/** União das células → anéis do contorno: arestas compartilhadas (2×) caem,
 *  as de borda encadeiam em anéis, MAIORES primeiro (região pintada pode ter
 *  mais de um blob; anel-furo vira cobertura — limitação documentada). */
export function outlineRingsFromCells(cells: AtlasHexCell[]): MapaPonto[][] {
  const edges = new Map<string, { a: MapaPonto; b: MapaPonto; n: number }>()
  for (const cell of cells) {
    const vs = atlasHexVertices(cell.col, cell.row)
    for (let k = 0; k < 6; k++) {
      const a = vs[k]!
      const b = vs[(k + 1) % 6]!
      const key = [vk(a), vk(b)].sort().join('|')
      const cur = edges.get(key)
      if (cur) cur.n++
      else edges.set(key, { a, b, n: 1 })
    }
  }
  const borda = [...edges.values()].filter((e) => e.n === 1)
  const porVertice = new Map<string, Array<{ a: MapaPonto; b: MapaPonto }>>()
  for (const e of borda) {
    for (const key of [vk(e.a), vk(e.b)]) {
      const list = porVertice.get(key) ?? []
      list.push(e)
      porVertice.set(key, list)
    }
  }
  const usadas = new Set<{ a: MapaPonto; b: MapaPonto }>()
  const aneis: MapaPonto[][] = []
  for (const inicio of borda) {
    if (usadas.has(inicio)) continue
    const anel: MapaPonto[] = [inicio.a]
    usadas.add(inicio)
    let atual = inicio.b
    for (let passos = 0; passos < borda.length; passos++) {
      anel.push(atual)
      if (vk(atual) === vk(anel[0]!)) break
      const proxima = (porVertice.get(vk(atual)) ?? []).find((e) => !usadas.has(e))
      if (!proxima) break
      usadas.add(proxima)
      atual = vk(proxima.a) === vk(atual) ? proxima.b : proxima.a
    }
    if (anel.length >= 3) {
      const fechado = vk(anel[0]!) === vk(anel[anel.length - 1]!) ? anel.slice(0, -1) : anel
      aneis.push(fechado.map((p) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 })))
    }
  }
  aneis.sort((a, b) => b.length - a.length)
  return aneis
}

/** Região com contorno derivado das células; sem célula, mantém o traço cru
 *  (região vazia continua existente/editável). */
function montarRegiao(id: string, nome: string, cells: AtlasHexCell[], fallback: MapaPonto[]): MapaRegiao {
  const aneis = outlineRingsFromCells(cells)
  return {
    id,
    nome,
    cells,
    pontos: aneis[0] ?? fallback,
    ...(aneis.length ? { aneis } : {}),
  }
}

// ── Consulta de gating ─────────────────────────────────────────────────────

/** Ray casting clássico — ponto dentro do polígono (px da fonte). */
export function pontoNaRegiao(p: MapaPonto, regiao: MapaRegiao): boolean {
  const pts = regiao.pontos
  let dentro = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]!
    const b = pts[j]!
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      dentro = !dentro
    }
  }
  return dentro
}

/** Regiões DESABILITADAS pro viewer (grupoId resolvido ou DEFAULT_VIEWER).
 *  Sem nenhuma região marcada, nada é coberto (mapa aberto — fase 1). */
export function regioesDesabilitadas(state: MapaAtlasState, grupoId: string | null): MapaRegiao[] {
  if (state.regioes.length === 0) return []
  const habilitadas = new Set(state.habilitadas[grupoId ?? DEFAULT_VIEWER] ?? [])
  return state.regioes.filter((r) => !habilitadas.has(r.id))
}

/** Célula pertence a alguma região da lista? (membership por CÉLULA — a
 *  fonte de verdade desde o "marcar sempre hex inteiro"). */
export function hexEmRegioes(cell: AtlasHexCell, regioes: MapaRegiao[]): boolean {
  return regioes.some((r) => r.cells.some((c) => c.col === cell.col && c.row === cell.row))
}

/** Um pin está visível/clicável quando o HEX dele não cai em região
 *  desabilitada. */
export function pinVisivel(pin: MapaPin, desabilitadas: MapaRegiao[]): boolean {
  return !hexEmRegioes(atlasPixelToHex(pin.x, pin.y), desabilitadas)
}

/** SÓ testes: zera a memória (simula reload). */
export function __resetMapaAtlasForTests(): void {
  memory = null
}
