// AUTORIA DO MAPA DE HEXCRAWL (issue #67) — o GM associa cada HEX da grade
// sobreposta ao mapa de uma região a uma Localização (nota do Atlas). Esse
// mapeamento hex→localização é a FONTE das issues de exploração de grupo
// (#68–#71): onde o grupo cai na grade resolve QUAL lugar é.
//
// Persistência local-first no padrão do group-store/hero-store: leitura
// SÍNCRONA pra hidratar no primeiro render, cache em memória + notify pra
// useSyncExternalStore, único canal 'imediato' (cada mutação grava o
// localStorage na hora). Um namespace por REGIÃO em `pleitost.hexMap.<regiao>`
// — o <regiao> é o id do doc de Localização raiz da região (ver
// region-maps.ts), não o nome, pra casar com o catálogo.
//
// A célula é identificada por {col,row} da grade hexagonal calibrada
// (exploracao.ts); o centro em pixels é derivado da geometria (hexCenter),
// nunca guardado. Cada célula guarda o localId (id do doc no catálogo) do
// lugar que ela referencia. No máximo UMA célula por (col,row): re-associar
// sobrescreve, remover apaga.

export interface HexMapCell {
  /** Coluna da grade hexagonal sobreposta ao mapa (ver exploracao.ts). */
  col: number
  /** Linha da grade hexagonal (offset odd-q; centro derivado por hexCenter). */
  row: number
  /** Doc de Localização do Atlas que este hex referencia (id do catálogo). */
  localId: string
}

export interface HexMapState {
  cells: HexMapCell[]
}

const STORE_PREFIX = 'pleitost.hexMap.'

const memory = new Map<string, HexMapState>()
const listeners = new Map<string, Set<() => void>>()

function emptyState(): HexMapState {
  return { cells: [] }
}

/** localStorage com try/catch — sem storage/quota degrada pra memória
 *  (mesma política do group-store/hero-store). */
function storage(): Storage | null {
  return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null
}
function safeGet(key: string): string | null {
  try {
    return storage()?.getItem(key) ?? null
  } catch {
    return null
  }
}
function safeSet(key: string, value: string): void {
  try {
    storage()?.setItem(key, value)
  } catch {
    /* memória continua a fonte da sessão */
  }
}
function safeRemove(key: string): void {
  try {
    storage()?.removeItem(key)
  } catch {
    /* noop */
  }
}

function storageKey(regionId: string): string {
  return STORE_PREFIX + regionId
}

function isCell(raw: unknown): raw is HexMapCell {
  if (!raw || typeof raw !== 'object') return false
  const c = raw as Record<string, unknown>
  return (
    typeof c.col === 'number' &&
    Number.isFinite(c.col) &&
    typeof c.row === 'number' &&
    Number.isFinite(c.row) &&
    typeof c.localId === 'string' &&
    c.localId !== ''
  )
}

function hydrate(regionId: string): HexMapState {
  const cached = memory.get(regionId)
  if (cached) return cached
  let state = emptyState()
  const raw = safeGet(storageKey(regionId))
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<HexMapState>
      if (Array.isArray(parsed.cells)) state = { cells: parsed.cells.filter(isCell) }
    } catch {
      state = emptyState()
    }
  }
  memory.set(regionId, state)
  return state
}

/** Snapshot estável do mapa da região (pra useSyncExternalStore). */
export function getHexMapState(regionId: string): HexMapState {
  return hydrate(regionId)
}

export function subscribeHexMap(regionId: string, cb: () => void): () => void {
  let set = listeners.get(regionId)
  if (!set) {
    set = new Set()
    listeners.set(regionId, set)
  }
  set.add(cb)
  return () => {
    set.delete(cb)
  }
}

function notify(regionId: string): void {
  for (const cb of listeners.get(regionId) ?? []) cb()
}

/** Canal 'imediato': memória (UI na hora) + notify + localStorage. */
function commit(regionId: string, next: HexMapState): void {
  memory.set(regionId, next)
  notify(regionId)
  if (next.cells.length === 0) safeRemove(storageKey(regionId))
  else
    safeSet(
      storageKey(regionId),
      JSON.stringify({ ...next, updatedAt: new Date().toISOString() }),
    )
}

/** Célula mapeada em (col,row), ou null — pra lookup/toggle. */
export function cellAt(cells: HexMapCell[], col: number, row: number): HexMapCell | null {
  return cells.find((c) => c.col === col && c.row === row) ?? null
}

/** Associa (ou re-associa) um hex (col,row) a uma Localização. Se já houver
 *  célula ali, sobrescreve o localId; senão cria. Devolve a célula resultante. */
export function setHexLocal(
  regionId: string,
  col: number,
  row: number,
  localId: string,
): HexMapCell {
  const cur = hydrate(regionId)
  const cell: HexMapCell = { col, row, localId }
  const idx = cur.cells.findIndex((c) => c.col === col && c.row === row)
  if (idx === -1) {
    commit(regionId, { ...cur, cells: [...cur.cells, cell] })
  } else if (cur.cells[idx].localId !== localId) {
    const next = cur.cells.slice()
    next[idx] = cell
    commit(regionId, { ...cur, cells: next })
  }
  return cell
}

/** Remove a associação de um hex (col,row). */
export function removeHex(regionId: string, col: number, row: number): void {
  const cur = hydrate(regionId)
  const next = cur.cells.filter((c) => !(c.col === col && c.row === row))
  if (next.length === cur.cells.length) return
  commit(regionId, { ...cur, cells: next })
}

/** Índice {localId → célula} — pra saber quais Localizações já estão no mapa
 *  (uma Localização mapeada em no máximo um hex; a última associação vence). */
export function cellsByLocal(cells: HexMapCell[]): Map<string, HexMapCell> {
  const out = new Map<string, HexMapCell>()
  for (const c of cells) out.set(c.localId, c)
  return out
}

/** SÓ testes: zera a memória (não o localStorage) — simula reload da página. */
export function __resetHexMapStoreMemoryForTests(): void {
  memory.clear()
}
