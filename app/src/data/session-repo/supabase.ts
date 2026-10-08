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
  type GroupInventoryItem,
  type Session,
  type SessionCharacter,
  type SessionEvent,
  type SessionMember,
  type SessionRealtime,
  type SessionRepo,
  MuralBucketAusenteError,
  SessionEncounterAlreadyActiveError,
  SessionEncounterNotFoundError,
  muralJaTem,
  type MuralItem,
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

/** Bucket das imagens CIFRADAS do mural (supabase/storage-mural.sql). */
const MURAL_BUCKET = 'mural'

/** Storage: o bucket não existe no projeto (SQL do mural não aplicado). */
function bucketAusente(error: { message?: string; statusCode?: string | number; status?: number } | null): boolean {
  if (!error) return false
  return /bucket not found/i.test(error.message ?? '') || (String(error.statusCode ?? error.status ?? '') === '404' && /bucket/i.test(error.message ?? ''))
}

/** Caminho do objeto dentro do bucket a partir da URL pública
 *  (`…/storage/v1/object/public/mural/<sessionId>/<uuid>.jpg`). */
function caminhoNoMural(url: string): string | null {
  const marca = `/object/public/${MURAL_BUCKET}/`
  const i = url.indexOf(marca)
  return i < 0 ? null : decodeURIComponent(url.slice(i + marca.length).split('?')[0]!)
}

/** PostgREST: função inexistente no schema cache (PGRST202) — a RPC ainda não foi
 *  aplicada neste projeto. Qualquer outro erro é erro de verdade. */
