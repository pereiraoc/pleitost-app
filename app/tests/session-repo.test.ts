// Contract-tests do SessionRepo (F1 do plano-mestre #198): a MESMA bateria
// roda contra qualquer implementação do contrato. InMemory roda sempre (é o
// transporte dos testes/E2E); Supabase roda só com PLEITOST_SUPABASE_TEST=1
// (bate no projeto real — manual, fora do CI).
import { describe, expect, it } from 'vitest'
import type { SessionRepo, SessionRealtime, CharacterState, CharacterSummary } from '../src/data/session-repo/contract'
import { generateSessionCode } from '../src/data/session-repo/contract'
import { InMemorySessionRepo } from '../src/data/session-repo/in-memory'

const SUMMARY: CharacterSummary = {
  nome: 'Alda',
  family: 'Heroi',
  classe: 'Mago',
  nivel: 3,
  atributos: { FOR: 0, AGI: 1, INT: 3, PRE: 2 },
  vitalidadeMax: 14,
  moralMax: 20,
  stats: { defesa: 13, vigor: 12, evasao: 11, impeto: 10, movimento: 9, percepcao: 5, intuicao: 4 },
}
const STATE: CharacterState = {
  recursosRestantes: { vitalidade: 14, moral: 20, em: 3, moralTemp: 0 },
  condicoesAtivas: {},
  efeitosAtivos: {},
  invocacoesAtivas: {},
}

function contractSuite(name: string, make: () => SessionRepo & SessionRealtime) {
  describe(`contrato SessionRepo — ${name}`, () => {
    it('create/find por código; código encerrado some da busca', async () => {
      const repo = make()
      const sess = await repo.createSession({ name: 'Mesa', gmUserId: 'gm1', code: 'ABC234' })
      expect(sess.code).toBe('ABC234')
      expect((await repo.findSessionByCode('abc234'))?.id).toBe(sess.id)
      await repo.endSession(sess.id)
      expect(await repo.findSessionByCode('ABC234')).toBeNull()
      // por id ainda resolve (retomada/histórico)
      expect((await repo.findSessionById(sess.id))?.endedAt).toBeTruthy()
    })

    it('members: join idempotente via findMember; rename; leave', async () => {
      const repo = make()
      const sess = await repo.createSession({ name: 'Mesa', gmUserId: 'gm1', code: 'ABC235' })
      await repo.insertMember({ sessionId: sess.id, userId: 'p1', role: 'player', displayName: 'Octavio' })
      expect((await repo.findMember(sess.id, 'p1'))?.displayName).toBe('Octavio')
      await repo.updateMemberDisplayName(sess.id, 'p1', 'Octa')
      expect((await repo.findMember(sess.id, 'p1'))?.displayName).toBe('Octa')
      expect((await repo.listMembers(sess.id)).length).toBe(1)
      await repo.removeMember(sess.id, 'p1')
      expect(await repo.findMember(sess.id, 'p1')).toBeNull()
    })

    it('personagens: insert (claim=memberId) + state merge per top-level + fmBlob replace', async () => {
      const repo = make()
      const sess = await repo.createSession({ name: 'Mesa', gmUserId: 'gm1', code: 'ABC236' })
      const c = await repo.insertCharacter({
        sessionId: sess.id,
        memberId: 'p1',
        kind: 'heroi',
        tutorCharacterId: null,
        characterPath: 'local:Heroi:x',
        visibility: 'visible',
        summary: SUMMARY,
        state: STATE,
        fmBlob: { 'Nível': 3 },
      })
      expect(c.summary.nome).toBe('Alda')
      // merge per top-level: só recursosRestantes muda, condições ficam
      await repo.updateCharacterState(c.id, {
        recursosRestantes: { vitalidade: 9, moral: 20, em: 3, moralTemp: 0 },
      })
      const [after] = await repo.findCharactersBySession(sess.id)
      expect(after.state.recursosRestantes.vitalidade).toBe(9)
      expect(after.state.condicoesAtivas).toEqual({})
      await repo.updateCharacterSummary(c.id, { nivel: 4 })
      await repo.updateCharacterFmBlob(c.id, { 'Nível': 4 })
      const [after2] = await repo.findCharactersBySession(sess.id)
      expect(after2.summary.nivel).toBe(4)
      expect(after2.fmBlob['Nível']).toBe(4)
      expect((await repo.findHeroiByMember(sess.id, 'p1'))?.id).toBe(c.id)
    })

    it('encounters: prepared → active (move heróis, cria NPCs) → archived (volta pra Mesa)', async () => {
      const repo = make()
      const sess = await repo.createSession({ name: 'Mesa', gmUserId: 'gm1', code: 'ABC237' })
      const heroi = await repo.insertCharacter({
        sessionId: sess.id,
        memberId: 'p1',
        kind: 'heroi',
        tutorCharacterId: null,
        characterPath: 'local:Heroi:x',
        visibility: 'visible',
        summary: SUMMARY,
        state: STATE,
      })
      const enc = await repo.insertEncounter({
        sessionId: sess.id,
        sourceNotePath: 'Campanhas/Combates/Goblins',
        name: 'Emboscada Goblin',
        roster: { entries: [{ sourcePath: null, label: 'Goblin', qty: 2 }] },
        difficulty: null,
      })
      expect(enc.status).toBe('prepared')
      await repo.startEncounter(enc.id, [
        {
          memberId: 'gm1',
          kind: 'npc',
          characterPath: 'Sistema/Criaturas/Bestiário/Goblin',
          summary: { ...SUMMARY, nome: 'Goblin', family: 'Monstro' },
          state: STATE,
        },
      ])
      const chars = await repo.findCharactersBySession(sess.id)
      expect(chars.find((c) => c.id === heroi.id)?.encounterId).toBe(enc.id)
      const npc = chars.find((c) => c.kind === 'npc')!
      expect(npc.createdByEncounterId).toBe(enc.id)
      // reveal toggle
      const revealed = await repo.toggleRevealCharacter(enc.id, npc.id)
      expect(revealed).toContain(npc.id)
      // turn state
      await repo.updateEncounterTurnState(enc.id, {
        order: [heroi.id, npc.id],
        currentIndex: 0,
        round: 1,
        started: true,
      })
      const [enc2] = await repo.listEncountersBySession(sess.id)
      expect(enc2.turnState?.round).toBe(1)
      // encerrar: herói volta pra Mesa; NPC criado pelo combate fica arquivado nele
      await repo.endEncounter(enc.id)
      const chars2 = await repo.findCharactersBySession(sess.id)
      expect(chars2.find((c) => c.id === heroi.id)?.encounterId).toBeNull()
      expect(chars2.find((c) => c.id === npc.id)?.encounterId).toBe(enc.id)
    })

    it('realtime: mutações notificam assinantes da sessão; unsubscribe para', async () => {
      const repo = make()
      const sess = await repo.createSession({ name: 'Mesa', gmUserId: 'gm1', code: 'ABC238' })
      let pings = 0
      const off = repo.subscribe(sess.id, () => pings++)
      await repo.insertMember({ sessionId: sess.id, userId: 'p1', role: 'player', displayName: 'O' })
      expect(pings).toBeGreaterThan(0)
      const before = pings
      off()
      await repo.updateSessionName(sess.id, 'Outra')
      expect(pings).toBe(before)
    })
  })
}

