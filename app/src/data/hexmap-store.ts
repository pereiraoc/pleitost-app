// AUTORIA DO MAPA DE HEXCRAWL (issue #67; áreas em #79) — o GM associa cada HEX
// da grade sobreposta ao mapa de uma região a:
//   • um LUGAR pontual (localId): uma Localização do Atlas (Capital, Cidade,
//     Ponto de Interesse pontual) — como na #67; e/ou
//   • uma ÁREA grande (areaId): uma Região/Nação/Ponto de Interesse que COBRE
//     muitos hexes, marcada em massa (um por um ou por laço/polígono, #79).
// Os dois eixos são ORTOGONAIS na mesma célula: marcar/limpar área nunca mexe no
// lugar já marcado e vice-versa. Dados antigos {col,row,localId} carregam
// intactos (localId continua o eixo de lugar; areaId é opcional e ausente neles).
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
// nunca guardado. No máximo UMA célula por (col,row). Uma célula sem localId
// NEM areaId é descartada (não referencia nada).

export interface HexMapCell {
  /** Coluna da grade hexagonal sobreposta ao mapa (ver exploracao.ts). */
  col: number
  /** Linha da grade hexagonal (offset odd-q; centro derivado por hexCenter). */
  row: number
  /** LUGAR pontual do Atlas que este hex referencia (id do catálogo). Opcional:
   *  um hex pode pertencer só a uma área. */
  localId?: string
  /** ÁREA grande (Região/Nação/Ponto de Interesse) que este hex integra (id do
   *  catálogo). Opcional e ortogonal ao localId. */
  areaId?: string
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

/** Constrói a célula OMITINDO chaves ausentes (nada de `areaId: undefined`) —
 *  preserva a forma {col,row,localId} dos dados/testes antigos. */
function makeCell(col: number, row: number, localId?: string, areaId?: string): HexMapCell {
  const cell: HexMapCell = { col, row }
  if (localId) cell.localId = localId
  if (areaId) cell.areaId = areaId
  return cell
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

/** Normaliza uma célula do localStorage: (col,row) finitos + PELO MENOS um eixo
 *  (localId ou areaId) não-vazio; devolve a célula com só as chaves presentes,
 *  ou null se malformada. */
function normalizeCell(raw: unknown): HexMapCell | null {
  if (!raw || typeof raw !== 'object') return null
  const c = raw as Record<string, unknown>
  if (typeof c.col !== 'number' || !Number.isFinite(c.col)) return null
  if (typeof c.row !== 'number' || !Number.isFinite(c.row)) return null
  const localId = typeof c.localId === 'string' && c.localId !== '' ? c.localId : undefined
  const areaId = typeof c.areaId === 'string' && c.areaId !== '' ? c.areaId : undefined
  if (!localId && !areaId) return null
  return makeCell(c.col, c.row, localId, areaId)
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

/** Associa (ou re-associa) o LUGAR de um hex (col,row) a uma Localização,
 *  PRESERVANDO qualquer área já marcada nele. Devolve a célula resultante. */
export function setHexLocal(
  regionId: string,
  col: number,
  row: number,
  localId: string,
): HexMapCell {
  const cur = hydrate(regionId)
  const idx = cur.cells.findIndex((c) => c.col === col && c.row === row)
  const cell = makeCell(col, row, localId, idx === -1 ? undefined : cur.cells[idx].areaId)
  if (idx === -1) {
    commit(regionId, { ...cur, cells: [...cur.cells, cell] })
  } else if (cur.cells[idx].localId !== localId) {
    const next = cur.cells.slice()
    next[idx] = cell
    commit(regionId, { ...cur, cells: next })
  }
  return cell
}

/** Remove o LUGAR de um hex (col,row). Se o hex ainda pertencer a uma área,
 *  mantém a célula (só com a área); senão apaga a célula. */
export function removeHex(regionId: string, col: number, row: number): void {
  const cur = hydrate(regionId)
  const idx = cur.cells.findIndex((c) => c.col === col && c.row === row)
  if (idx === -1 || cur.cells[idx].localId === undefined) return
  const areaId = cur.cells[idx].areaId
  const next = cur.cells.slice()
  if (areaId) next[idx] = makeCell(col, row, undefined, areaId)
  else next.splice(idx, 1)
  commit(regionId, { ...cur, cells: next })
}

/** Índice {localId → célula} — pra saber quais Localizações já estão no mapa
 *  como LUGAR (a última associação vence). Células só-de-área são ignoradas. */
export function cellsByLocal(cells: HexMapCell[]): Map<string, HexMapCell> {
  const out = new Map<string, HexMapCell>()
  for (const c of cells) if (c.localId) out.set(c.localId, c)
  return out
}

// ──────────────────────────────── ÁREAS ─────────────────────────────────────

/** Área (id do doc) do hex (col,row), ou null. */
export function areaAt(cells: HexMapCell[], col: number, row: number): string | null {
  return cells.find((c) => c.col === col && c.row === row)?.areaId ?? null
}

/** Todos os hexes que integram a área `areaId`. */
export function cellsOfArea(cells: HexMapCell[], areaId: string): HexMapCell[] {
  return cells.filter((c) => c.areaId === areaId)
}

/** Ids das áreas presentes no mapa (ordem de primeira aparição). */
export function areaIdsInMap(cells: HexMapCell[]): string[] {
  const out: string[] = []
  for (const c of cells) if (c.areaId && !out.includes(c.areaId)) out.push(c.areaId)
  return out
}

/** Upsert em massa da ÁREA `areaId` num conjunto de hexes, em UM único commit
 *  (laço/polígono, #79). Preserva o localId de cada hex. Reassocia hexes que já
 *  eram de outra área. No-op se nada muda. */
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
      next.push(makeCell(t.col, t.row, undefined, areaId))
      changed = true
    } else if (next[idx].areaId !== areaId) {
      next[idx] = makeCell(t.col, t.row, next[idx].localId, areaId)
      changed = true
    }
  }
  if (changed) commit(regionId, { ...cur, cells: next })
}

