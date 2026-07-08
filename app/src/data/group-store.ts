// PERSISTÊNCIA local-first do estado de GRUPO (issue #36 — aba EXPLORAÇÃO):
// região ativa + trilha do grupo no mapa da região, um namespace por grupo em
// `pleitost.groupState.<groupId>`. Segue o padrão do hero-store (leitura
// SÍNCRONA pra hidratar no primeiro render, cache em memória + notify pra
// useSyncExternalStore); só existe o canal 'imediato' — cada mutação grava
// o localStorage na hora (não há edits de combate debounced aqui).
//
// Issue #48: a trilha deixou de ser pontos {x,y} soltos e passou a ser HEXES
// de uma grade sobreposta ao mapa hex-based (ver exploracao.ts). Cada hex é
// identificado por {col,row} da grade; o centro em pixels da fonte é derivado
// da geometria (hexCenter), nunca guardado.
//
// Issue #68 (região ativa): o GM escolhe, por grupo, em qual REGIÃO o grupo
// está (dentre as com mapa — region-maps.ts). O id do doc de Localização raiz
// da região é gravado em `regiaoAtiva`; o mapa e o mapeamento hex→localização
// (hexmap-store) exibidos são os DESSA região.
//
// Issue #69 (caminho ordenado): a ordem dos hexes deixou de ser derivada de
// data e passou a ser a ORDEM EXPLÍCITA do array `hexes[]` (o caminho). O
// jogador insere paradas (inclusive no meio) e reordena por drag — a trilha
// traçada no mapa segue essa ordem. O campo `data` virou metadado opcional da
// parada (sem papel na ordenação).
//
// Issue #71 (token de grupo): `atualId` guarda qual hex é o ATUAL (a "moeda"
// no mapa); default = última parada do caminho quando não setado.
//
// Migração das formas antigas: a forma {pontos:[{x,y}]} (pré-#48) e a ausência
// de regiaoAtiva/atualId simplesmente não hidratam (isHex filtra pontos; os
// campos novos são opcionais). Sem dados reais migráveis, sancionado trocar a
// forma.

export interface GroupHex {
  id: string
  /** Coluna da grade hexagonal sobreposta ao mapa (ver exploracao.ts). */
  col: number
  /** Linha da grade hexagonal (offset odd-q; centro derivado por hexCenter). */
  row: number
  /** Data ISO (YYYY-MM-DD) — metadado opcional da parada; não ordena (#69). */
  data?: string
  /** Doc de Localização do Atlas associado (id do catálogo), opcional. */
  localId?: string
}

