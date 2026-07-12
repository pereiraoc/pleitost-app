// PERSISTÊNCIA local-first da ficha do herói — espelho do save do plugin
// pleitost-autosheet (diretriz do user 2026-07-05): como o app NÃO escreve na
// vault, o "FM salvo" vira um overlay persistente por herói no navegador.
//
// Canais de escrita (espelham a teoria do plugin, docs/architecture/modes.md
// §"Fonte do modelo por modo" + §"Auto-save"):
//   - 'imediato'  → abas editáveis (perfil/competências/inventário/anotações):
//     qualquer alteração grava o overlay NA HORA (o "save da Editável", só que
//     write-through, sem botão Salvar nem estado pendente).
//   - 'autosave'  → aba COMBATE (equivalente dos edits `interativa.*`): a UI
//     reflete na hora (shared-ref do plugin ≡ estado em memória + notify), e a
//     persistência é debounced 800 ms com coalescência de cliques rápidos —
//     verbatim da orquestra de auto-save do plugin em
//     src/cola/process-yaml-callbacks.ts:129-186 (autoSaveDebounceMs ?? 800;
//     "coalesce cliques rápidos ... num único save"; tests podem reduzir).
//     Como localStorage é síncrono, o ramo `pendingAfterCurrent` do plugin
//     (save assíncrono em curso) não tem equivalente aqui.
//
// Formato por herói (chave `pleitost.heroEdits.<heroId>`):
//   fm      — Record<dot-path, valor>: overlay do FM extraído; o valor
//             SUBSTITUI por inteiro o nó naquele path (mesma semântica do
//             write-through do plugin, que grava `interativa.<container>`
//             com o snapshot completo — structuredClone obrigatório).
//             Paths só endereçam chaves estruturais fixas do FM (seções e
//             sub-campos canônicos); chaves livres (nomes de item em
//             Usos_Recursos etc.) ficam DENTRO de valores de container.
//   session — estado de combate sem home no FM (chips do design, escudo
//             erguido, consumível usado): Record<dot-path, valor>.
//   extras  — adições sem linha de FM (painéis ADICIONADAS do design):
//             Record<'armas'|'tesouros', string[] de ids de doc>.
//
// Por que localStorage (e não IndexedDB): o overlay é ESPARSO — só os paths
// alterados, nunca o FM inteiro (FMs têm dezenas de KB; deltas ficam na casa
// de poucos KB/herói). Leitura síncrona é requisito pra hidratar o modelo no
// primeiro render sem flash/efeito assíncrono, e jsdom implementa localStorage
// nativamente (padrão de testes do repo). Quota de ~5 MB comporta dezenas de
// heróis de deltas; o log de debug é capado.
//
// Log de mudanças (modo debug, espírito do debugMode/JSONL do plugin —
// src/settings/plugin-settings.ts:8): cada gravação gera entrada
// {timestamp, heroId, path, valorAntigo, valorNovo, origem} em
// `pleitost.debugLog` (array capado). Flag em `pleitost.debug` + query
// ?debug=1. Console API: window.__pleitostDebug (ver/limpar/baixar o log,
// resetar edições locais por herói) — o app não tem tela CONFIG desenhada.

export interface HeroEdits {
  fm: Record<string, unknown>
  session: Record<string, unknown>
  extras: Record<string, unknown>
}

export type WriteChannel = 'imediato' | 'autosave'
export type EditSection = 'fm' | 'session' | 'extras'

export interface DebugEntry {
  timestamp: string
  heroId: string
  path: string
  valorAntigo: unknown
  valorNovo: unknown
  origem: string
}

const STORE_PREFIX = 'pleitost.heroEdits.'
const DEBUG_FLAG_KEY = 'pleitost.debug'
const DEBUG_LOG_KEY = 'pleitost.debugLog'
const DEBUG_LOG_MAX = 500

// Espelho do autoSaveDebounceMs do plugin (process-yaml-callbacks.ts:129,
// default 800 ms; "Tests podem reduzir pra acelerar").
let autoSaveDebounceMs = 800

const memory = new Map<string, HeroEdits>()
const listeners = new Map<string, Set<() => void>>()
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>()

function emptyEdits(): HeroEdits {
  return { fm: {}, session: {}, extras: {} }
}

/** localStorage com try/catch — ambiente sem storage (node puro) ou private
 *  mode/quota degradam pra memória. */
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

function storageKey(heroId: string): string {
  return STORE_PREFIX + heroId
}

