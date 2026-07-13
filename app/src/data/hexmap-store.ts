// AUTORIA DO MAPA DE HEXCRAWL (issue #67; áreas em #79; multi-área em #82) — o
// GM associa cada HEX da grade sobreposta ao mapa de uma região a:
//   • um LUGAR pontual (localId): uma Localização do Atlas (Capital, Cidade,
//     Ponto de Interesse pontual); e/ou
//   • uma ou MAIS ÁREAS (areaIds): Regiões/Nações/Pontos de Interesse que
//     COBREM muitos hexes. Um hex pode pertencer a VÁRIAS áreas ao mesmo tempo
//     ("um lugar pode ser de duas regiões", #82) — marcar/limpar uma área NÃO
//     mexe nas outras nem no lugar.
// Retrocompat: dados antigos {col,row,localId} e {…,areaId:"X"} (área única)
// carregam intactos — `areaId` migra pra `areaIds:["X"]` na leitura.
//
// Persistência local-first no padrão do group-store/hero-store: leitura
// SÍNCRONA pra hidratar no primeiro render, cache em memória + notify pra
// useSyncExternalStore, único canal 'imediato' (cada mutação grava o
// localStorage na hora). Um namespace por REGIÃO em `pleitost.hexMap.<regiao>`.
//
// A célula é identificada por {col,row}. No máximo UMA célula por (col,row).
// Uma célula sem localId E sem áreas é descartada (não referencia nada).

