// InMemorySessionRepo — fake COMPLETO do contrato (mesmo papel do
// tests/helpers/in-memory-session-repo.ts do pleitost-sync): implementa
// SessionRepo + SessionRealtime em memória, com notificação síncrona a cada
// mutação. É o transporte dos testes (unit/jsdom/E2E multi-cliente com dois
// "clientes" compartilhando a MESMA instância) — nenhum teste toca o Supabase.
import {
  SessionCodeCollisionError,
  SessionEncounterAlreadyActiveError,
  SessionEncounterNotFoundError,
  type CharacterKind,
  type CharacterState,
  type CharacterStateDelta,
  type CharacterSummary,
  type CharacterSummaryDelta,
  type CharacterVisibility,
  type Encounter,
  type EncounterRoster,
  type EncounterTurnState,
  type Session,
  type SessionCharacter,
  type SessionEvent,
  type SessionMember,
  type SessionRealtime,
  type SessionRepo,
  type SessionRole,
  type SyncEncounterDifficulty,
} from './contract'

let seq = 0
const nextId = (prefix: string) => `${prefix}_${++seq}`
const now = () => new Date().toISOString()

export class InMemorySessionRepo implements SessionRepo, SessionRealtime {
  sessions = new Map<string, Session>()
  members: SessionMember[] = []
  characters = new Map<string, SessionCharacter>()
  events: SessionEvent[] = []
  encounters = new Map<string, Encounter>()
  private listeners = new Map<string, Set<() => void>>()

  /* ── realtime ── */
  subscribe(sessionId: string, onChange: () => void): () => void {
    let set = this.listeners.get(sessionId)
    if (!set) this.listeners.set(sessionId, (set = new Set()))
    set.add(onChange)
    return () => set!.delete(onChange)
  }
  private notify(sessionId: string) {
    for (const cb of this.listeners.get(sessionId) ?? []) cb()
  }

  /* ── sessões ── */
  async createSession(input: { name: string; gmUserId: string; code: string }): Promise<Session> {
    for (const s of this.sessions.values()) {
      if (s.code === input.code) throw new SessionCodeCollisionError(input.code)
    }
    const sess: Session = {
      id: nextId('sess'),
      code: input.code.toUpperCase(),
      gmUserId: input.gmUserId,
      name: input.name,
      state: {},
      createdAt: now(),
      endedAt: null,
    }
    this.sessions.set(sess.id, sess)
    return sess
  }
  async findSessionByCode(code: string): Promise<Session | null> {
    const up = code.toUpperCase()
    return [...this.sessions.values()].find((s) => s.code === up && !s.endedAt) ?? null
  }
  async findSessionById(id: string): Promise<Session | null> {
    return this.sessions.get(id) ?? null
  }
  async endSession(sessionId: string): Promise<void> {
    const s = this.sessions.get(sessionId)
    if (s) {
      s.endedAt = now()
      this.notify(sessionId)
    }
  }
  async updateSessionName(sessionId: string, name: string): Promise<void> {
    const s = this.sessions.get(sessionId)
    if (s) {
      s.name = name
      this.notify(sessionId)
    }
  }

  /* ── members ── */
  async insertMember(input: {
    sessionId: string
    userId: string
    role: SessionRole
    displayName: string
  }): Promise<SessionMember> {
    const m: SessionMember = { ...input, joinedAt: now() }
    this.members.push(m)
    this.notify(input.sessionId)
    return m
  }
  async findMember(sessionId: string, userId: string): Promise<SessionMember | null> {
    return this.members.find((m) => m.sessionId === sessionId && m.userId === userId) ?? null
  }
  async updateMemberDisplayName(sessionId: string, userId: string, displayName: string): Promise<void> {
    const m = await this.findMember(sessionId, userId)
    if (m) {
      m.displayName = displayName
      this.notify(sessionId)
    }
  }
  async removeMember(sessionId: string, userId: string): Promise<void> {
    this.members = this.members.filter((m) => !(m.sessionId === sessionId && m.userId === userId))
    this.notify(sessionId)
  }
  async listMembers(sessionId: string): Promise<SessionMember[]> {
    return this.members.filter((m) => m.sessionId === sessionId)
  }