function hydrate(heroId: string): HeroEdits {
  const cached = memory.get(heroId)
  if (cached) return cached
  let edits = emptyEdits()
  const raw = safeGet(storageKey(heroId))
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<HeroEdits>
      edits = {
        fm: parsed.fm && typeof parsed.fm === 'object' ? parsed.fm : {},
        session: parsed.session && typeof parsed.session === 'object' ? parsed.session : {},
        extras: parsed.extras && typeof parsed.extras === 'object' ? parsed.extras : {},
      }
    } catch {
      edits = emptyEdits()
    }
  }
  memory.set(heroId, edits)
  return edits
}

/** Snapshot estável das edições locais do herói (pra useSyncExternalStore). */
export function getHeroEdits(heroId: string): HeroEdits {
  return hydrate(heroId)
}

export function subscribeHero(heroId: string, cb: () => void): () => void {
  let set = listeners.get(heroId)
  if (!set) {
    set = new Set()
    listeners.set(heroId, set)
  }
  set.add(cb)
  return () => {
    set.delete(cb)
  }
}

function notify(heroId: string): void {
  for (const cb of listeners.get(heroId) ?? []) cb()
}

function hasEdits(edits: HeroEdits): boolean {
  return (
    Object.keys(edits.fm).length > 0 ||
    Object.keys(edits.session).length > 0 ||
    Object.keys(edits.extras).length > 0
  )
}

function persist(heroId: string): void {
  const edits = memory.get(heroId)
  if (!edits || !hasEdits(edits)) {
    safeRemove(storageKey(heroId))
    return
  }
  safeSet(storageKey(heroId), JSON.stringify({ ...edits, updatedAt: new Date().toISOString() }))
}

/** Debounce + coalescência do canal 'autosave' (plugin: scheduleAutoSave,
 *  process-yaml-callbacks.ts:141-147 — cliques subsequentes resetam o timer). */
function schedulePersist(heroId: string): void {
  const prev = pendingTimers.get(heroId)
  if (prev != null) clearTimeout(prev)
  pendingTimers.set(
    heroId,
    setTimeout(() => {
      pendingTimers.delete(heroId)
      persist(heroId)
    }, autoSaveDebounceMs),
  )
}

/** Persiste TODO save debounced pendente já (beforeunload + testes). */
export function flushHeroEdits(): void {
  for (const [heroId, timer] of pendingTimers) {
    clearTimeout(timer)
    persist(heroId)
  }
  pendingTimers.clear()
}

/** Espelho do autoSaveDebounceMs configurável do plugin (testes reduzem). */
export function configureHeroStore(opts: { autoSaveDebounceMs?: number }): void {
  if (opts.autoSaveDebounceMs !== undefined) autoSaveDebounceMs = opts.autoSaveDebounceMs
}

export interface WriteOptions {
  channel: WriteChannel
  origem: string
  /** Valor vigente ANTES da gravação (do modelo mergeado) — pro log. */
  valorAntigo?: unknown
}

/** Listener GLOBAL de writes (sync de sessão #101b): recebe todo writeHeroEdit
 *  de fm com origem — o adapter encaminha `Interativa.*` pra sala e usa a
 *  origem 'sync' como guarda de eco (writes aplicados do remoto não voltam). */
export type HeroWriteListener = (heroId: string, path: string, value: unknown, origem: string) => void
const writeListeners = new Set<HeroWriteListener>()
export function onHeroWrite(cb: HeroWriteListener): () => void {
  writeListeners.add(cb)
  return () => writeListeners.delete(cb)
}

/** Gravação central: atualiza memória (UI na hora), notifica, persiste pelo
 *  canal e loga em modo debug. O valor é clonado — "structuredClone é
 *  obrigatório" no write-through do plugin (docs/architecture/modes.md). */
export function writeHeroEdit(
  heroId: string,
  section: EditSection,
  path: string,
  value: unknown,
  opts: WriteOptions,
): void {
  const cur = hydrate(heroId)
  const cloned = value === undefined ? undefined : structuredClone(value)
  const nextSection = { ...cur[section] }
  if (cloned === undefined) delete nextSection[path]
  else nextSection[path] = cloned
  const next: HeroEdits = { ...cur, [section]: nextSection }
  memory.set(heroId, next)
  notify(heroId)
  if (opts.channel === 'autosave') schedulePersist(heroId)
  else persist(heroId)
  if (section === 'fm') for (const l of writeListeners) l(heroId, path, cloned, opts.origem)
  logChange({
    timestamp: new Date().toISOString(),
    heroId,
    path: section === 'fm' ? path : `${section}.${path}`,
    valorAntigo: opts.valorAntigo,
    valorNovo: cloned,
    origem: opts.origem,
  })
}