/** Marca UM hex na área `areaId` (preserva o lugar). Atalho de bulk com 1 alvo. */
export function setHexArea(regionId: string, col: number, row: number, areaId: string): void {
  setHexAreaBulk(regionId, [{ col, row }], areaId)
}

/** Remove a ÁREA de um conjunto de hexes (só onde a área bate com `areaId`, se
 *  informado; senão remove qualquer área). Hex que ficar sem lugar é apagado.
 *  UM único commit. */
export function removeHexAreaBulk(
  regionId: string,
  targets: { col: number; row: number }[],
  areaId?: string,
): void {
  if (targets.length === 0) return
  const cur = hydrate(regionId)
  const next: HexMapCell[] = []
  let changed = false
  const drop = new Set(targets.map((t) => `${t.col},${t.row}`))
  for (const c of cur.cells) {
    const hit = drop.has(`${c.col},${c.row}`) && c.areaId !== undefined && (!areaId || c.areaId === areaId)
    if (!hit) {
      next.push(c)
      continue
    }
    changed = true
    if (c.localId) next.push(makeCell(c.col, c.row, c.localId, undefined))
    // sem lugar → some
  }
  if (changed) commit(regionId, { ...cur, cells: next })
}

/** Remove a área de UM hex. */
export function removeHexArea(regionId: string, col: number, row: number): void {
  removeHexAreaBulk(regionId, [{ col, row }])
}

/** Apaga uma área inteira do mapa (todos os hexes dela). */
export function removeArea(regionId: string, areaId: string): void {
  const cur = hydrate(regionId)
  removeHexAreaBulk(regionId, cellsOfArea(cur.cells, areaId).map((c) => ({ col: c.col, row: c.row })), areaId)
}

// ─────────────────────── BACKUP (export/import) #81 ─────────────────────────
// O localStorage é por-origem/dispositivo; num túnel efêmero o mapa pode "sumir"
// se o endereço muda. Export/import dá um arquivo portátil de segurança e serve
// de diagnóstico (mostra exatamente o que está salvo).

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
  // inclui regiões só em memória (sem storage) pra não perder a sessão
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
    memory.delete(regionId) // força rehidratar do valor importado
    notify(regionId) // re-render de quem estiver assinando
    n++
  }
  return n
}

/** SÓ testes: zera a memória (não o localStorage) — simula reload da página. */
export function __resetHexMapStoreMemoryForTests(): void {
  memory.clear()
}
