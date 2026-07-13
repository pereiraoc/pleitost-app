// Store de SESSÕES de mesa (#101) — local-first, mesmo padrão do hero-store:
// localStorage síncrono + useSyncExternalStore. Uma sessão referencia um GRUPO
// da vault (roster = integrantes do grupo); o estado próprio da sessão é só o
// que NÃO deriva das fichas: iniciativa por herói, turno (round/vez — semântica
// do combat-tracker do plugin: action-bar.ts:144 `Turno ${round}`), claims de
// jogador e metadados (nome/código/mestre). Vida NUNCA vive aqui — vem do
// volátil das fichas (useVidaLocal), fonte de verdade única (#101: "vida via
// useVidaLocal/useHeroModel, sem inventar").
//
// A sincronização remota (#101b, servidor) pluga por cima deste store: o shape
// SessionRec é o payload que o servidor replica por sala.
import { useSyncExternalStore } from 'react'

export interface SessionRec {
  codigo: string
  nome: string
  /** Doc id do Grupo (vault ou local) cujo roster é a mesa. */
  grupoId: string | null
  mestre: string
  /** "quando" da lista do design — ISO de criação. */
  criadaEm: string
  /** Iniciativa por heroId. */
  init: Record<string, number>
  /** Turno (round) — plugin action-bar: `Turno ${max(1, round)}`. */
  round: number
  /** Índice do combatente ativo na ordem (init DESC, nome ASC). */
  vezIdx: number
  /** jogador → heroIds reivindicados (CLAIMED no design). */
  claims: Record<string, string[]>
  /** Id da sessão no SERVIDOR (Supabase) quando criada/entrada via repo —
   *  ausente = sessão puramente local (#186). */
  remoteId?: string
}

const KEY = 'pleitost.sessoes'
const ACTIVE_KEY = 'pleitost.sessaoAtiva'

function storage(): Storage | null {
  return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null
}

let cache: SessionRec[] | null = null
let activeCache: string | null | undefined
const listeners = new Set<() => void>()

function load(): SessionRec[] {
  if (cache) return cache
  try {
    const raw = storage()?.getItem(KEY)
    cache = raw ? (JSON.parse(raw) as SessionRec[]) : []
  } catch {
    cache = []
  }
  return cache
}

function persist(next: SessionRec[]): void {
  cache = next
  try {
    storage()?.setItem(KEY, JSON.stringify(next))
  } catch {
    // storage indisponível (private mode) — segue só em memória
  }
  for (const l of listeners) l()
}

export function listSessions(): SessionRec[] {
  return load()
}

export function getSession(codigo: string): SessionRec | undefined {
  return load().find((s) => s.codigo.toLowerCase() === codigo.toLowerCase())
}

/** Código no formato do design (genCode: 6 alfanuméricos maiúsculos). */
export function genSessionCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

export function createSession(nome: string, grupoId: string | null, mestre: string): SessionRec {
  const rec: SessionRec = {
    codigo: genSessionCode(),
    nome,
    grupoId,
    mestre,
    criadaEm: new Date().toISOString(),
    init: {},
    round: 1,
    vezIdx: 0,
    claims: {},
  }
  persist([rec, ...load()])
  return rec
}

/** Entrar por código: retorna a sessão local; código desconhecido cria um
 *  registro "remoto" placeholder (o design faz o mesmo no joinSess — sessão
 *  entra na lista; o servidor #101b preenche os dados reais ao sincronizar). */
export function joinSessionByCode(codigo: string): SessionRec {
  const existing = getSession(codigo)
  if (existing) return existing
  const rec: SessionRec = {
    codigo: codigo.toUpperCase(),
    nome: `Sessão ${codigo.toUpperCase()}`,
    grupoId: null,
    mestre: '',
    criadaEm: new Date().toISOString(),
    init: {},
    round: 1,
    vezIdx: 0,
    claims: {},
  }
  persist([rec, ...load()])
  return rec
}

export function deleteSession(codigo: string): void {
  persist(load().filter((s) => s.codigo !== codigo))
  if (getActiveSessionCode() === codigo) setActiveSessionCode(null)
}

export function updateSession(codigo: string, patch: Partial<SessionRec>): void {
  persist(load().map((s) => (s.codigo === codigo ? { ...s, ...patch } : s)))
}

export function getActiveSessionCode(): string | null {
  if (activeCache !== undefined) return activeCache
  activeCache = storage()?.getItem(ACTIVE_KEY) ?? null
  return activeCache
}

export function setActiveSessionCode(codigo: string | null): void {
  activeCache = codigo
  try {
    if (codigo) storage()?.setItem(ACTIVE_KEY, codigo)
    else storage()?.removeItem(ACTIVE_KEY)
  } catch {
    // sem storage — memória basta
  }
  for (const l of listeners) l()
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

let snapCache: { sessions: SessionRec[]; active: string | null } | null = null

/** Snapshot estável (mesma referência até mudar) pro useSyncExternalStore. */
function snapshot(): { sessions: SessionRec[]; active: string | null } {
  const sessions = load()
  const active = getActiveSessionCode()
  if (!snapCache || snapCache.sessions !== sessions || snapCache.active !== active) {
    snapCache = { sessions, active }
  }
  return snapCache
}

export function useSessions(): { sessions: SessionRec[]; active: SessionRec | null } {
  const snap = useSyncExternalStore(subscribe, snapshot)
  return {
    sessions: snap.sessions,
    active: snap.active ? (getSession(snap.active) ?? null) : null,
  }
}

export function __resetSessionStoreForTests(): void {
  cache = null
  activeCache = undefined
  snapCache = null
  try {
    storage()?.removeItem(KEY)
    storage()?.removeItem(ACTIVE_KEY)
  } catch {
    /* noop */
  }
}