/** Descarta as edições locais do herói — volta ao FM extraído (vault-data). */
export function resetHeroEdits(heroId: string): void {
  const timer = pendingTimers.get(heroId)
  if (timer != null) {
    clearTimeout(timer)
    pendingTimers.delete(heroId)
  }
  const tinha = hasEdits(hydrate(heroId))
  memory.set(heroId, emptyEdits())
  safeRemove(storageKey(heroId))
  notify(heroId)
  if (tinha) {
    logChange({
      timestamp: new Date().toISOString(),
      heroId,
      path: '*',
      valorAntigo: undefined,
      valorNovo: undefined,
      origem: 'reset',
    })
  }
}

/* ===================== overlay ⇢ modelo ===================== */

/** Valor vigente num dot-path do FM (pra valorAntigo do log). */
export function getAtPath(fm: Record<string, unknown>, path: string): unknown {
  let cur: unknown = fm
  for (const seg of path.split('.')) {
    if (!cur || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[seg]
  }
  return cur
}

/** Set imutável num dot-path: clona só a espinha, substitui o nó inteiro. */
function setAtPath(
  root: Record<string, unknown>,
  segs: string[],
  value: unknown,
): Record<string, unknown> {
  const out = { ...root }
  let node = out
  for (let i = 0; i < segs.length - 1; i++) {
    const cur = node[segs[i]]
    const clone = cur && typeof cur === 'object' && !Array.isArray(cur) ? { ...(cur as Record<string, unknown>) } : {}
    node[segs[i]] = clone
    node = clone
  }
  node[segs[segs.length - 1]] = value
  return out
}

/** FM extraído + overlay = modelo salvo local (projeção pura, sem regra).
 *  Paths mais rasos aplicam primeiro; NUNCA muta o doc do cache. */
export function applyFmEdits(
  fm: Record<string, unknown>,
  edits: Record<string, unknown>,
): Record<string, unknown> {
  const paths = Object.keys(edits)
  if (!paths.length) return fm
  let out = fm
  for (const path of paths.sort((a, b) => a.split('.').length - b.split('.').length)) {
    out = setAtPath(out === fm ? { ...fm } : out, path.split('.'), edits[path])
  }
  return out
}

/* ===================== debug ===================== */

export function isDebugEnabled(): boolean {
  return safeGet(DEBUG_FLAG_KEY) === '1'
}

export function setDebugEnabled(on: boolean): void {
  if (on) safeSet(DEBUG_FLAG_KEY, '1')
  else safeRemove(DEBUG_FLAG_KEY)
}

export function debugEntries(): DebugEntry[] {
  const raw = safeGet(DEBUG_LOG_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as DebugEntry[]) : []
  } catch {
    return []
  }
}

export function clearDebugLog(): void {
  safeRemove(DEBUG_LOG_KEY)
}

function logChange(entry: DebugEntry): void {
  if (!isDebugEnabled()) return
  const log = debugEntries()
  log.push(entry)
  safeSet(DEBUG_LOG_KEY, JSON.stringify(log.slice(-DEBUG_LOG_MAX)))
}

/* ===================== console API ===================== */

export interface PleitostDebugApi {
  enable: () => void
  disable: () => void
  isEnabled: () => boolean
  /** Entradas do log de mudanças (modo debug). */
  log: () => DebugEntry[]
  clear: () => void
  /** Baixa o log como JSON. */
  download: () => void
  /** Edições locais persistidas do herói. */
  edits: (heroId: string) => HeroEdits
  /** Descarta edições locais do herói (volta ao FM extraído). */
  reset: (heroId: string) => void
}

declare global {
  interface Window {
    __pleitostDebug?: PleitostDebugApi
  }
}

function downloadLog(): void {
  if (typeof document === 'undefined') return
  const blob = new Blob([JSON.stringify(debugEntries(), null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `pleitost-debug-log-${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
}

if (typeof window !== 'undefined') {
  // ?debug=1 liga o modo debug (persistente via flag em localStorage).
  try {
    if (new URLSearchParams(window.location.search).get('debug') === '1') setDebugEnabled(true)
  } catch {
    /* noop */
  }
  window.__pleitostDebug = {
    enable: () => setDebugEnabled(true),
    disable: () => setDebugEnabled(false),
    isEnabled: isDebugEnabled,
    log: debugEntries,
    clear: clearDebugLog,
    download: downloadLog,
    edits: getHeroEdits,
    reset: resetHeroEdits,
  }
  // Save debounced pendente não pode se perder ao fechar/recarregar a aba.
  window.addEventListener('beforeunload', flushHeroEdits)
}

/** SÓ testes: zera a memória (não o localStorage) — simula reload da página. */
export function __resetHeroStoreMemoryForTests(): void {
  for (const timer of pendingTimers.values()) clearTimeout(timer)
  pendingTimers.clear()
  memory.clear()
}
