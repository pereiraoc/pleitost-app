// @vitest-environment jsdom
// Report #403 ("Quando adiciona um personagem em uma sessão com combate em
// andamento, ele não aparece até parar o combate e apertar f5"): o roster do
// combate renderiza SÓ o turnState.order (snapshot do início — heróis movidos
// pelo startEncounter + NPCs inseridos), e o publicar() de um jogador entrando
// no meio não toca o order — nem PODERIA: a RLS de session_encounters só deixa
// o GM escrever. Fix: o cliente do GM RECONCILIA — herói/companheiro publicado
// que não está no order do combate ativo é apendado ao FIM (mesmo padrão do
// addMonsterToInitiative), com re-leitura fresca antes do write pra não
// duplicar com um live stale.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { SessionRepoProvider } from '../src/data/session-repo/provider'
import { InMemorySessionRepo } from '../src/data/session-repo/in-memory'
import { setLiveSession } from '../src/data/session-repo/live-session'
import type { LiveSession } from '../src/data/session-repo/live-session'
import { reconcileHeroesIntoActiveEncounter } from '../src/data/session-repo/encounter-actions'
import { LiveSessionBridge } from '../src/components/sessao/SessaoPage'
import {
  __resetSessionStoreForTests,
  createSession as createLocalSession,
  setActiveSessionCode,
  updateSession,
} from '../src/data/session-store'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

function makeStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    key: (i: number) => [...data.keys()][i] ?? null,
    removeItem: (k: string) => void data.delete(k),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
  }
}

beforeAll(() => {
  if (!window.localStorage) {
    Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true })
  }
  globalThis.fetch = (async (input: unknown) => {
    const rel = decodeURIComponent(String(input).replace(/^\/vault-data\//, ''))
    const file = path.join(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) }
  }) as typeof fetch
})
beforeEach(() => {
  window.localStorage.clear()
  __resetSessionStoreForTests()
  setLiveSession(null)
})
afterEach(() => {
  cleanup()
  setLiveSession(null)
})

const SUMMARY = { nome: 'X' } as never
const STATE = {} as never

async function insertHeroi(repo: InMemorySessionRepo, sessionId: string, memberId: string) {
  return repo.insertCharacter({
    sessionId,
    memberId,
    kind: 'heroi',
    tutorCharacterId: null,
    characterPath: `local:Heroi:${memberId}`,
    visibility: 'visible',
    summary: SUMMARY,
    state: STATE,
  })
}

/** Sessão com combate ATIVO: 1 herói pré-existente no order, started=true. */
async function mesaEmCombate(repo: InMemorySessionRepo) {
  const sess = await repo.createSession({ name: 'Mesa', gmUserId: 'gm', code: 'C403' })
  const h1 = await insertHeroi(repo, sess.id, 'p1')
  const enc = await repo.insertEncounter({
    sessionId: sess.id,
    sourceNotePath: '',
    name: 'Emboscada',
    roster: { entries: [] },
    difficulty: null,
  })
  await repo.startEncounter(enc.id, [])
  await repo.updateEncounterTurnState(enc.id, {
    order: [h1.id],
    currentIndex: 0,
    round: 1,
    started: true,
  })
  return { sess, h1, enc }
}

async function liveDe(repo: InMemorySessionRepo, sessionId: string): Promise<LiveSession> {
  return {
    sessionId,
    gmUserId: 'gm',
    state: null,
    characters: await repo.findCharactersBySession(sessionId),
    members: [],
    encounters: await repo.listEncountersBySession(sessionId),
  }
}

describe('#403 reconcileHeroesIntoActiveEncounter', () => {
  it('herói publicado DURANTE o combate entra no FIM do order', async () => {
    const repo = new InMemorySessionRepo()
    const { sess, h1, enc } = await mesaEmCombate(repo)
    const h2 = await insertHeroi(repo, sess.id, 'p2') // entra no meio do combate
    await reconcileHeroesIntoActiveEncounter(repo, await liveDe(repo, sess.id))
    const [after] = (await repo.listEncountersBySession(sess.id)).filter((e) => e.id === enc.id)
    expect(after!.turnState?.order).toEqual([h1.id, h2.id])
  })

  it('idempotente: rodar de novo não duplica; live STALE também não duplica', async () => {
    const repo = new InMemorySessionRepo()
    const { sess, h1, enc } = await mesaEmCombate(repo)
    const staleLive = await liveDe(repo, sess.id) // snapshot ANTES do h2
    const h2 = await insertHeroi(repo, sess.id, 'p2')
    const live = await liveDe(repo, sess.id)
    await reconcileHeroesIntoActiveEncounter(repo, live)
    // segunda passada com o live NOVO (h2 já no order)
    await reconcileHeroesIntoActiveEncounter(repo, await liveDe(repo, sess.id))
    // e uma passada com um live STALE que ainda mostra h2 fora do order — a
    // re-leitura fresca antes do write impede o append duplo
    await reconcileHeroesIntoActiveEncounter(repo, { ...staleLive, characters: live.characters })
    const [after] = (await repo.listEncountersBySession(sess.id)).filter((e) => e.id === enc.id)
    expect(after!.turnState?.order).toEqual([h1.id, h2.id])
  })

  it('sem combate ativo → no-op (não lança, não cria encounter)', async () => {
    const repo = new InMemorySessionRepo()
    const sess = await repo.createSession({ name: 'Mesa', gmUserId: 'gm', code: 'C403B' })
    await insertHeroi(repo, sess.id, 'p1')
    await reconcileHeroesIntoActiveEncounter(repo, await liveDe(repo, sess.id))
    expect(await repo.listEncountersBySession(sess.id)).toHaveLength(0)
  })

  it('trap reverso: NPC fora do order NUNCA entra sozinho', async () => {
    const repo = new InMemorySessionRepo()
    const { sess, h1, enc } = await mesaEmCombate(repo)
    await repo.insertCharacter({
      sessionId: sess.id,
      memberId: 'gm',
      kind: 'npc',
      tutorCharacterId: null,
      characterPath: 'Monstros/Goblin',
      visibility: 'visible',
      summary: SUMMARY,
      state: STATE,
      encounterId: enc.id,
    })
    await reconcileHeroesIntoActiveEncounter(repo, await liveDe(repo, sess.id))
    const [after] = (await repo.listEncountersBySession(sess.id)).filter((e) => e.id === enc.id)
    expect(after!.turnState?.order).toEqual([h1.id])
  })
})

describe('#403 bridge — o cliente do GM reconcilia sozinho', () => {
  it('herói publicado no meio do combate aparece no order sem F5', async () => {
    const repo = new InMemorySessionRepo()
    const { sess, h1, enc } = await mesaEmCombate(repo)
    // sessão ativa no dispositivo do GM
    const local = createLocalSession('Mesa', null, 'Mestre')
    updateSession(local.codigo, { remoteId: sess.id })
    setActiveSessionCode(local.codigo)
    render(
      <CatalogProvider catalog={catalog}>
        <SessionRepoProvider repo={repo} user={{ id: 'gm', nome: 'Mestre' }}>
          <MemoryRouter>
            <LiveSessionBridge />
          </MemoryRouter>
        </SessionRepoProvider>
      </CatalogProvider>,
    )
    // jogador p2 publica DURANTE o combate (outro cliente → chega via realtime)
    const h2 = await insertHeroi(repo, sess.id, 'p2')
    await waitFor(async () => {
      const [after] = (await repo.listEncountersBySession(sess.id)).filter((e) => e.id === enc.id)
      expect(after!.turnState?.order).toEqual([h1.id, h2.id])
    })
  })
})
