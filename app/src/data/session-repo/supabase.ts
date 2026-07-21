// SupabaseSessionRepo — implementação REAL do contrato sobre o MESMO schema
// do pleitost-sync (supabase/install.sql aplicado verbatim no projeto do app;
// docs/arquitetura-servidor-sessao.md). Mapeamento row(snake_case) ⇄
// contrato(camelCase) espelha o transport/supabase-client.ts do plugin.
// Realtime: canal postgres_changes filtrado por session_id → onChange
// (consumidor re-busca; last-write-wins do claim model, RLS protege
// server-side). Auth: GitHub OAuth (redirect PKCE) + anônimo com nickname.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  type CharacterStateDelta,
  type CharacterSummaryDelta,
  type CharacterVisibility,
  type Encounter,
  type EncounterTurnState,
  type Session,
  type SessionCharacter,
  type SessionEvent,
  type SessionMember,
  type SessionRealtime,
  type SessionRepo,
  SessionEncounterAlreadyActiveError,
  SessionEncounterNotFoundError,
} from './contract'

type Row = Record<string, unknown>

const s = (v: unknown) => String(v ?? '')
const orNull = (v: unknown) => (v == null ? null : String(v))

function mapSession(r: Row): Session {
  return {
    id: s(r.id),
    code: s(r.code),
    gmUserId: s(r.gm_user_id),
    name: s(r.name),
    state: (r.state ?? {}) as Session['state'],
    createdAt: s(r.created_at),
    endedAt: orNull(r.ended_at),
  }
}
function mapMember(r: Row): SessionMember {
  return {
    sessionId: s(r.session_id),
    userId: s(r.user_id),
    role: r.role as SessionMember['role'],
    displayName: s(r.display_name),
    joinedAt: s(r.joined_at),
  }
}
function mapCharacter(r: Row): SessionCharacter {
  return {
    id: s(r.id),
    sessionId: s(r.session_id),
    memberId: s(r.member_id),
    kind: r.kind as SessionCharacter['kind'],
    tutorCharacterId: orNull(r.tutor_character_id),
    characterPath: s(r.character_path),
    visibility: r.visibility as CharacterVisibility,
    summary: (r.summary ?? {}) as SessionCharacter['summary'],
    state: (r.state ?? {}) as SessionCharacter['state'],
    fmBlob: (r.fm_blob ?? {}) as Record<string, unknown>,
    updatedAt: s(r.updated_at),
    encounterId: orNull(r.encounter_id),
    createdByEncounterId: orNull(r.created_by_encounter_id),
  }
}
function mapEncounter(r: Row): Encounter {
  return {
    id: s(r.id),
    sessionId: s(r.session_id),
    sourceNotePath: s(r.source_note_path),
    name: s(r.name),
    status: r.status as Encounter['status'],
    roster: (r.roster ?? { entries: [] }) as Encounter['roster'],
    difficulty: (r.difficulty ?? null) as Encounter['difficulty'],
    revealedCharacterIds: (r.revealed_character_ids ?? []) as string[],
    turnState: (r.turn_state ?? null) as Encounter['turnState'],
    createdAt: s(r.created_at),
    startedAt: orNull(r.started_at),
    archivedAt: orNull(r.archived_at),
  }
}

function fail(op: string, error: { message: string } | null): never {
  throw new Error(`[session-repo] ${op}: ${error?.message ?? 'erro desconhecido'}`)
}

export class SupabaseSessionRepo implements SessionRepo, SessionRealtime {
  constructor(private sb: SupabaseClient) {}