  /* ── personagens ── */
  async insertCharacter(
    input: Parameters<SessionRepo['insertCharacter']>[0],
  ): Promise<SessionCharacter> {
    const c: SessionCharacter = {
      id: nextId('char'),
      sessionId: input.sessionId,
      memberId: input.memberId,
      kind: input.kind,
      tutorCharacterId: input.tutorCharacterId,
      characterPath: input.characterPath,
      visibility: input.visibility,
      summary: structuredClone(input.summary),
      state: structuredClone(input.state),
      fmBlob: structuredClone(input.fmBlob ?? {}),
      updatedAt: now(),
      encounterId: input.encounterId ?? null,
      createdByEncounterId: input.createdByEncounterId ?? null,
    }
    this.characters.set(c.id, c)
    this.notify(c.sessionId)
    return c
  }
  private char(id: string): SessionCharacter | undefined {
    return this.characters.get(id)
  }
  async updateCharacterState(characterId: string, delta: CharacterStateDelta): Promise<void> {
    const c = this.char(characterId)
    if (!c) return
    // merge per top-level (semântica do servidor — transport.md)
    c.state = { ...c.state, ...structuredClone(delta) } as CharacterState
    c.updatedAt = now()
    this.notify(c.sessionId)
  }
  async updateCharacterSummary(characterId: string, delta: CharacterSummaryDelta): Promise<void> {
    const c = this.char(characterId)
    if (!c) return
    c.summary = { ...c.summary, ...structuredClone(delta) } as CharacterSummary
    c.updatedAt = now()
    this.notify(c.sessionId)
  }
  async updateCharacterFmBlob(characterId: string, newBlob: Record<string, unknown>): Promise<void> {
    const c = this.char(characterId)
    if (!c) return
    c.fmBlob = structuredClone(newBlob)
    c.updatedAt = now()
    this.notify(c.sessionId)
  }
  async removeCharacter(characterId: string): Promise<void> {
    const c = this.char(characterId)
    if (c) {
      this.characters.delete(characterId)
      this.notify(c.sessionId)
    }
  }
  async setCharacterVisibility(characterId: string, visibility: CharacterVisibility): Promise<void> {
    const c = this.char(characterId)
    if (c) {
      c.visibility = visibility
      c.updatedAt = now()
      this.notify(c.sessionId)
    }
  }
  async findCharactersBySession(sessionId: string): Promise<SessionCharacter[]> {
    return [...this.characters.values()].filter((c) => c.sessionId === sessionId)
  }
  async findHeroiByMember(sessionId: string, memberId: string): Promise<SessionCharacter | null> {
    return (
      [...this.characters.values()].find(
        (c) => c.sessionId === sessionId && c.memberId === memberId && c.kind === 'heroi',
      ) ?? null
    )
  }

  /* ── eventos ── */
  async insertEvent(input: Parameters<SessionRepo['insertEvent']>[0]): Promise<SessionEvent> {
    const e: SessionEvent = { id: nextId('evt'), createdAt: now(), ...input }
    this.events.push(e)
    this.notify(input.sessionId)
    return e
  }

  /* ── encounters (F7b) ── */
  async insertEncounter(input: {
    sessionId: string
    sourceNotePath: string
    name: string
    roster: EncounterRoster
    difficulty: SyncEncounterDifficulty | null
  }): Promise<Encounter> {
    const e: Encounter = {
      id: nextId('enc'),
      sessionId: input.sessionId,
      sourceNotePath: input.sourceNotePath,
      name: input.name,
      status: 'prepared',
      roster: structuredClone(input.roster),
      difficulty: input.difficulty ? structuredClone(input.difficulty) : null,
      revealedCharacterIds: [],
      turnState: null,
      createdAt: now(),
      startedAt: null,
      archivedAt: null,
    }
    this.encounters.set(e.id, e)
    this.notify(e.sessionId)
    return e
  }
  async listEncountersBySession(sessionId: string): Promise<Encounter[]> {
    return [...this.encounters.values()].filter((e) => e.sessionId === sessionId)
  }
  async startEncounter(
    encounterId: string,
    createNpcInputs: ReadonlyArray<{
      memberId: string
      kind: CharacterKind
      characterPath: string
      summary: CharacterSummary
      state: CharacterState
    }> = [],
  ): Promise<void> {
    const enc = this.encounters.get(encounterId)
    if (!enc) throw new SessionEncounterNotFoundError(encounterId)
    const active = [...this.encounters.values()].find(
      (e) => e.sessionId === enc.sessionId && e.status === 'active',
    )
    if (active) throw new SessionEncounterAlreadyActiveError(enc.sessionId)
    enc.status = 'active'
    enc.startedAt = now()
    // herói+companheiro entram no combate; NPCs do roster são criados
    for (const c of this.characters.values()) {
      if (c.sessionId === enc.sessionId && (c.kind === 'heroi' || c.kind === 'companheiro')) {
        c.encounterId = enc.id
      }
    }
    for (const npc of createNpcInputs) {
      await this.insertCharacter({
        sessionId: enc.sessionId,
        memberId: npc.memberId,
        kind: npc.kind,
        tutorCharacterId: null,
        characterPath: npc.characterPath,
        visibility: 'visible',
        summary: npc.summary,
        state: npc.state,
        encounterId: enc.id,
        createdByEncounterId: enc.id,
      })
    }
    this.notify(enc.sessionId)
  }
  async endEncounter(encounterId: string): Promise<void> {
    const enc = this.encounters.get(encounterId)
    if (!enc) throw new SessionEncounterNotFoundError(encounterId)
    enc.status = 'archived'
    enc.archivedAt = now()
    for (const c of this.characters.values()) {
      if (c.sessionId !== enc.sessionId || c.encounterId !== enc.id) continue
      // pré-existentes voltam pra Mesa; NPCs criados PELO combate arquivam junto
      if (c.createdByEncounterId !== enc.id) c.encounterId = null
    }
    this.notify(enc.sessionId)
  }
  async toggleRevealCharacter(encounterId: string, characterId: string): Promise<string[]> {
    const enc = this.encounters.get(encounterId)
    if (!enc) throw new SessionEncounterNotFoundError(encounterId)
    const i = enc.revealedCharacterIds.indexOf(characterId)
    if (i >= 0) enc.revealedCharacterIds.splice(i, 1)
    else enc.revealedCharacterIds.push(characterId)
    this.notify(enc.sessionId)
    return [...enc.revealedCharacterIds]
  }
  async updateEncounterTurnState(
    encounterId: string,
    turnState: EncounterTurnState | null,
  ): Promise<void> {
    const enc = this.encounters.get(encounterId)
    if (!enc) throw new SessionEncounterNotFoundError(encounterId)
    enc.turnState = turnState ? structuredClone(turnState) : null
    this.notify(enc.sessionId)
  }
}
