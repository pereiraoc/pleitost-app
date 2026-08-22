// @vitest-environment jsdom
// #486 — resumo de combatente: NPCs da iniciativa entravam SEM fmBlob e o
// segredo do disfarce guardava fmBlob VAZIO — o resumo sintético nascia em
// branco até pro GM. Agora: a ficha real vive no SEGREDO do GM (nunca na
// linha publicada — jogador não recebe nem por devtools), o resumo do GM
// sobrepõe o segredo, e o toggle 📖 da edição de iniciativa publica o fmBlob
// (updateCharacterFmBlob) liberando o resumo aos jogadores.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { ResumoSessaoDetail } from '../src/components/detail/ResumoDetail'
import { addMonsterToInitiative } from '../src/data/session-repo/encounter-actions'
import { readDisguiseSecret, __resetDisguiseSecretsForTests } from '../src/data/session-repo/disguise-secrets'
import { InMemorySessionRepo } from '../src/data/session-repo/in-memory'
import { setLiveSession, type LiveSession } from '../src/data/session-repo/live-session'
import {
  createLocalEntity,
  emptyHeroFrontmatter,
  __resetLocalStoreForTests,
} from '../src/data/local-entities'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
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
    getItem: (k) => (data.has(k) ? data.get(k)! : null),
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
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
  __resetLocalStoreForTests()
  __resetHeroStoreMemoryForTests()
  setLiveSession(null)
})
afterEach(() => {
  cleanup()
  setLiveSession(null)
})

async function liveDe(repo: InMemorySessionRepo, sessionId: string): Promise<LiveSession> {
  return {
    sessionId,
    gmUserId: 'gm-1',
    state: null,
    characters: await repo.findCharactersBySession(sessionId),
    members: [],
    encounters: await repo.listEncountersBySession(sessionId),
  }
}

async function heroiNaIniciativa() {
  const heroId = createLocalEntity('Heroi', 'Vilão Fichado', {
    ...(emptyHeroFrontmatter() as Record<string, unknown>),
    Classe: '[[Guerreiro]]',
    'Nível': 5,
  })
  const repo = new InMemorySessionRepo()
  const sess = await repo.createSession({ name: 'Mesa', gmUserId: 'gm-1', code: 'R486' })
  await addMonsterToInitiative({
    repo,
    catalog,
    live: await liveDe(repo, sess.id),
    memberId: 'gm-1',
    sourcePath: heroId,
    label: 'Vilão Fichado',
  })
  const chars = await repo.findCharactersBySession(sess.id)
  const npc = chars.find((c) => c.kind === 'npc')!
  return { repo, sess, npc }
}

describe('#486 — ficha real no segredo, nunca na linha publicada', () => {
  it('linha publicada SEM fmBlob (mascarada); segredo com ficha + identidade reais', async () => {
    const { sess, npc } = await heroiNaIniciativa()
    expect(Object.keys(npc.fmBlob ?? {})).toHaveLength(0) // jogador não recebe
    const secret = readDisguiseSecret(sess.id, npc.id)!
    expect(secret).toBeTruthy()
    expect(secret.summary.nome).toBe('Vilão Fichado')
    expect(Object.keys(secret.fmBlob).length).toBeGreaterThan(0) // ficha real
  })

  it('resumo do GM sobrepõe o segredo (nome real, não mais vazio)', async () => {
    const { repo, sess, npc } = await heroiNaIniciativa()
    setLiveSession(await liveDe(repo, sess.id))
    render(
      <CatalogProvider catalog={catalog}>
        <ResumoSessaoDetail charId={npc.id} />
      </CatalogProvider>,
    )
    expect(await screen.findByText('Vilão Fichado')).toBeTruthy()
  })

  it('toggle liberar: updateCharacterFmBlob publica a ficha; fechar volta a {}', async () => {
    const { repo, sess, npc } = await heroiNaIniciativa()
    const secret = readDisguiseSecret(sess.id, npc.id)!
    await repo.updateCharacterFmBlob(npc.id, secret.fmBlob)
    let chars = await repo.findCharactersBySession(sess.id)
    expect(Object.keys(chars.find((c) => c.id === npc.id)!.fmBlob ?? {}).length).toBeGreaterThan(0)
    await repo.updateCharacterFmBlob(npc.id, {})
    chars = await repo.findCharactersBySession(sess.id)
    expect(Object.keys(chars.find((c) => c.id === npc.id)!.fmBlob ?? {})).toHaveLength(0)
  })
})
