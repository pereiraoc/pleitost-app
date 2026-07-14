// CONTRATO SessionRepo — CÓPIA FIEL do pleitost-sync (fonte de verdade:
// .obsidian/plugins/pleitost-sync/src/core/{session,snapshot,diff,encounter}.ts,
// leitura apenas — o plugin nunca é tocado). O app PWA é o SEGUNDO CLIENTE do
// MESMO backend Supabase (docs/arquitetura-servidor-sessao.md): manter estes
// tipos idênticos garante mesa MISTA (Obsidian + app) e schema compartilhado.
// Diferenças conscientes: tipos de snapshot/diff/encounter INLINADOS (o app
// não importa módulos do plugin) e `EncounterDifficultyResult` reduzido ao
// shape persistido (jsonb livre).

/* ── snapshot.ts ─────────────────────────────────────────────────────── */

export type CharacterFamily = 'Heroi' | 'CompanheiroAnimal' | 'Monstro'

export interface CharacterStats {
  defesa: number
  vigor: number
  evasao: number
  impeto: number
  movimento: number
  percepcao: number
  intuicao: number
}

export interface CharacterSummary {
  nome: string
  family: CharacterFamily
  classe?: string
  sintonia?: string
  raca?: string
  nivel: number
  atributos: { FOR: number; AGI: number; INT: number; PRE: number }
  vitalidadeMax: number
  moralMax?: number
  imagem?: string
  /** Wikilink raw do tutor (ex: "[[Mera]]"). Só CompanheiroAnimal. */
  tutorRef?: string
  stats: CharacterStats
}

export interface CharacterState {
  recursosRestantes: {
    vitalidade: number
    moral: number
    em: number
    moralTemp: number
  }
  condicoesAtivas: Record<string, unknown>
  efeitosAtivos: Record<string, unknown>
  invocacoesAtivas: Record<string, unknown>
  slotsUsados?: Record<string, number>
}

export type CharacterFmBlob = Record<string, unknown>

/* ── diff.ts ─────────────────────────────────────────────────────────── */

export type CharacterStateDelta = Partial<CharacterState>
export type CharacterSummaryDelta = Partial<CharacterSummary>

/* ── encounter.ts ────────────────────────────────────────────────────── */

export type EncounterStatus = 'prepared' | 'active' | 'archived'

export interface EncounterRosterEntry {
  sourcePath: string | null
  label: string
  qty: number
}

export interface EncounterRoster {
  entries: EncounterRosterEntry[]
}

export interface EncounterTurnState {
  order: string[]
  currentIndex: number
  round: number
  started: boolean
}

/** Difficulty persistida (jsonb) — no plugin estende EncounterDifficultyResult
 *  do autosheet; aqui o shape é aberto + o snapshot de heróis. */
export interface SyncEncounterDifficulty extends Record<string, unknown> {
  heroSnapshot?: ReadonlyArray<{ nome: string; nivel: number }>
}

export interface Encounter {
  id: string
  sessionId: string
  sourceNotePath: string
  name: string
  status: EncounterStatus
  roster: EncounterRoster
  difficulty: SyncEncounterDifficulty | null
  revealedCharacterIds: string[]
  turnState: EncounterTurnState | null
  createdAt: string
  startedAt: string | null
  archivedAt: string | null
}

/* ── session.ts ──────────────────────────────────────────────────────── */

export type SessionRole = 'gm' | 'player'

export interface SessionState {
  turn?: { order: string[]; current: string }
  /** Extensão do APP (#235): imagem da ficha do grupo da mesa (data-url
   *  comprimida) — qualquer integrante pode trocar; merge por chave. */
  grupoImagem?: string
}

export interface Session {
  id: string
  code: string
  gmUserId: string
  name: string
  state: SessionState
  createdAt: string
  endedAt: string | null
}

/** A conta dona da sessão (`gmUserId`) é sempre GM; qualquer outra é player.
 *  Nunca derivar de role persistido (pode estar stale). */
export function deriveSessionRole(session: Session, userId: string): SessionRole {
  return session.gmUserId === userId ? 'gm' : 'player'
}

export interface SessionMember {
  sessionId: string
  userId: string
  role: SessionRole
  displayName: string
  joinedAt: string
}

export class SessionCodeCollisionError extends Error {
  constructor(public code: string) {
    super(`Session code collision: ${code}`)
    this.name = 'SessionCodeCollisionError'
  }
}
export class SessionNotFoundError extends Error {
  constructor(public code: string) {
    super(`Session not found: ${code}`)
    this.name = 'SessionNotFoundError'
  }
}
export class SessionEndedError extends Error {
  constructor(public code: string) {
    super(`Session already ended: ${code}`)
    this.name = 'SessionEndedError'
  }
}
export class InvalidDisplayNameError extends Error {
  constructor() {
    super('displayName is required (não pode ficar vazio)')
    this.name = 'InvalidDisplayNameError'
  }
}
export class InvalidSessionCodeError extends Error {
  constructor(public input: string) {
    super(`Invalid session code: "${input}"`)
    this.name = 'InvalidSessionCodeError'
  }
}
export class SessionEncounterAlreadyActiveError extends Error {
  constructor(public sessionId: string) {
    super(`Session already has an active encounter: ${sessionId}`)
    this.name = 'SessionEncounterAlreadyActiveError'
  }
}
export class SessionEncounterNotFoundError extends Error {
  constructor(public encounterId: string) {
    super(`Encounter not found: ${encounterId}`)
    this.name = 'SessionEncounterNotFoundError'
  }
}

