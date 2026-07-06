// PERSISTÊNCIA local-first do estado de GRUPO (issue #36 — aba EXPLORAÇÃO):
// trilha do grupo no Mapa do Mundo Livre, um namespace por grupo em
// `pleitost.groupState.<groupId>`. Segue o padrão do hero-store (leitura
// SÍNCRONA pra hidratar no primeiro render, cache em memória + notify pra
// useSyncExternalStore); só existe o canal 'imediato' — cada mutação grava
// o localStorage na hora (não há edits de combate debounced aqui).
//
// Formato por grupo: { pontos: GroupPoint[] } — pontos da trilha na ordem
// de INSERÇÃO (a ordem cronológica é derivada na leitura, ordenarPontos).

export interface GroupPoint {
  id: string
  /** Coordenadas relativas à imagem do mapa (frações 0–1 de largura/altura). */
  x: number
  y: number
  /** Data ISO (YYYY-MM-DD) — default hoje na criação, editável. */
  data: string
  /** Doc de Localização do Atlas associado (id do catálogo), opcional. */
  localId?: string
}

export interface GroupState {
  pontos: GroupPoint[]
}

const STORE_PREFIX = 'pleitost.groupState.'

const memory = new Map<string, GroupState>()
const listeners = new Map<string, Set<() => void>>()

function emptyState(): GroupState {
  return { pontos: [] }
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

function isPoint(raw: unknown): raw is GroupPoint {
  if (!raw || typeof raw !== 'object') return false
  const p = raw as Record<string, unknown>
  return (
    typeof p.id === 'string' &&
    typeof p.x === 'number' &&
    typeof p.y === 'number' &&
    typeof p.data === 'string' &&
    (p.localId === undefined || typeof p.localId === 'string')
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
      if (Array.isArray(parsed.pontos)) state = { pontos: parsed.pontos.filter(isPoint) }
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
  if (next.pontos.length === 0) safeRemove(storageKey(groupId))
  else
    safeSet(
      storageKey(groupId),
      JSON.stringify({ ...next, updatedAt: new Date().toISOString() }),
    )
}

function newPointId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `pt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** Data local de hoje em ISO (YYYY-MM-DD) — default do input de data. */
export function todayISO(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/** Adiciona um ponto da trilha (id gerado aqui) e devolve o ponto criado. */
export function addGroupPoint(
  groupId: string,
  ponto: Omit<GroupPoint, 'id'>,
): GroupPoint {
  const created: GroupPoint = { ...ponto, id: newPointId() }
  const cur = hydrate(groupId)
  commit(groupId, { ...cur, pontos: [...cur.pontos, created] })
  return created
}

/** Atualiza data/local (ou posição) de um ponto existente. */
export function updateGroupPoint(
  groupId: string,
  pointId: string,
  patch: Partial<Omit<GroupPoint, 'id'>>,
): void {
  const cur = hydrate(groupId)
  const idx = cur.pontos.findIndex((p) => p.id === pointId)
  if (idx === -1) return
  const next = cur.pontos.slice()
  const merged = { ...next[idx], ...patch }
  // localId vazio remove a associação (o JSON não guarda undefined).
  if (!merged.localId) delete merged.localId
  next[idx] = merged
  commit(groupId, { ...cur, pontos: next })
}

/** Remove um ponto da trilha (botão × do popover). */
export function removeGroupPoint(groupId: string, pointId: string): void {
  const cur = hydrate(groupId)
  const next = cur.pontos.filter((p) => p.id !== pointId)
  if (next.length === cur.pontos.length) return
  commit(groupId, { ...cur, pontos: next })
}

/** Trilha em ordem cronológica: data ASC (ISO ordena lexicográfico), empate
 *  preserva a ordem de inserção (sort estável). NÃO muta a lista do store. */
export function ordenarPontos(pontos: GroupPoint[]): GroupPoint[] {
  return pontos
    .map((p, i) => [p, i] as const)
    .sort((a, b) => a[0].data.localeCompare(b[0].data) || a[1] - b[1])
    .map(([p]) => p)
}

/** Ponto ATUAL = último da trilha em ordem cronológica. */
export function pontoAtual(pontos: GroupPoint[]): GroupPoint | null {
  const ordenados = ordenarPontos(pontos)
  return ordenados.length ? ordenados[ordenados.length - 1] : null
}

/** SÓ testes: zera a memória (não o localStorage) — simula reload da página. */
export function __resetGroupStoreMemoryForTests(): void {
  memory.clear()
}