  /* ── realtime ── */
  subscribe(sessionId: string, onChange: () => void): () => void {
    const channel = this.sb
      .channel(`sess-${sessionId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'session_characters', filter: `session_id=eq.${sessionId}` },
        onChange,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'session_members', filter: `session_id=eq.${sessionId}` },
        onChange,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'session_encounters', filter: `session_id=eq.${sessionId}` },
        onChange,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` },
        onChange,
      )
      .subscribe()
    return () => void this.sb.removeChannel(channel)
  }

  /* ── presença (#294) ── */
  subscribePresence(
    sessionId: string,
    self: { userId: string; name: string },
    onPresence: (connectedUserIds: string[]) => void,
  ): () => void {
    // Canal de PRESENÇA à parte do de postgres_changes; a `key` = userId faz o
    // presenceState() vir indexado por usuário (várias abas do mesmo user
    // colapsam numa entrada). onPresence recebe os userIds conectados agora.
    const channel = this.sb.channel(`presence-${sessionId}`, {
      config: { presence: { key: self.userId } },
    })
    const emit = () => onPresence(Object.keys(channel.presenceState()))
    channel
      .on('presence', { event: 'sync' }, emit)
      .on('presence', { event: 'join' }, emit)
      .on('presence', { event: 'leave' }, emit)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void channel.track({ userId: self.userId, name: self.name })
      })
    return () => void this.sb.removeChannel(channel)
  }

  /* ── sessões ── */
  async createSession(input: { name: string; gmUserId: string; code: string }): Promise<Session> {
    const { data, error } = await this.sb
      .from('sessions')
      .insert({ name: input.name, gm_user_id: input.gmUserId, code: input.code.toUpperCase() })
      .select()
      .single()
    if (error) fail('createSession', error)
    return mapSession(data as Row)
  }
  async findSessionByCode(code: string): Promise<Session | null> {
    const { data, error } = await this.sb
      .from('sessions')
      .select()
      .eq('code', code.toUpperCase())
      .is('ended_at', null)
      .maybeSingle()
    if (error) fail('findSessionByCode', error)
    return data ? mapSession(data as Row) : null
  }
  async findSessionsByUser(userId: string): Promise<Session[]> {
    // #226: memberships do usuário → sessões ativas correspondentes
    const { data: mems, error: e1 } = await this.sb
      .from('session_members')
      .select('session_id')
      .eq('user_id', userId)
    if (e1) fail('findSessionsByUser', e1)
    const ids = [...new Set((mems ?? []).map((m) => (m as { session_id: string }).session_id))]
    if (!ids.length) return []
    const { data, error } = await this.sb
      .from('sessions')
      .select()
      .in('id', ids)
      .is('ended_at', null)
    if (error) fail('findSessionsByUser', error)
    return ((data ?? []) as Row[]).map(mapSession)
  }
  async updateSessionState(sessionId: string, patch: Partial<Session['state']>): Promise<void> {
    // merge por chave de topo (read-merge-write; last-write-wins)
    const atual = await this.findSessionById(sessionId)
    const state = { ...(atual?.state ?? {}), ...patch }
    const { error } = await this.sb.from('sessions').update({ state }).eq('id', sessionId)
    if (error) fail('updateSessionState', error)
  }
  async findSessionById(id: string): Promise<Session | null> {
    const { data, error } = await this.sb.from('sessions').select().eq('id', id).maybeSingle()
    if (error) fail('findSessionById', error)
    return data ? mapSession(data as Row) : null
  }
  async endSession(sessionId: string): Promise<void> {
    const { error } = await this.sb
      .from('sessions')
      .update({ ended_at: new Date().toISOString() })
      .eq('id', sessionId)
    if (error) fail('endSession', error)
  }
  async updateSessionName(sessionId: string, name: string): Promise<void> {
    const { error } = await this.sb.from('sessions').update({ name }).eq('id', sessionId)
    if (error) fail('updateSessionName', error)
  }

  /* ── members ── */
  async insertMember(input: {
    sessionId: string
    userId: string
    role: SessionMember['role']
    displayName: string
  }): Promise<SessionMember> {
    const { data, error } = await this.sb
      .from('session_members')
      .insert({
        session_id: input.sessionId,
        user_id: input.userId,
        role: input.role,
        display_name: input.displayName,
      })
      .select()
      .single()
    if (error) fail('insertMember', error)
    return mapMember(data as Row)
  }
  async findMember(sessionId: string, userId: string): Promise<SessionMember | null> {
    const { data, error } = await this.sb
      .from('session_members')
      .select()
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .maybeSingle()
    if (error) fail('findMember', error)
    return data ? mapMember(data as Row) : null
  }
  async updateMemberDisplayName(sessionId: string, userId: string, displayName: string): Promise<void> {
    const { error } = await this.sb
      .from('session_members')
      .update({ display_name: displayName })
      .eq('session_id', sessionId)
      .eq('user_id', userId)
    if (error) fail('updateMemberDisplayName', error)
  }
  async removeMember(sessionId: string, userId: string): Promise<void> {
    const { error } = await this.sb
      .from('session_members')
      .delete()
      .eq('session_id', sessionId)
      .eq('user_id', userId)
    if (error) fail('removeMember', error)
  }
  async listMembers(sessionId: string): Promise<SessionMember[]> {
    const { data, error } = await this.sb.from('session_members').select().eq('session_id', sessionId)
    if (error) fail('listMembers', error)
    return ((data ?? []) as Row[]).map(mapMember)
  }

  /* ── personagens ── */
  async insertCharacter(input: Parameters<SessionRepo['insertCharacter']>[0]): Promise<SessionCharacter> {
    const { data, error } = await this.sb
      .from('session_characters')
      .insert({
        session_id: input.sessionId,
        member_id: input.memberId,
        kind: input.kind,
        tutor_character_id: input.tutorCharacterId,
        character_path: input.characterPath,
        visibility: input.visibility,
        summary: input.summary,
        state: input.state,
        fm_blob: input.fmBlob ?? {},
        encounter_id: input.encounterId ?? null,
        created_by_encounter_id: input.createdByEncounterId ?? null,
      })
      .select()
      .single()
    if (error) fail('insertCharacter', error)
    return mapCharacter(data as Row)
  }
  /** Merge per top-level (semântica do plugin): lê o state atual e grava o
   *  merge — o dono é a fonte única (claim model), então não há corrida. */
  async updateCharacterState(characterId: string, delta: CharacterStateDelta): Promise<void> {
    const { data, error } = await this.sb
      .from('session_characters')
      .select('state')
      .eq('id', characterId)
      .single()
    if (error) fail('updateCharacterState(read)', error)
    const merged = { ...((data as Row).state as Row), ...delta }
    const { error: e2 } = await this.sb
      .from('session_characters')
      .update({ state: merged, updated_at: new Date().toISOString() })
      .eq('id', characterId)
    if (e2) fail('updateCharacterState', e2)
  }
  async updateCharacterSummary(characterId: string, delta: CharacterSummaryDelta): Promise<void> {
    const { data, error } = await this.sb
      .from('session_characters')
      .select('summary')
      .eq('id', characterId)
      .single()
    if (error) fail('updateCharacterSummary(read)', error)
    const merged = { ...((data as Row).summary as Row), ...delta }
    const { error: e2 } = await this.sb
      .from('session_characters')
      .update({ summary: merged, updated_at: new Date().toISOString() })
      .eq('id', characterId)
    if (e2) fail('updateCharacterSummary', e2)
  }
  async updateCharacterFmBlob(characterId: string, newBlob: Record<string, unknown>): Promise<void> {
    const { error } = await this.sb
      .from('session_characters')
      .update({ fm_blob: newBlob, updated_at: new Date().toISOString() })
      .eq('id', characterId)
    if (error) fail('updateCharacterFmBlob', error)
  }
  async removeCharacter(characterId: string): Promise<void> {
    const { error } = await this.sb.from('session_characters').delete().eq('id', characterId)
    if (error) fail('removeCharacter', error)
  }
  async setCharacterVisibility(characterId: string, visibility: CharacterVisibility): Promise<void> {
    const { error } = await this.sb
      .from('session_characters')
      .update({ visibility, updated_at: new Date().toISOString() })
      .eq('id', characterId)
    if (error) fail('setCharacterVisibility', error)
  }
  async findCharactersBySession(sessionId: string): Promise<SessionCharacter[]> {
    const { data, error } = await this.sb
      .from('session_characters')
      .select()
      .eq('session_id', sessionId)
    if (error) fail('findCharactersBySession', error)
    return ((data ?? []) as Row[]).map(mapCharacter)
  }
  async findHeroiByMember(sessionId: string, memberId: string): Promise<SessionCharacter | null> {
    const { data, error } = await this.sb
      .from('session_characters')
      .select()
      .eq('session_id', sessionId)
      .eq('member_id', memberId)
      .eq('kind', 'heroi')
      .maybeSingle()
    if (error) fail('findHeroiByMember', error)
    return data ? mapCharacter(data as Row) : null
  }

  /* ── eventos ── */
  async insertEvent(input: Parameters<SessionRepo['insertEvent']>[0]): Promise<SessionEvent> {
    const { data, error } = await this.sb
      .from('session_events')
      .insert({
        session_id: input.sessionId,
        type: input.type,
        source_member_id: input.sourceMemberId,
        target_character_id: input.targetCharacterId,
        payload: input.payload,
      })
      .select()
      .single()
    if (error) fail('insertEvent', error)
    const r = data as Row
    return {
      id: s(r.id),
      sessionId: s(r.session_id),
      type: s(r.type),
      sourceMemberId: s(r.source_member_id),
      targetCharacterId: orNull(r.target_character_id),
      payload: (r.payload ?? {}) as Record<string, unknown>,
      createdAt: s(r.created_at),
    }
  }

  /* ── encounters ── */
  async insertEncounter(input: Parameters<SessionRepo['insertEncounter']>[0]): Promise<Encounter> {
    const { data, error } = await this.sb
      .from('session_encounters')
      .insert({
        session_id: input.sessionId,
        source_note_path: input.sourceNotePath,
        name: input.name,
        status: 'prepared',
        roster: input.roster,
        difficulty: input.difficulty,
      })
      .select()
      .single()
    if (error) fail('insertEncounter', error)
    return mapEncounter(data as Row)
  }
  async listEncountersBySession(sessionId: string): Promise<Encounter[]> {
    const { data, error } = await this.sb
      .from('session_encounters')
      .select()
      .eq('session_id', sessionId)
    if (error) fail('listEncountersBySession', error)
    return ((data ?? []) as Row[]).map(mapEncounter)
  }
  async startEncounter(
    encounterId: string,
    createNpcInputs: ReadonlyArray<{
      memberId: string
      kind: SessionCharacter['kind']
      characterPath: string
      summary: SessionCharacter['summary']
      state: SessionCharacter['state']
    }> = [],
  ): Promise<void> {
    const enc = await this.findEncounter(encounterId)
    const ativos = await this.listEncountersBySession(enc.sessionId)
    if (ativos.some((e) => e.status === 'active')) {
      throw new SessionEncounterAlreadyActiveError(enc.sessionId)
    }
    const { error } = await this.sb
      .from('session_encounters')
      .update({ status: 'active', started_at: new Date().toISOString() })
      .eq('id', encounterId)
    if (error) fail('startEncounter', error)
    const { error: e2 } = await this.sb
      .from('session_characters')
      .update({ encounter_id: encounterId })
      .eq('session_id', enc.sessionId)
      .in('kind', ['heroi', 'companheiro'])
    if (e2) fail('startEncounter(move)', e2)
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
        encounterId,
        createdByEncounterId: encounterId,
      })
    }
  }
  async endEncounter(encounterId: string): Promise<void> {
    const enc = await this.findEncounter(encounterId)
    const { error } = await this.sb
      .from('session_encounters')
      .update({ status: 'archived', archived_at: new Date().toISOString() })
      .eq('id', encounterId)
    if (error) fail('endEncounter', error)
    // pré-existentes voltam pra Mesa; NPCs criados pelo combate ficam
    const { error: e2 } = await this.sb
      .from('session_characters')
      .update({ encounter_id: null })
      .eq('session_id', enc.sessionId)
      .eq('encounter_id', encounterId)
      .neq('created_by_encounter_id', encounterId)
    if (e2) fail('endEncounter(volta)', e2)
  }
  async toggleRevealCharacter(encounterId: string, characterId: string): Promise<string[]> {
    const enc = await this.findEncounter(encounterId)
    const ids = enc.revealedCharacterIds.includes(characterId)
      ? enc.revealedCharacterIds.filter((i) => i !== characterId)
      : [...enc.revealedCharacterIds, characterId]
    const { error } = await this.sb
      .from('session_encounters')
      .update({ revealed_character_ids: ids })
      .eq('id', encounterId)
    if (error) fail('toggleRevealCharacter', error)
    return ids
  }
  async updateEncounterTurnState(encounterId: string, turnState: EncounterTurnState | null): Promise<void> {
    const { error } = await this.sb
      .from('session_encounters')
      .update({ turn_state: turnState })
      .eq('id', encounterId)
    if (error) fail('updateEncounterTurnState', error)
  }
  private async findEncounter(id: string): Promise<Encounter> {
    const { data, error } = await this.sb.from('session_encounters').select().eq('id', id).maybeSingle()
    if (error) fail('findEncounter', error)
    if (!data) throw new SessionEncounterNotFoundError(id)
    return mapEncounter(data as Row)
  }
}