export type CharacterKind = 'heroi' | 'companheiro' | 'npc'
export type CharacterVisibility = 'visible' | 'hidden'

export interface SessionCharacter {
  id: string
  sessionId: string
  memberId: string
  kind: CharacterKind
  tutorCharacterId: string | null
  characterPath: string
  visibility: CharacterVisibility
  summary: CharacterSummary
  state: CharacterState
  /** FM completo (menos sync-managed/local-only) — `{}` quando nunca publicou. */
  fmBlob: Record<string, unknown>
  updatedAt: string
  /** Combate ativo em que está; null = na Mesa. */
  encounterId?: string | null
  /** Combate que CRIOU este personagem (NPC de combate); arquiva junto. */
  createdByEncounterId?: string | null
}

export interface SessionEvent {
  id: string
  sessionId: string
  type: string
  sourceMemberId: string
  targetCharacterId: string | null
  payload: Record<string, unknown>
  createdAt: string
}

/** Interface implementada pelo transporte. Quem consome NUNCA conhece
 *  Supabase — testes usam o InMemorySessionRepo. */
export interface SessionRepo {
  createSession(input: { name: string; gmUserId: string; code: string }): Promise<Session>
  findSessionByCode(code: string): Promise<Session | null>
  /** Extensão do APP (#226, além do contrato do pleitost-sync): sessões
   *  ATIVAS em que o usuário é membro — alimenta a lista multi-dispositivo. */
  findSessionsByUser(userId: string): Promise<Session[]>
  /** Extensão do APP (#235): patch do state da sessão (merge por chave de
   *  topo, last-write-wins — mesmo modelo do state de personagem). */
  updateSessionState(sessionId: string, patch: Partial<SessionState>): Promise<void>
  findSessionById(id: string): Promise<Session | null>

  insertMember(input: {
    sessionId: string
    userId: string
    role: SessionRole
    displayName: string
  }): Promise<SessionMember>
  /** Idempotent join: retorna o member se já existir, null caso contrário. */
  findMember(sessionId: string, userId: string): Promise<SessionMember | null>
  updateMemberDisplayName(sessionId: string, userId: string, displayName: string): Promise<void>
  removeMember(sessionId: string, userId: string): Promise<void>
  listMembers(sessionId: string): Promise<SessionMember[]>

  endSession(sessionId: string): Promise<void>
  updateSessionName(sessionId: string, name: string): Promise<void>

  insertCharacter(input: {
    sessionId: string
    memberId: string
    kind: CharacterKind
    tutorCharacterId: string | null
    characterPath: string
    visibility: CharacterVisibility
    summary: CharacterSummary
    state: CharacterState
    fmBlob?: Record<string, unknown>
    encounterId?: string | null
    createdByEncounterId?: string | null
  }): Promise<SessionCharacter>
  updateCharacterState(characterId: string, delta: CharacterStateDelta): Promise<void>
  updateCharacterSummary(characterId: string, delta: CharacterSummaryDelta): Promise<void>
  /** REPLACE total do fm_blob (sem merge no servidor). */
  updateCharacterFmBlob(characterId: string, newBlob: Record<string, unknown>): Promise<void>
  removeCharacter(characterId: string): Promise<void>
  setCharacterVisibility(characterId: string, visibility: CharacterVisibility): Promise<void>
  findCharactersBySession(sessionId: string): Promise<SessionCharacter[]>
  findHeroiByMember(sessionId: string, memberId: string): Promise<SessionCharacter | null>

  insertEvent(input: {
    sessionId: string
    type: string
    sourceMemberId: string
    targetCharacterId: string | null
    payload: Record<string, unknown>
  }): Promise<SessionEvent>

  insertEncounter(input: {
    sessionId: string
    sourceNotePath: string
    name: string
    roster: EncounterRoster
    difficulty: SyncEncounterDifficulty | null
  }): Promise<Encounter>
  listEncountersBySession(sessionId: string): Promise<Encounter[]>
  startEncounter(
    encounterId: string,
    createNpcInputs?: ReadonlyArray<{
      memberId: string
      kind: CharacterKind
      characterPath: string
      summary: CharacterSummary
      state: CharacterState
    }>,
  ): Promise<void>
  endEncounter(encounterId: string): Promise<void>
  toggleRevealCharacter(encounterId: string, characterId: string): Promise<string[]>
  updateEncounterTurnState(
    encounterId: string,
    turnState: EncounterTurnState | null,
    requestId?: string,
  ): Promise<void>
}

/** Callbacks de realtime da sala — o transporte notifica mudanças; o
 *  consumidor re-busca ou aplica. */
export interface SessionRealtime {
  /** Assina mudanças da sessão (members/characters/encounters). Retorna
   *  unsubscribe. */
  subscribe(sessionId: string, onChange: () => void): () => void
}

/** Código de sessão — 6 chars A-Z0-9 (mesmo formato do plugin). */
export function generateSessionCode(rng: () => number = Math.random): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < 6; i++) out += chars[Math.floor(rng() * chars.length)]
  return out
}
