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
import {
  ATLAS_GRID_H,
  ATLAS_GRID_W,
  ATLAS_HEX_HSTEP,
  ATLAS_HEX_VSTEP,
  atlasHexCenter,
  atlasHexVertices,
} from './atlas-grid'

export interface MapaPonto {
  x: number
  y: number
}

export interface MapaRegiao {
  id: string
  nome: string
  /** Vértices do polígono em px da FONTE (ordem do desenho). */
  pontos: MapaPonto[]
  /** Feedback do mestre ("marcar sempre hex inteiro"): true quando o contorno
   *  já foi ALINHADO à grade (união dos hexes inteiros cujo centro caiu no
   *  desenho). Região sem a flag é normalizada no load do mestre. */
  hexAligned?: boolean
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

function isPonto(p: unknown): p is MapaPonto {
  const o = p as Record<string, unknown> | null
  return !!o && Number.isFinite(o.x) && Number.isFinite(o.y)
}

/** Hidrata com validação estrita (padrão isHex do group-store). */
function hydrate(): MapaAtlasState {
  if (memory) return memory
  let state = emptyState()
  try {
    const raw = storage()?.getItem(STORE_KEY)
    if (raw) state = sanitize(JSON.parse(raw))
  } catch {
    state = emptyState()
  }
  memory = state
  return state
}

/** Sanitiza um blob externo (localStorage OU state da sessão) pro shape. */
export function sanitize(raw: unknown): MapaAtlasState {
  const o = (raw ?? {}) as Record<string, unknown>
  const regioes = (Array.isArray(o.regioes) ? o.regioes : [])
    .map((r) => r as Record<string, unknown>)
    .filter(
      (r) =>
        typeof r.id === 'string' &&
        typeof r.nome === 'string' &&
        Array.isArray(r.pontos) &&
        (r.pontos as unknown[]).every(isPonto),
    )
    .map((r) => ({
      id: r.id as string,
      nome: r.nome as string,
      pontos: (r.pontos as MapaPonto[]).map((p) => ({ x: p.x, y: p.y })),
      ...(r.hexAligned === true ? { hexAligned: true as const } : {}),
    }))
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

/** Fecha um polígono desenhado como REGIÃO nomeada (≥3 vértices). Feedback do
 *  mestre: o contorno é ALINHADO à grade ("marcar sempre hex inteiro") — o
 *  desenho livre vira a união dos hexes cujo centro caiu dentro dele. Se o
 *  desenho não pegou nenhum hex, guarda o traço cru (sem flag). */
export function addRegiao(nome: string, pontos: MapaPonto[]): MapaRegiao | null {
  const limpo = nome.trim()
  if (!limpo || pontos.length < 3) return null
  const cur = hydrate()
  const snap = snapPontosToHexes(pontos)
  const regiao: MapaRegiao = snap
    ? { id: newId('regiao'), nome: limpo, pontos: snap, hexAligned: true }
    : { id: newId('regiao'), nome: limpo, pontos: [...pontos] }
  commit({ ...cur, regioes: [...cur.regioes, regiao] })
  return regiao
}

/** Normaliza regiões antigas (traço livre, sem hexAligned) pro contorno
 *  hex-alinhado — roda uma vez no load do MESTRE; o push da mesa propaga. */
export function normalizeRegioesToHex(): boolean {
  const cur = hydrate()
  let mudou = false
  const regioes = cur.regioes.map((r) => {
    if (r.hexAligned) return r
    const snap = snapPontosToHexes(r.pontos)
    if (!snap) return r
    mudou = true
    return { ...r, pontos: snap, hexAligned: true as const }
  })
  if (mudou) commit({ ...cur, regioes })
  return mudou
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

// ── Snap do contorno à grade (feedback: "marcar sempre hex inteiro") ───────

/** Chave canônica de um vértice (0.1px absorve o ruído de FP entre hexes
 *  vizinhos, que computam o MESMO vértice a partir de centros diferentes). */
const vk = (p: MapaPonto): string => `${p.x.toFixed(1)},${p.y.toFixed(1)}`

/** Desenho livre → contorno da UNIÃO dos hexes inteiros cujo CENTRO caiu no
 *  polígono: coleta as 6 arestas de cada hex incluído, descarta as
 *  compartilhadas (aparecem 2×) e encadeia as de borda num anel. Componentes
 *  desconexos/furos: fica o MAIOR anel (o desenho do mestre é um blob por
 *  região). null quando nenhum hex foi pego (desenho menor que um hex). */
export function snapPontosToHexes(pontos: MapaPonto[]): MapaPonto[] | null {
  if (pontos.length < 3) return null
  const desenho: MapaRegiao = { id: '~', nome: '~', pontos }
  const xs = pontos.map((p) => p.x)
  const ys = pontos.map((p) => p.y)
  const c0 = Math.max(0, Math.floor((Math.min(...xs) - ATLAS_HEX_HSTEP) / ATLAS_HEX_HSTEP))
  const c1 = Math.ceil((Math.max(...xs) + ATLAS_HEX_HSTEP) / ATLAS_HEX_HSTEP)
  const r0 = Math.max(0, Math.floor((Math.min(...ys) - ATLAS_HEX_VSTEP) / ATLAS_HEX_VSTEP))
  const r1 = Math.ceil((Math.max(...ys) + ATLAS_HEX_VSTEP) / ATLAS_HEX_VSTEP)

  // Arestas de borda: conta por chave não-direcionada; interna aparece 2×.
  const edges = new Map<string, { a: MapaPonto; b: MapaPonto; n: number }>()
  let pegou = false
  for (let c = c0; c <= c1; c++) {
    for (let r = r0; r <= r1; r++) {
      const centro = atlasHexCenter(c, r)
      if (centro.x < 0 || centro.y < 0 || centro.x > ATLAS_GRID_W || centro.y > ATLAS_GRID_H) continue
      if (!pontoNaRegiao(centro, desenho)) continue
      pegou = true
      const vs = atlasHexVertices(c, r)
      for (let k = 0; k < 6; k++) {
        const a = vs[k]!
        const b = vs[(k + 1) % 6]!
        const key = [vk(a), vk(b)].sort().join('|')
        const cur = edges.get(key)
        if (cur) cur.n++
        else edges.set(key, { a, b, n: 1 })
      }
    }
  }
  if (!pegou) return null

  // Encadeia as arestas de borda (n=1) em anéis; devolve o maior.
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
  let melhor: MapaPonto[] = []
  for (const inicio of borda) {
    if (usadas.has(inicio)) continue
    const anel: MapaPonto[] = [inicio.a]
    usadas.add(inicio)
    let atual = inicio.b
    // guarda de laço: nunca mais passos que arestas de borda
    for (let passos = 0; passos < borda.length; passos++) {
      anel.push(atual)
      if (vk(atual) === vk(anel[0]!)) break
      const proxima = (porVertice.get(vk(atual)) ?? []).find((e) => !usadas.has(e))
      if (!proxima) break
      usadas.add(proxima)
      atual = vk(proxima.a) === vk(atual) ? proxima.b : proxima.a
    }
    if (anel.length > melhor.length) melhor = anel
  }
  if (melhor.length < 3) return null
  // remove o vértice repetido do fechamento e arredonda (0.1px)
  const fechado = vk(melhor[0]!) === vk(melhor[melhor.length - 1]!) ? melhor.slice(0, -1) : melhor
  return fechado.map((p) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }))
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

/** Um pin está visível/clicável quando NENHUMA região desabilitada o contém. */
export function pinVisivel(pin: MapaPin, desabilitadas: MapaRegiao[]): boolean {
  return !desabilitadas.some((r) => pontoNaRegiao(pin, r))
}

/** SÓ testes: zera a memória (simula reload). */
export function __resetMapaAtlasForTests(): void {
  memory = null
}
