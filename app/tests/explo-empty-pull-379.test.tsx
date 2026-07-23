// @vitest-environment jsdom
// Report #379 ("sumiu todo o histórico de caminho do Carlos e seu grupo"):
// investigação nos DADOS do servidor mostrou o histórico INTACTO (137 hexes no
// state.exploracao da sessão ativa + cópias na conta) — mas o sync #5 tinha um
// vetor real de perda: "remoto = fonte de verdade" fazia PULL mesmo quando o
// remoto estava PRESENTE-MAS-VAZIO ({hexes:[]}), sobrescrevendo uma trilha
// local inteira com o vazio (e o push replicava a destruição pra sessão).
// Fix: remoto vazio é tratado como AUSENTE — não sobrescreve; se o local tem
// trilha, ela SEMEIA o remoto (recuperação, não destruição).
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

const SESS = 's-explo'
const EXPLO_ID = `${MESA_GRUPO_ID}:${SESS}`
const TRILHA = {
  hexes: [
    { id: 'h1', col: 2, row: 3, label: 'Vila' },
    { id: 'h2', col: 3, row: 3 },
  ],
} as never

function liveMesa(state: Record<string, unknown> | null): LiveSession {
  return {
    sessionId: SESS,
    state: state as LiveSession['state'],
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

describe('#379 — remoto presente-mas-VAZIO não destrói a trilha local', () => {
  it('local com trilha + remoto {hexes:[]}: local PRESERVADO e remoto semeado', async () => {
    const repo = new InMemorySessionRepo()
    const sess = await repo.createSession({ name: 'Mesa Explo', gmUserId: 'gm', code: 'EXPLO1' })
    setGroupStateFull(`${MESA_GRUPO_ID}:${sess.id}`, TRILHA)
    setLiveSession({ ...liveMesa({ exploracao: { hexes: [] } }), sessionId: sess.id })
    renderMesa(repo)
    // a trilha local NUNCA é zerada pelo pull do vazio…
    await waitFor(() => {
      expect(getGroupState(`${MESA_GRUPO_ID}:${sess.id}`).hexes).toHaveLength(2)
    })
    // …e o remoto é SEMEADO com ela (recuperação)
    await waitFor(async () => {
      const s = (await repo.findSessionById(sess.id))!.state
      expect(((s.exploracao ?? {}) as { hexes?: unknown[] }).hexes).toHaveLength(2)
    })
  }, 30000)

  it('remoto COM trilha continua fonte de verdade (pull normal — trap reverso)', async () => {
    const repo = new InMemorySessionRepo()
    await repo.createSession({ name: 'Mesa Explo', gmUserId: 'gm', code: 'EXPLO2' })
    setGroupStateFull(EXPLO_ID, { hexes: [] } as never)
    setLiveSession(liveMesa({ exploracao: TRILHA }))
    renderMesa(repo)
    await waitFor(() => {
      expect(getGroupState(EXPLO_ID).hexes).toHaveLength(2)
    })
  }, 30000)
})