function rpcAusente(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return error.code === 'PGRST202' || /could not find the function/i.test(error.message ?? '')
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
  async createSession(input: { name: string; gmUserId: string; code: string; state?: Partial<Session['state']> }): Promise<Session> {
    const { data, error } = await this.sb
      .from('sessions')
      .insert({ name: input.name, gm_user_id: input.gmUserId, code: input.code.toUpperCase(), state: input.state ?? {} })
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
  /** Patch do state da sessão (merge por chave de topo). Caminho preferido: a
   *  RPC session_state_patch (supabase/session-state-atomic.sql) — UM UPDATE
   *  `state || patch` no servidor, sem a corrida de lost update do
   *  read-merge-write (2026-10-04: o jogador andava na trilha via
   *  session_set_exploracao enquanto o mestre empurrava o mapa → a trilha
   *  voltava). Projeto sem a função (PGRST202) → caminho antigo.
   *  `undefined` = limpar a chave: no caminho antigo o JSON derrubava a chave do
   *  state inteiro; no `||` a chave ausente MANTERIA o valor velho — então vai
   *  como null (leitores tratam null como ausente). */
  async updateSessionState(sessionId: string, patch: Partial<Session['state']>): Promise<void> {
    if (this.rpcs.session_state_patch !== false) {
      const p_patch = Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v === undefined ? null : v]))
      const { data, error } = await this.sb.rpc('session_state_patch', { p_session_id: sessionId, p_patch })
      if (!error) {
        this.rpcs.session_state_patch = true
        if (data === false) fail('updateSessionState', { message: 'sem permissão pra editar esta sessão (ou sessão inexistente)' })
        return
      }
      if (!rpcAusente(error)) fail('updateSessionState(rpc)', error)
      this.rpcs.session_state_patch = false // função não instalada: read-merge-write daqui em diante
    }
    const atual = await this.findSessionById(sessionId)
    await this.gravarStateInteiro(sessionId, { ...(atual?.state ?? {}), ...patch }, 'updateSessionState')
  }
  /** Caminho ANTIGO (sem as RPCs atômicas): grava o state inteiro. */
  private async gravarStateInteiro(sessionId: string, state: Session['state'], op: string): Promise<void> {
    const { error } = await this.sb.from('sessions').update({ state }).eq('id', sessionId)
    if (error) fail(op, error)
  }
  /** Disponibilidade das RPCs atômicas do state da sessão: ausente = ainda não
   *  sabemos; true/false depois da 1ª chamada (false = PGRST202, não insiste). */
  private rpcs: Partial<
    Record<
      'session_state_patch' | 'session_mural_add' | 'session_mural_remove' | 'session_inventario_set' | 'session_inventario_tirar',
      boolean
    >
  > = {}
  /** Inventário do grupo, UM item (supabase/session-inventario-rpc.sql): membro
   *  ou mestre, atômico por chave. Sem a função (PGRST202) → relê o pool e grava
   *  pelo patch do state (que é gm-only — o caminho antigo, sem garantia). */
  async inventarioSet(sessionId: string, chave: string, item: GroupInventoryItem | null): Promise<void> {
    if (this.rpcs.session_inventario_set !== false) {
      const { error } = await this.sb.rpc('session_inventario_set', { p_session_id: sessionId, p_chave: chave, p_item: item })
      if (!error) {
        this.rpcs.session_inventario_set = true
        return
      }
      if (!rpcAusente(error)) fail('inventarioSet(rpc)', error)
      this.rpcs.session_inventario_set = false
    }
    const atual = await this.findSessionById(sessionId)
    const pool = { ...(atual?.state.inventarioGrupo ?? {}) }
    if (item) pool[chave] = item
    else delete pool[chave]
    await this.updateSessionState(sessionId, { inventarioGrupo: pool })
  }
  /** Tira VÁRIAS chaves do pool e devolve as que estavam lá (linha travada no
   *  servidor — dois aparelhos puxando a mesma chave: só um recebe). Sem a
   *  função (PGRST202) → read-modify-write pelo patch do state. */
  async inventarioTirar(sessionId: string, chaves: string[]): Promise<string[]> {
    if (!chaves.length) return []
    if (this.rpcs.session_inventario_tirar !== false) {
      const { data, error } = await this.sb.rpc('session_inventario_tirar', { p_session_id: sessionId, p_chaves: chaves })
      if (!error) {
        this.rpcs.session_inventario_tirar = true
        return Array.isArray(data) ? (data as string[]) : []
      }
      if (!rpcAusente(error)) fail('inventarioTirar(rpc)', error)
      this.rpcs.session_inventario_tirar = false
    }
    const atual = await this.findSessionById(sessionId)
    const pool = { ...(atual?.state.inventarioGrupo ?? {}) }
    const sairam = [...new Set(chaves)].filter((k) => k in pool)
    if (!sairam.length) return []
    for (const k of sairam) delete pool[k]
    await this.updateSessionState(sessionId, { inventarioGrupo: pool })
    return sairam
  }
  async muralAdd(sessionId: string, item: MuralItem): Promise<MuralItem[] | null> {
    if (this.rpcs.session_mural_add !== false) {
      const { data, error } = await this.sb.rpc('session_mural_add', { p_session_id: sessionId, p_item: item })
      if (!error) {
        this.rpcs.session_mural_add = true
        return (data ?? null) as MuralItem[] | null
      }
      if (!rpcAusente(error)) fail('muralAdd(rpc)', error)
      this.rpcs.session_mural_add = false
    }
    const atual = await this.findSessionById(sessionId)
    if (!atual) return null
    const mural = atual.state.mural ?? []
    if (muralJaTem(mural, item)) return mural
    const novo = [...mural, item]
    await this.gravarStateInteiro(sessionId, { ...atual.state, mural: novo }, 'muralAdd')
    return novo
  }
  async muralRemove(sessionId: string, id: string): Promise<MuralItem | null> {
    if (this.rpcs.session_mural_remove !== false) {
      const { data, error } = await this.sb.rpc('session_mural_remove', { p_session_id: sessionId, p_id: id })
      if (!error) {
        this.rpcs.session_mural_remove = true
        return (data ?? null) as MuralItem | null
      }
      if (!rpcAusente(error)) fail('muralRemove(rpc)', error)
      this.rpcs.session_mural_remove = false
    }
    const atual = await this.findSessionById(sessionId)
    const item = atual?.state.mural?.find((m) => m.id === id)
    if (!atual || !item) return null
    await this.gravarStateInteiro(sessionId, { ...atual.state, mural: atual.state.mural!.filter((m) => m.id !== id) }, 'muralRemove')
    return item
  }
  async uploadMuralImagem(sessionId: string, imagem: Blob): Promise<string> {
    const caminho = `${sessionId}/${crypto.randomUUID()}.jpg`
    const bucket = this.sb.storage.from(MURAL_BUCKET)
    const { error } = await bucket.upload(caminho, imagem, { contentType: imagem.type || 'image/jpeg', upsert: false })
    if (error) {
      if (bucketAusente(error)) throw new MuralBucketAusenteError()
      fail('uploadMuralImagem', error)
    }
    return bucket.getPublicUrl(caminho).data.publicUrl
  }
  async removerMuralImagem(url: string): Promise<void> {
    const caminho = caminhoNoMural(url)
    if (!caminho) return
    const { error } = await this.sb.storage.from(MURAL_BUCKET).remove([caminho])
    if (error && !bucketAusente(error)) fail('removerMuralImagem', error)
  }
  async setExploracao(sessionId: string, exploracao: Session['state']['exploracao']): Promise<void> {
    // RPC SECURITY DEFINER: QUALQUER membro (ou o mestre) edita SÓ a trilha,
    // contornando a RLS gm-only da sessão sem poder tocar o resto do state.
    const { error } = await this.sb.rpc('session_set_exploracao', {
      p_session_id: sessionId,
      p_exploracao: exploracao ?? null,
    })
    if (error) fail('setExploracao', error)
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
  /** Patch do state (merge por chave de topo). Caminho preferido: a RPC
   *  session_character_patch_state (supabase/session-character-patch-state.sql)
   *  — UM UPDATE atômico `state || delta` no servidor, sem a corrida de lost
   *  update do read-modify-write (2026-10-02: o mestre desligava uma condição e
   *  um write concorrente devolvia a chave) e com metade das idas ao servidor.
   *  Projeto sem a função ainda (PGRST202) → cai no caminho antigo. */
  async updateCharacterState(characterId: string, delta: CharacterStateDelta): Promise<void> {
    if (this.patchStateRpc !== false) {
      const { data, error } = await this.sb.rpc('session_character_patch_state', {
        p_character_id: characterId,
        p_delta: delta,
      })
      if (!error) {
        this.patchStateRpc = true
        if (data === false) fail('updateCharacterState', { message: 'sem permissão pra editar este personagem' })
        return
      }
      if (!rpcAusente(error)) fail('updateCharacterState(rpc)', error)
      this.patchStateRpc = false // função não instalada neste projeto: read-modify-write daqui em diante
    }
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
  /** null = ainda não sabemos se a RPC existe; true/false depois da 1ª chamada. */
  private patchStateRpc: boolean | null = null
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
    // Só identidade (escopo padrão do GitHub) — 2026-10-08: o `public_repo` da
    // issue direta pedia "ler e escrever todos os repositórios públicos".
    options: { redirectTo: oauthRedirectUrl() },
  })
  if (error) throw error
}