/* ── client + auth ─────────────────────────────────────────────────────── */

let client: SupabaseClient | null | undefined

/** Client singleton a partir do env (app/.env). null = servidor não configurado
 *  (app segue 100% local-first). */
export function supabaseClient(): SupabaseClient | null {
  if (client !== undefined) return client
  const env = (import.meta as unknown as { env?: Record<string, string> }).env ?? {}
  const url = env['VITE_SUPABASE_URL']
  const key = env['VITE_SUPABASE_ANON_KEY']
  client = url && key ? createClient(url, key) : null
  return client
}

export function supabaseSessionRepo(): SupabaseSessionRepo | null {
  const sb = supabaseClient()
  return sb ? new SupabaseSessionRepo(sb) : null
}

/** URL de retorno do OAuth (#208): origin + BASE do Vite — em GitHub Pages
 *  de projeto o app vive sob /pleitost-app/, e `origin` sozinho aterrissa
 *  num 404 fora do app. BASE_URL é '/' em dev/raiz (comportamento igual). */
export function oauthRedirectUrl(base: string = import.meta.env.BASE_URL): string {
  return window.location.origin + (base.endsWith('/') ? base : `${base}/`)
}

/** Login GitHub via OAuth redirect (PKCE) — requisito de auth do usuário;
 *  provider habilitado no painel do Supabase. */
export async function signInWithGitHub(): Promise<void> {
  const sb = supabaseClient()
  if (!sb) throw new Error('Supabase não configurado')
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'github',
    // N4: `public_repo` deixa o provider_token abrir a issue do report como o
    // próprio autor (github-issue.ts). Sem isso a criação da issue dá 403 e o
    // report cai no canal anônimo.
    options: { redirectTo: oauthRedirectUrl(), scopes: 'public_repo' },
  })
  if (error) throw error
}