contractSuite('InMemory', () => new InMemorySessionRepo())

describe('generateSessionCode', () => {
  it('6 chars do alfabeto sem ambíguos', () => {
    for (let i = 0; i < 30; i++) expect(generateSessionCode()).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/)
  })
})

// Supabase real: manual, fora do CI (PLEITOST_SUPABASE_TEST=1 + env do app).
// O realtime do Supabase é assíncrono — a bateria acima cobre o CRUD; o canal
// é validado no uso (Trilha S) e neste smoke condicional.
describe.skipIf(!process.env.PLEITOST_SUPABASE_TEST)('contrato SessionRepo — Supabase (manual)', () => {
  it('create/find/join no projeto real', async () => {
    const { createClient } = await import('@supabase/supabase-js')
    const { SupabaseSessionRepo } = await import('../src/data/session-repo/supabase')
    const url = process.env.VITE_SUPABASE_URL ?? 'https://dfrcrvzvnvdvhtzvyudp.supabase.co'
    const key = process.env.VITE_SUPABASE_ANON_KEY ?? ''
    const sb = createClient(url, key)
    await sb.auth.signInAnonymously()
    const repo = new SupabaseSessionRepo(sb)
    const uid = (await sb.auth.getUser()).data.user!.id
    const sess = await repo.createSession({ name: 'Teste CI', gmUserId: uid, code: generateSessionCode() })
    expect((await repo.findSessionByCode(sess.code))?.id).toBe(sess.id)
    await repo.endSession(sess.id)
  })
})

// ── publish: summary/state/fmBlob a partir do doc real ──────────────────
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCharacterState, buildCharacterSummary, extractFmBlob } from '../src/data/session-repo/publish'
import type { VaultDoc } from '../src/data/types'

describe('publish: snapshot do personagem pro session_characters', () => {
  const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
  const zuko = JSON.parse(
    fs.readFileSync(path.join(path.dirname(appDir), 'vault-data', 'Sistema/Criaturas/Heróis/Zuko.json'), 'utf8'),
  ) as VaultDoc

  it('summary do Zuko: família/nível/atributos/stats (evasao = Reflexo)', () => {
    const s = buildCharacterSummary(zuko)
    expect(s.nome).toBe('Zuko')
    expect(s.family).toBe('Heroi')
    expect(s.nivel).toBeGreaterThan(0)
    expect(s.vitalidadeMax).toBeGreaterThan(0)
    expect(s.stats.defesa).toBeGreaterThan(0)
    expect(s.stats.evasao).toBeGreaterThan(0)
  })

  it('state: volátil ausente = recursos cheios; fmBlob exclui Interativa/aliases', () => {
    const st = buildCharacterState(zuko)
    expect(st.recursosRestantes.vitalidade).toBeGreaterThan(0)
    const blob = extractFmBlob(zuko.frontmatter as Record<string, unknown>)
    expect(blob['Interativa']).toBeUndefined()
    expect(blob['aliases']).toBeUndefined()
    expect(blob['Atributos']).toBeTruthy()
  })
})
