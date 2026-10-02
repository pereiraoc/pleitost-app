// @vitest-environment jsdom
// Corrida do #229 (b) exposta pelo coalescimento do refetch (#573, 120ms): o
// GM adiciona DOIS monstros do bestiário em sequência rápida e o segundo clique
// ainda vê o `live` SEM combate ativo (o snapshot da sessão só atualiza depois
// do refetch agendado). Antes, addMonsterToInitiative decidia pelo snapshot e
// tentava criar+iniciar um SEGUNDO combate → SessionEncounterAlreadyActiveError
// e o monstro se perdia. Fix: re-ler os encontros do servidor antes de decidir
// (mesmo padrão do reconcileHeroesIntoActiveEncounter, #403).
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { InMemorySessionRepo } from '../src/data/session-repo/in-memory'
import { setLiveSession } from '../src/data/session-repo/live-session'
import type { LiveSession } from '../src/data/session-repo/live-session'
import { addMonsterToInitiative, addRosterToInitiative } from '../src/data/session-repo/encounter-actions'
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
  setLiveSession(null)
})
afterEach(() => setLiveSession(null))

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

describe('#229 (b) com live STALE (refetch coalescido, #573)', () => {
  it('dois monstros em sequência rápida entram no MESMO combate — o segundo não tenta criar outro', async () => {
    const repo = new InMemorySessionRepo()
    const sess = await repo.createSession({ name: 'Mesa', gmUserId: 'gm', code: 'C229' })
    const stale = await liveDe(repo, sess.id) // snapshot SEM combate ativo
    await addMonsterToInitiative({ repo, catalog, live: stale, memberId: 'gm', sourcePath: '', label: 'Goblin A' })
    // o refetch ainda não rodou: o 2º clique vê o MESMO snapshot
    await addMonsterToInitiative({ repo, catalog, live: stale, memberId: 'gm', sourcePath: '', label: 'Goblin B' })

    const encs = await repo.listEncountersBySession(sess.id)
    expect(encs.filter((e) => e.status === 'active').length).toBe(1)
    const ativo = encs.find((e) => e.status === 'active')!
    const npcs = (await repo.findCharactersBySession(sess.id)).filter((c) => c.kind === 'npc')
    expect(npcs.length).toBe(2)
    expect(ativo.turnState?.order).toEqual(npcs.map((c) => c.id))
    expect(ativo.turnState?.order.at(-1)).toBe(npcs.find((c) => c.encounterId === ativo.id && c.id !== npcs[0]!.id)!.id)
  })

  it('roster inteiro (#266) com live STALE também entra no combate já ativo', async () => {
    const repo = new InMemorySessionRepo()
    const sess = await repo.createSession({ name: 'Mesa', gmUserId: 'gm', code: 'C266' })
    const stale = await liveDe(repo, sess.id)
    await addMonsterToInitiative({ repo, catalog, live: stale, memberId: 'gm', sourcePath: '', label: 'Goblin A' })
    await addRosterToInitiative({
      repo,
      catalog,
      live: stale,
      memberId: 'gm',
      name: 'Emboscada',
      entries: [{ sourcePath: '', label: 'Goblin B', qty: 2 }],
    })
    const encs = await repo.listEncountersBySession(sess.id)
    expect(encs.filter((e) => e.status === 'active').length).toBe(1)
    const npcs = (await repo.findCharactersBySession(sess.id)).filter((c) => c.kind === 'npc')
    expect(npcs.length).toBe(3)
    expect(encs.find((e) => e.status === 'active')!.turnState?.order.length).toBe(3)
  })

  it('live stale que ainda aponta pro turnState ANTIGO não sobrescreve os ids já apendados', async () => {
    const repo = new InMemorySessionRepo()
    const sess = await repo.createSession({ name: 'Mesa', gmUserId: 'gm', code: 'C229b' })
    await addMonsterToInitiative({ repo, catalog, live: await liveDe(repo, sess.id), memberId: 'gm', sourcePath: '', label: 'Goblin A' })
    const stale = structuredClone(await liveDe(repo, sess.id)) // snapshot DESTACADO do store, com [A]
    await addMonsterToInitiative({ repo, catalog, live: stale, memberId: 'gm', sourcePath: '', label: 'Goblin B' })
    await addMonsterToInitiative({ repo, catalog, live: stale, memberId: 'gm', sourcePath: '', label: 'Goblin C' }) // ainda vê [A]
    const ativo = (await repo.listEncountersBySession(sess.id)).find((e) => e.status === 'active')!
    expect(ativo.turnState?.order.length).toBe(3)
  })
})
