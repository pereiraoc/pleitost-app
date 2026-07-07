// PERSISTÊNCIA local-first do estado de GRUPO (issue #36 — aba EXPLORAÇÃO):
// trilha do grupo no Mapa do Mundo Livre, um namespace por grupo em
// `pleitost.groupState.<groupId>`. Segue o padrão do hero-store (leitura
// SÍNCRONA pra hidratar no primeiro render, cache em memória + notify pra
// useSyncExternalStore); só existe o canal 'imediato' — cada mutação grava
// o localStorage na hora (não há edits de combate debounced aqui).
//
// Issue #48: a trilha deixou de ser pontos {x,y} soltos e passou a ser HEXES
// de uma grade sobreposta ao mapa hex-based (ver exploracao.ts). Cada hex é
// identificado por {col,row} da grade; o centro em pixels da fonte é derivado
// da geometria (hexCenter), nunca guardado. A forma antiga {x,y} foi trocada
// (sancionado pela issue: sem dados reais migráveis) — dados legados no
// localStorage são simplesmente ignorados na hidratação (isHex os filtra).
//
// Formato por grupo: { hexes: GroupHex[] } — hexes na ordem de INSERÇÃO
// (a ordem cronológica é derivada na leitura, ordenarHexes).

export interface GroupHex {
  id: string
  /** Coluna da grade hexagonal sobreposta ao mapa (ver exploracao.ts). */
  col: number
  /** Linha da grade hexagonal (offset odd-q; centro derivado por hexCenter). */
  row: number
  /** Data ISO (YYYY-MM-DD) — default hoje na criação, editável. */
  data: string
  /** Doc de Localização do Atlas associado (id do catálogo), opcional. */
  localId?: string
}

export interface GroupState {
  hexes: GroupHex[]
}

const STORE_PREFIX = 'pleitost.groupState.'

const memory = new Map<string, GroupState>()
const listeners = new Map<string, Set<() => void>>()

function emptyState(): GroupState {
  return { hexes: [] }
}

/** localStorage com try/catch — sem storage/quota degrada pra memória
 *  (mesma política do hero-store). */
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

function storageKey(groupId: string): string {
  return STORE_PREFIX + groupId
}

function isHex(raw: unknown): raw is GroupHex {
  if (!raw || typeof raw !== 'object') return false
  const h = raw as Record<string, unknown>
  return (
    typeof h.id === 'string' &&
    typeof h.col === 'number' &&
    Number.isFinite(h.col) &&
    typeof h.row === 'number' &&
    Number.isFinite(h.row) &&
    typeof h.data === 'string' &&
    (h.localId === undefined || typeof h.localId === 'string')
  )
}

function hydrate(groupId: string): GroupState {
  const cached = memory.get(groupId)
  if (cached) return cached
  let state = emptyState()
  const raw = safeGet(storageKey(groupId))
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<GroupState>
      // Forma antiga {pontos:[{x,y}]} não passa em isHex → vira lista vazia.
      if (Array.isArray(parsed.hexes)) state = { hexes: parsed.hexes.filter(isHex) }
    } catch {
      state = emptyState()
    }
  }
  memory.set(groupId, state)
  return state
}

/** Snapshot estável do estado do grupo (pra useSyncExternalStore). */
export function getGroupState(groupId: string): GroupState {
  return hydrate(groupId)
}

export function subscribeGroup(groupId: string, cb: () => void): () => void {
  let set = listeners.get(groupId)
  if (!set) {
    set = new Set()
    listeners.set(groupId, set)
  }
  set.add(cb)
  return () => {
    set.delete(cb)
  }
}

function notify(groupId: string): void {
  for (const cb of listeners.get(groupId) ?? []) cb()
}

/** Canal 'imediato': memória (UI na hora) + notify + localStorage. */
function commit(groupId: string, next: GroupState): void {
  memory.set(groupId, next)
  notify(groupId)
  if (next.hexes.length === 0) safeRemove(storageKey(groupId))
  else
    safeSet(
      storageKey(groupId),
      JSON.stringify({ ...next, updatedAt: new Date().toISOString() }),
    )
}

function newHexId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `hex-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** Data local de hoje em ISO (YYYY-MM-DD) — default do input de data. */
export function todayISO(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/** Hex já marcado numa dada célula (col,row), ou null — pra toggle/lookup. */
export function hexAt(hexes: GroupHex[], col: number, row: number): GroupHex | null {
  return hexes.find((h) => h.col === col && h.row === row) ?? null
}

/** Marca um hex da trilha (id gerado aqui) e devolve o hex criado. Se a célula
 *  (col,row) já estiver marcada, devolve o hex existente (sem duplicar). */
export function addGroupHex(
  groupId: string,
  hex: Omit<GroupHex, 'id'>,
): GroupHex {
  const cur = hydrate(groupId)
  const existente = hexAt(cur.hexes, hex.col, hex.row)
  if (existente) return existente
  const created: GroupHex = { ...hex, id: newHexId() }
  commit(groupId, { ...cur, hexes: [...cur.hexes, created] })
  return created
}

/** Atualiza data/local de um hex existente. */
export function updateGroupHex(
  groupId: string,
  hexId: string,
  patch: Partial<Omit<GroupHex, 'id'>>,
): void {
  const cur = hydrate(groupId)
  const idx = cur.hexes.findIndex((h) => h.id === hexId)
  if (idx === -1) return
  const next = cur.hexes.slice()
  const merged = { ...next[idx], ...patch }
  // localId vazio remove a associação (o JSON não guarda undefined).
  if (!merged.localId) delete merged.localId
  next[idx] = merged
  commit(groupId, { ...cur, hexes: next })
}

/** Remove um hex da trilha (× do popover ou toggle no modo marcar). */
export function removeGroupHex(groupId: string, hexId: string): void {
  const cur = hydrate(groupId)
  const next = cur.hexes.filter((h) => h.id !== hexId)
  if (next.length === cur.hexes.length) return
  commit(groupId, { ...cur, hexes: next })
}

/** Trilha em ordem cronológica: data ASC (ISO ordena lexicográfico), empate
 *  preserva a ordem de inserção (sort estável). NÃO muta a lista do store. */
export function ordenarHexes(hexes: GroupHex[]): GroupHex[] {
  return hexes
    .map((h, i) => [h, i] as const)
    .sort((a, b) => a[0].data.localeCompare(b[0].data) || a[1] - b[1])
    .map(([h]) => h)
}

/** Hex ATUAL = último da trilha em ordem cronológica. */
export function hexAtual(hexes: GroupHex[]): GroupHex | null {
  const ordenados = ordenarHexes(hexes)
  return ordenados.length ? ordenados[ordenados.length - 1] : null
}

/** SÓ testes: zera a memória (não o localStorage) — simula reload da página. */
export function __resetGroupStoreMemoryForTests(): void {
  memory.clear()
}