import { SEED_HEXMAPS } from './seed-hexmaps'
export interface HexMapCell {
  /** Coluna da grade hexagonal sobreposta ao mapa (ver exploracao.ts). */
  col: number
  /** Linha da grade hexagonal (offset odd-q; centro derivado por hexCenter). */
  row: number
  /** LUGAR pontual do Atlas que este hex referencia (id do catálogo). */
  localId?: string
  /** ÁREAS grandes (Região/Nação/Ponto de Interesse) que este hex integra — um
   *  hex pode estar em VÁRIAS. Ausente/vazio = nenhuma. */
  areaIds?: string[]
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

/** Constrói a célula OMITINDO chaves ausentes (nada de `areaIds: []`) —
 *  preserva a forma {col,row,localId} dos dados/testes antigos. */
function makeCell(col: number, row: number, localId?: string, areaIds?: readonly string[]): HexMapCell {
  const cell: HexMapCell = { col, row }
  if (localId) cell.localId = localId
  if (areaIds && areaIds.length) cell.areaIds = [...new Set(areaIds)]
  return cell
}

/** localStorage com try/catch — sem storage/quota degrada pra memória. */
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

/** Normaliza uma célula do localStorage: (col,row) finitos + PELO MENOS um eixo
 *  (localId ou área). Migra `areaId` (área única antiga) → `areaIds`. Devolve a
 *  célula só com as chaves presentes, ou null se malformada. */
function normalizeCell(raw: unknown): HexMapCell | null {
  if (!raw || typeof raw !== 'object') return null
  const c = raw as Record<string, unknown>
  if (typeof c.col !== 'number' || !Number.isFinite(c.col)) return null
  if (typeof c.row !== 'number' || !Number.isFinite(c.row)) return null
  const localId = typeof c.localId === 'string' && c.localId !== '' ? c.localId : undefined
  const areaIds: string[] = []
  if (Array.isArray(c.areaIds)) {
    for (const a of c.areaIds) if (typeof a === 'string' && a !== '') areaIds.push(a)
  } else if (typeof c.areaId === 'string' && c.areaId !== '') {
    areaIds.push(c.areaId) // migração da área única antiga
  }
  if (!localId && areaIds.length === 0) return null
  return makeCell(c.col, c.row, localId, areaIds)
}

// #214: seeds mutável só pra teste isolar a autoria do zero (__setSeedsForTests);
// em produção é sempre o registro versionado de seed-hexmaps.ts.
let seeds: Record<string, unknown[]> = SEED_HEXMAPS
export function __setSeedsForTests(next: Record<string, unknown[]>): void {
  seeds = next
}

function hydrate(regionId: string): HexMapState {
  const cached = memory.get(regionId)
  if (cached) return cached
  let state = emptyState()
  const raw = safeGet(storageKey(regionId))
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<HexMapState>
      if (Array.isArray(parsed.cells)) {
        state = { cells: parsed.cells.map(normalizeCell).filter((c): c is HexMapCell => c !== null) }
      }
    } catch {
      state = emptyState()
    }
  } else if (seeds[regionId]) {
    // #214: sem estado salvo NESTE navegador, o mapa nasce do mapeamento
    // canônico versionado — hexes nomeados (Safira etc.) resolvem em qualquer
    // dispositivo. A primeira edição do usuário persiste o estado inteiro
    // (seed + edição) e daí em diante o salvo manda.
    state = { cells: seeds[regionId].map(normalizeCell).filter((c): c is HexMapCell => c !== null) }
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

// ─────────────────────────────── LUGARES ────────────────────────────────────

/** Associa (ou re-associa) o LUGAR de um hex, PRESERVANDO as áreas dele. */
export function setHexLocal(
  regionId: string,
  col: number,
  row: number,
  localId: string,
): HexMapCell {
  const cur = hydrate(regionId)
  const idx = cur.cells.findIndex((c) => c.col === col && c.row === row)
  const cell = makeCell(col, row, localId, idx === -1 ? undefined : cur.cells[idx].areaIds)
  if (idx === -1) {
    commit(regionId, { ...cur, cells: [...cur.cells, cell] })
  } else if (cur.cells[idx].localId !== localId) {
    const next = cur.cells.slice()
    next[idx] = cell
    commit(regionId, { ...cur, cells: next })
  }
  return cell
}

/** Remove o LUGAR de um hex. Se ainda pertencer a alguma área, mantém a célula
 *  (só com as áreas); senão apaga. */
export function removeHex(regionId: string, col: number, row: number): void {
  const cur = hydrate(regionId)
  const idx = cur.cells.findIndex((c) => c.col === col && c.row === row)
  if (idx === -1 || cur.cells[idx].localId === undefined) return
  const areaIds = cur.cells[idx].areaIds
  const next = cur.cells.slice()
  if (areaIds && areaIds.length) next[idx] = makeCell(col, row, undefined, areaIds)
  else next.splice(idx, 1)
  commit(regionId, { ...cur, cells: next })
}

/** Índice {localId → célula} — quais Localizações já estão no mapa como LUGAR. */
export function cellsByLocal(cells: HexMapCell[]): Map<string, HexMapCell> {
  const out = new Map<string, HexMapCell>()
  for (const c of cells) if (c.localId) out.set(c.localId, c)
  return out
}

// ──────────────────────────────── ÁREAS ─────────────────────────────────────

/** Áreas (ids) do hex (col,row) — [] se nenhuma. */
export function areasAt(cells: HexMapCell[], col: number, row: number): string[] {
  return cells.find((c) => c.col === col && c.row === row)?.areaIds ?? []
}

/** O hex (col,row) pertence à área `areaId`? */
export function hexHasArea(cells: HexMapCell[], col: number, row: number, areaId: string): boolean {
  return areasAt(cells, col, row).includes(areaId)
}

/** Todos os hexes que integram a área `areaId` (um hex pode estar em várias). */
export function cellsOfArea(cells: HexMapCell[], areaId: string): HexMapCell[] {
  return cells.filter((c) => c.areaIds?.includes(areaId))
}

/** Ids das áreas presentes no mapa (ordem de primeira aparição). */
export function areaIdsInMap(cells: HexMapCell[]): string[] {
  const out: string[] = []
  for (const c of cells) for (const a of c.areaIds ?? []) if (!out.includes(a)) out.push(a)
  return out
}

/** ADICIONA a ÁREA `areaId` a um conjunto de hexes, em UM commit (laço/toque).
 *  Preserva o lugar E as OUTRAS áreas de cada hex (multi-membership, #82). */
export function setHexAreaBulk(
  regionId: string,
  targets: { col: number; row: number }[],
  areaId: string,
): void {
  if (targets.length === 0 || !areaId) return
  const cur = hydrate(regionId)
  const next = cur.cells.slice()
  let changed = false
  for (const t of targets) {
    const idx = next.findIndex((c) => c.col === t.col && c.row === t.row)
    if (idx === -1) {
      next.push(makeCell(t.col, t.row, undefined, [areaId]))
      changed = true
    } else if (!(next[idx].areaIds ?? []).includes(areaId)) {
      next[idx] = makeCell(t.col, t.row, next[idx].localId, [...(next[idx].areaIds ?? []), areaId])
      changed = true
    }
  }
  if (changed) commit(regionId, { ...cur, cells: next })
}

/** Marca UM hex na área `areaId` (preserva lugar + outras áreas). */
export function setHexArea(regionId: string, col: number, row: number, areaId: string): void {
  setHexAreaBulk(regionId, [{ col, row }], areaId)
}

/** Remove a ÁREA `areaId` (ou TODAS, se omitido) de um conjunto de hexes. Hex
 *  que ficar sem lugar E sem áreas é apagado. UM único commit. */
export function removeHexAreaBulk(
  regionId: string,
  targets: { col: number; row: number }[],
  areaId?: string,
): void {
  if (targets.length === 0) return
  const cur = hydrate(regionId)
  const drop = new Set(targets.map((t) => `${t.col},${t.row}`))
  const next: HexMapCell[] = []
  let changed = false
  for (const c of cur.cells) {
    if (!drop.has(`${c.col},${c.row}`) || !(c.areaIds && c.areaIds.length)) {
      next.push(c)
      continue
    }
    const keep = areaId ? c.areaIds.filter((a) => a !== areaId) : []
    if (keep.length === c.areaIds.length) {
      next.push(c) // nada a remover neste hex
      continue
    }
    changed = true
    if (c.localId || keep.length) next.push(makeCell(c.col, c.row, c.localId, keep))
    // sem lugar e sem áreas → some
  }
  if (changed) commit(regionId, { ...cur, cells: next })
}

/** Remove UMA área (ou todas, se omitido) de UM hex. */
export function removeHexArea(regionId: string, col: number, row: number, areaId?: string): void {
  removeHexAreaBulk(regionId, [{ col, row }], areaId)
}

/** Apaga uma área inteira do mapa (de todos os hexes dela). */
export function removeArea(regionId: string, areaId: string): void {
  const cur = hydrate(regionId)
  removeHexAreaBulk(
    regionId,
    cellsOfArea(cur.cells, areaId).map((c) => ({ col: c.col, row: c.row })),
    areaId,
  )
}

// ─────────────────────── BACKUP (export/import) #81 ─────────────────────────

const BACKUP_KIND = 'pleitost.hexmap.backup'

/** Serializa TODOS os mapas salvos (todas as regiões) num JSON portátil. */
export function exportAllHexMaps(): string {
  const data: Record<string, string> = {}
  const s = storage()
  if (s) {
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i)
      if (k && k.startsWith(STORE_PREFIX)) {
        const v = s.getItem(k)
        if (v != null) data[k] = v
      }
    }
  }
  for (const [regionId, state] of memory) {
    const k = storageKey(regionId)
    if (!(k in data) && state.cells.length) data[k] = JSON.stringify(state)
  }
  return JSON.stringify({ kind: BACKUP_KIND, v: 1, data }, null, 2)
}

/** Restaura mapas de um JSON de backup. Devolve quantas regiões entraram.
 *  Lança se o arquivo não for um backup válido. */
export function importAllHexMaps(json: string): number {
  const parsed = JSON.parse(json) as { kind?: string; data?: Record<string, unknown> }
  if (parsed?.kind !== BACKUP_KIND || !parsed.data || typeof parsed.data !== 'object') {
    throw new Error('Arquivo de backup inválido')
  }
  let n = 0
  for (const [k, v] of Object.entries(parsed.data)) {
    if (!k.startsWith(STORE_PREFIX) || typeof v !== 'string') continue
    safeSet(k, v)
    const regionId = k.slice(STORE_PREFIX.length)
    memory.delete(regionId) // força rehidratar (e migrar areaId→areaIds)
    notify(regionId)
    n++
  }
  return n
}

/** SÓ testes: zera a memória (não o localStorage) — simula reload da página. */
export function __resetHexMapStoreMemoryForTests(): void {
  memory.clear()
}