export interface GroupState {
  /** Id do doc de Localização raiz da região ativa (region-maps.ts), #68. */
  regiaoAtiva?: string
  /** Paradas do caminho na ORDEM explícita do array (#69). */
  hexes: GroupHex[]
  /** Hex ATUAL — a "moeda" do grupo no mapa (#71); default = última parada. */
  atualId?: string
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
    (h.data === undefined || typeof h.data === 'string') &&
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
      if (Array.isArray(parsed.hexes)) {
        const hexes = parsed.hexes.filter(isHex)
        state = {
          hexes,
          // regiaoAtiva/atualId só hidratam se forem strings válidas; atualId
          // aponta um hex existente (senão cai no default = última parada).
          ...(typeof parsed.regiaoAtiva === 'string' ? { regiaoAtiva: parsed.regiaoAtiva } : {}),
          ...(typeof parsed.atualId === 'string' && hexes.some((h) => h.id === parsed.atualId)
            ? { atualId: parsed.atualId }
            : {}),
        }
      }
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

/** Estado vazio (nenhuma parada, nenhuma região) → chave removida. */
function isEmpty(s: GroupState): boolean {
  return s.hexes.length === 0 && !s.regiaoAtiva
}

/** Canal 'imediato': memória (UI na hora) + notify + localStorage. */
function commit(groupId: string, next: GroupState): void {
  memory.set(groupId, next)
  notify(groupId)
  if (isEmpty(next)) safeRemove(storageKey(groupId))
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

// ── Região ativa (#68) ─────────────────────────────────────────────────────

/** Define a REGIÃO ativa do grupo (id do doc raiz da região com mapa). Ao
 *  trocar de região a trilha some do mapa (hexes são coordenadas relativas à
 *  grade da região); mantemos a trilha guardada mas o atualId volta ao default. */
export function setRegiaoAtiva(groupId: string, regionId: string): void {
  const cur = hydrate(groupId)
  if (cur.regiaoAtiva === regionId) return
  commit(groupId, { ...cur, regiaoAtiva: regionId })
}

// ── Trilha / caminho (#69) ──────────────────────────────────────────────────

/** Hex já marcado numa dada célula (col,row), ou null — pra toggle/lookup. */
export function hexAt(hexes: GroupHex[], col: number, row: number): GroupHex | null {
  return hexes.find((h) => h.col === col && h.row === row) ?? null
}

/** Acrescenta uma parada AO FINAL do caminho (id gerado aqui) e devolve o hex
 *  criado. Se a célula (col,row) já for parada, devolve a existente. */
export function addGroupHex(groupId: string, hex: Omit<GroupHex, 'id'>): GroupHex {
  return insertGroupHex(groupId, hex, Infinity)
}

/** Insere uma parada no caminho na posição `index` (0 = início; ≥ length =
 *  fim). Se a célula já for parada, devolve a existente sem mover (#69: "add
 *  no meio" só cria; reordenar é por moveGroupHex). */
export function insertGroupHex(
  groupId: string,
  hex: Omit<GroupHex, 'id'>,
  index: number,
): GroupHex {
  const cur = hydrate(groupId)
  const existente = hexAt(cur.hexes, hex.col, hex.row)
  if (existente) return existente
  const created: GroupHex = { ...hex, id: newHexId() }
  const at = Math.max(0, Math.min(cur.hexes.length, Math.floor(index)))
  const hexes = cur.hexes.slice()
  hexes.splice(at, 0, created)
  commit(groupId, { ...cur, hexes })
  return created
}

/** Move a parada `hexId` pra posição `toIndex` (drag-reorder do caminho, #69). */
export function moveGroupHex(groupId: string, hexId: string, toIndex: number): void {
  const cur = hydrate(groupId)
  const from = cur.hexes.findIndex((h) => h.id === hexId)
  if (from === -1) return
  const hexes = cur.hexes.slice()
  const [moved] = hexes.splice(from, 1)
  const to = Math.max(0, Math.min(hexes.length, Math.floor(toIndex)))
  hexes.splice(to, 0, moved)
  // no-op se a ordem não mudou (evita render/gravação inútil)
  if (hexes.every((h, i) => h.id === cur.hexes[i].id)) return
  commit(groupId, { ...cur, hexes })
}

/** Atualiza data/local de uma parada existente. */
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
  // localId/data vazios removem o campo (o JSON não guarda undefined).
  if (!merged.localId) delete merged.localId
  if (!merged.data) delete merged.data
  next[idx] = merged
  commit(groupId, { ...cur, hexes: next })
}

/** Remove uma parada do caminho (× do popover / da lista). Se era o ATUAL,
 *  o atualId cai no default (última parada). */
export function removeGroupHex(groupId: string, hexId: string): void {
  const cur = hydrate(groupId)
  const next = cur.hexes.filter((h) => h.id !== hexId)
  if (next.length === cur.hexes.length) return
  const nextState: GroupState = { ...cur, hexes: next }
  // era o ATUAL → volta ao default (última parada); o ...cur carrega o antigo
  // atualId, então apago explicitamente.
  if (cur.atualId === hexId) delete nextState.atualId
  commit(groupId, nextState)
}

// ── Token / hex atual (#71) ─────────────────────────────────────────────────

/** Define o hex ATUAL (a moeda). null volta ao default (última parada). */
export function setAtualHex(groupId: string, hexId: string | null): void {
  const cur = hydrate(groupId)
  if (hexId && !cur.hexes.some((h) => h.id === hexId)) return
  const next: GroupState = { ...cur }
  if (hexId) next.atualId = hexId
  else delete next.atualId
  if (next.atualId === cur.atualId) return
  commit(groupId, next)
}

/** Hex ATUAL = o setado explicitamente (#71) ou, no default, a última parada
 *  do caminho (ordem explícita, #69). NÃO muta a lista. */
export function hexAtual(state: GroupState): GroupHex | null {
  if (state.atualId) {
    const t = state.hexes.find((h) => h.id === state.atualId)
    if (t) return t
  }
  return state.hexes.length ? state.hexes[state.hexes.length - 1] : null
}

/** SÓ testes: zera a memória (não o localStorage) — simula reload da página. */
export function __resetGroupStoreMemoryForTests(): void {
  memory.clear()
}
