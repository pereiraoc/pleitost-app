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
import { createStoreChannel } from './store-kit'
import { activeWorld, onWorldChange, type WorldId } from './world'

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
  /** ISO da última vez que o usuário DESCONECTOU desta sessão (feedback do
   *  mestre) — mostrado como "Última Conexão" na lista. */
  ultimaConexao?: string
  /** MUNDO da sessão (#519 C4): ausente = fantasia (legado). A listagem
   *  filtra pelo mundo ativo. */
  world?: WorldId
}

const KEY = 'pleitost.sessoes'
const ACTIVE_KEY = 'pleitost.sessaoAtiva'

function storage(): Storage | null {
  return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null
}

/** Marcador de DELEÇÃO no blob de sessoes (report #449: apagar uma mesa não
 *  propagava — a união do sync ressuscitava do outro device). Ao deletar, o
 *  código vira um tombstone `{codigo, __deleted__: ISO}` persistido junto (a
 *  hidratação o esconde da lista; o merge de coleção respeita e a deleção sobe).
 *  Podado após 90 dias. */
interface SessionTombstone {
  codigo: string
  __deleted__: string
}
const TOMB_TTL_MS = 90 * 24 * 60 * 60 * 1000

let cache: SessionRec[] | null = null
let tombCache: SessionTombstone[] | null = null
let activeCache: string | null | undefined
const channel = createStoreChannel()

function isTombstone(x: unknown): x is SessionTombstone {
  return (
    !!x &&
    typeof x === 'object' &&
    typeof (x as Record<string, unknown>)['__deleted__'] === 'string' &&
    typeof (x as Record<string, unknown>)['codigo'] === 'string'
  )
}

function hydrate(): void {
  if (cache && tombCache) return
  let arr: unknown[] = []
  try {
    const raw = storage()?.getItem(KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    arr = Array.isArray(parsed) ? parsed : []
  } catch {
    arr = []
  }
  const live: SessionRec[] = []
  const tombs: SessionTombstone[] = []
  for (const it of arr) {
    if (isTombstone(it)) tombs.push(it)
    else if (it && typeof it === 'object') live.push(it as SessionRec)
  }
  cache = live
  tombCache = tombs
}

/** Tombstones podados (os velhos já propagaram pra todo device) — não crescem. */
function livingTombs(): SessionTombstone[] {
  hydrate()
  const cutoff = Date.now() - TOMB_TTL_MS
  return tombCache!.filter((t) => {
    const at = Date.parse(t.__deleted__)
    return !Number.isFinite(at) || at >= cutoff
  })
}

function load(): SessionRec[] {
  hydrate()
  return cache!
}

/** Grava a lista VIVA preservando os tombstones (podados) no blob. */
function persist(next: SessionRec[]): void {
  const tombs = livingTombs()
  cache = next
  tombCache = tombs
  try {
    storage()?.setItem(KEY, JSON.stringify([...next, ...tombs]))
  } catch {
    // storage indisponível (private mode) — segue só em memória
  }
  channel.emit()
}

/** Sessões do MUNDO ativo (#519 C4: mesa de um mundo não aparece no outro;
 *  sem campo = fantasia/legado). */
export function listSessions(): SessionRec[] {
  const mundo = activeWorld()
  return load().filter((s) => (s.world ?? 'fantasia') === mundo)
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
    world: activeWorld(),
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
  const live = load().filter((s) => s.codigo !== codigo)
  // tombstone da deleção (substitui marcador antigo do mesmo código) — a
  // remoção propaga pelo sync e a mesa não ressuscita pela união (#449).
  const tombs = [
    ...livingTombs().filter((t) => t.codigo !== codigo),
    { codigo, __deleted__: new Date().toISOString() },
  ]
  cache = live
  tombCache = tombs
  try {
    storage()?.setItem(KEY, JSON.stringify([...live, ...tombs]))
  } catch {
    /* memória basta */
  }
  if (getActiveSessionCode() === codigo) setActiveSessionCode(null)
  channel.emit()
}

export function updateSession(codigo: string, patch: Partial<SessionRec>): void {
  persist(load().map((s) => (s.codigo === codigo ? { ...s, ...patch } : s)))
}

/** Lê o código da mesa ativa tolerando os DOIS formatos: o blob CARIMBADO
 *  {codigo, updatedAt} (novo — newer-wins entre aparelhos) e a string CRUA
 *  legada (pré-fix). Código nulo/vazio → null (sem mesa ativa). */
function parseActiveCode(raw: string | null): string | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as unknown
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const c = (v as { codigo?: unknown }).codigo
      return typeof c === 'string' && c ? c : null
    }
  } catch {
    /* string crua legada (código direto) */
  }
  return raw
}

export function getActiveSessionCode(): string | null {
  if (activeCache !== undefined) return activeCache
  activeCache = parseActiveCode(storage()?.getItem(ACTIVE_KEY) ?? null)
  return activeCache
}

export function setActiveSessionCode(codigo: string | null): void {
  activeCache = codigo
  try {
    // Blob CARIMBADO (inclui o "sem mesa", codigo:null): a escolha de mesa ativa
    // mais recente propaga entre aparelhos (newer-wins no sync). Antes era string
    // crua com fill-only-missing → o ponteiro ficava preso ao valor velho do
    // device (report: celular travado numa mesa de teste).
    storage()?.setItem(ACTIVE_KEY, JSON.stringify({ codigo, updatedAt: new Date().toISOString() }))
  } catch {
    // sem storage — memória basta
  }
  channel.emit()
}

const subscribe = channel.subscribe

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
  tombCache = null
  activeCache = undefined
  snapCache = null
  try {
    storage()?.removeItem(KEY)
    storage()?.removeItem(ACTIVE_KEY)
  } catch {
    /* noop */
  }
}

// Trocar de MUNDO desconecta a sessão ativa naturalmente (#519 C4 — pedido
// explícito): a mesa pertence ao mundo em que foi criada.
onWorldChange(() => {
  if (getActiveSessionCode() !== null) setActiveSessionCode(null)
})
