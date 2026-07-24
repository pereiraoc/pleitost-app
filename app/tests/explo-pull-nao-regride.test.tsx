// @vitest-environment jsdom
// Follow-up do #379 ("não tá com o caminho completo"): a investigação achou a
// trilha FRAGMENTADA entre sessões — membros conectados a CÓDIGOS diferentes
// da mesma mesa gravaram dias em states distintos (o dia 21 ficou na sessão
// antiga). Com a trilha agora no groupState do GRUPO persistente, um pull de
// uma sessão com state VELHO (ex.: 2 hexes de um código antigo) NÃO pode
// regredir a trilha consolidada do grupo. Guard por updatedAt: o push carimba
// o remoto; no pull, local mais NOVO vence (e é empurrado pro remoto) —
// last-writer-wins de verdade, não "remoto sempre vence".
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
import { setLiveSession, MESA_GRUPO_ID } from '../src/data/session-repo/live-session'
import type { LiveSession } from '../src/data/session-repo/live-session'
import { GrupoView } from '../src/grupo/GrupoView'
import {
  getGroupState,
  setGroupStateFull,
  __resetGroupStoreMemoryForTests,
} from '../src/data/group-store'
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
  __resetGroupStoreMemoryForTests()
  setLiveSession(null)
})
afterEach(() => {
  cleanup()
  setLiveSession(null)
})

const TRILHA_NOVA = {
  hexes: [
    { id: 'n1', col: 1, row: 1, kind: 'parada' },
    { id: 'n2', col: 2, row: 1, kind: 'caminho' },
    { id: 'n3', col: 3, row: 1, kind: 'parada' },
  ],
} as never
const TRILHA_VELHA = { hexes: [{ id: 'v1', col: 9, row: 9, kind: 'parada' }] } as never

function liveMesa(sessionId: string, explo: unknown): LiveSession {
  return {
    sessionId,
    state: (explo ? { exploracao: explo } : null) as LiveSession['state'],
    gmUserId: null,
    characters: [],
    members: [],
    encounters: [],
  }
}

function renderMesa(repo: InMemorySessionRepo) {
  return render(
    <CatalogProvider catalog={catalog}>
      <SessionRepoProvider repo={repo}>
        <MemoryRouter>
          <GrupoView groupId={MESA_GRUPO_ID} />
        </MemoryRouter>
      </SessionRepoProvider>
    </CatalogProvider>,
  )
}

describe('pull NÃO regride: local mais novo vence o remoto velho', () => {
  it('remoto de sessão velha (updatedAt antigo) não sobrescreve trilha nova', async () => {
    const repo = new InMemorySessionRepo()
    const sess = await repo.createSession({ name: 'Mesa', gmUserId: 'gm', code: 'REG1' })
    const exploId = `${MESA_GRUPO_ID}:${sess.id}`
    // trilha LOCAL consolidada, carimbada AGORA (setGroupStateFull grava updatedAt)
    setGroupStateFull(exploId, TRILHA_NOVA)
    // remoto da sessão com state VELHO (carimbo antigo)
    setLiveSession(
      liveMesa(sess.id, { ...(TRILHA_VELHA as object), updatedAt: '2026-07-13T00:00:00.000Z' }),
    )
    renderMesa(repo)
    // o local NUNCA regride pros 1 hex velhos…
    await waitFor(async () => {
      // …e o remoto é ATUALIZADO com a trilha nova (push do lado mais novo)
      const s = (await repo.findSessionById(sess.id))!.state
      const hexes = ((s.exploracao ?? {}) as { hexes?: { id: string }[] }).hexes ?? []
      expect(hexes.map((h) => h.id)).toEqual(['n1', 'n2', 'n3'])
    })
    expect((getGroupState(exploId).hexes as { id: string }[]).map((h) => h.id)).toEqual([
      'n1',
      'n2',
      'n3',
    ])
  }, 30000)

  it('remoto mais NOVO segue vencendo (pull normal — trap reverso)', async () => {
    const repo = new InMemorySessionRepo()
    const sess = await repo.createSession({ name: 'Mesa', gmUserId: 'gm', code: 'REG2' })
    const exploId = `${MESA_GRUPO_ID}:${sess.id}`
    setGroupStateFull(exploId, TRILHA_VELHA)
    // o carimbo local é AGORA; o remoto precisa ser mais novo ainda
    const futuro = new Date(Date.now() + 60_000).toISOString()
    setLiveSession(liveMesa(sess.id, { ...(TRILHA_NOVA as object), updatedAt: futuro }))
    renderMesa(repo)
    await waitFor(() => {
      expect((getGroupState(exploId).hexes as { id: string }[]).map((h) => h.id)).toEqual([
        'n1',
        'n2',
        'n3',
      ])
    })
  }, 30000)

  it('remoto SEM updatedAt (states antigos) mantém o comportamento: pull', async () => {
    const repo = new InMemorySessionRepo()
    const sess = await repo.createSession({ name: 'Mesa', gmUserId: 'gm', code: 'REG3' })
    const exploId = `${MESA_GRUPO_ID}:${sess.id}`
    setGroupStateFull(exploId, TRILHA_VELHA)
    setLiveSession(liveMesa(sess.id, TRILHA_NOVA))
    renderMesa(repo)
    await waitFor(() => {
      expect((getGroupState(exploId).hexes as { id: string }[]).map((h) => h.id)).toEqual([
        'n1',
        'n2',
        'n3',
      ])
    })
  }, 30000)
})
