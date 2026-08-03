// @vitest-environment jsdom
// Report #404 ("Tem grupos novos que ficam aparecendo com um histórico que não
// é deles de exploração"): o sync #5 da mesa puxava `state.exploracao` da
// SESSÃO pro groupState do grupo persistente ATUAL — mas o remoto não tinha
// DONO. Quando a mesa trocava de grupo persistente (personagens re-publicados
// com FM `grupo` novo), a trilha da sessão (acumulada pelo grupo ANTIGO)
// desaguava no grupo novo via pull (local vazio → remoto vence). Fix: o push
// CARIMBA `grupoId` no blob remoto; o pull ignora remoto de OUTRO grupo.
// Sem carimbo (legado) ou dono = escopo-sessão desta mesa (upgrade path do
// #379 r2) → pull normal.
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
import type { SessionCharacter } from '../src/data/session-repo/contract'
import { GrupoView } from '../src/grupo/GrupoView'
import {
  addGroupHex,
  getGroupState,
  __resetGroupStoreMemoryForTests,
} from '../src/data/group-store'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

const GRUPO_CARLOS = 'Sistema/Criaturas/Grupos de Criaturas/Carlos, Dante, Mera, Pind, Thoren'

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

const TRILHA_ANTIGA = {
  hexes: [
    { id: 'a1', col: 10, row: 10, kind: 'parada', label: 'Ruína do Grupo Antigo' },
    { id: 'a2', col: 11, row: 10, kind: 'caminho' },
  ],
} as never

function charDoGrupo(grupo: string | null): SessionCharacter {
  return {
    id: 'c1',
    sessionId: 's1',
    memberId: 'm1',
    kind: 'heroi',
    tutorCharacterId: null,
    characterPath: 'local:Heroi:carlos-copia',
    visibility: 'party',
    summary: { nome: 'Carlos', family: 'Heroi' },
    state: {},
    fmBlob: grupo ? { grupo: [grupo] } : {},
    updatedAt: '2026-07-23T00:00:00.000Z',
  } as unknown as SessionCharacter
}

function liveMesa(sessionId: string, grupo: string | null): LiveSession {
  return {
    sessionId,
    state: null,
    gmUserId: null,
    characters: [charDoGrupo(grupo)],
    members: [],
    encounters: [],
  }
}

function renderView(repo: InMemorySessionRepo, groupId: string) {
  return render(
    <CatalogProvider catalog={catalog}>
      <SessionRepoProvider repo={repo}>
        <MemoryRouter>
          <GrupoView groupId={groupId} />
        </MemoryRouter>
      </SessionRepoProvider>
    </CatalogProvider>,
  )
}

describe('#404 — trilha remota tem DONO; grupo novo não herda histórico alheio', () => {
  it('remoto carimbado com OUTRO grupo NÃO é puxado pro grupo persistente novo', async () => {
    const repo = new InMemorySessionRepo()
    const sess = await repo.createSession({ name: 'Mesa', gmUserId: 'gm', code: 'DN1' })
    // sessão carrega a trilha do grupo ANTIGO (carimbada com o dono)
    setLiveSession({
      ...liveMesa(sess.id, '[[Carlos, Dante, Mera, Pind, Thoren]]'),
      state: {
        exploracao: {
          ...(TRILHA_ANTIGA as object),
          grupoId: 'Sistema/Criaturas/Grupos de Criaturas/Grupo Antigo',
          updatedAt: '2026-08-01T00:00:00.000Z',
        },
      } as LiveSession['state'],
    })
    renderView(repo, MESA_GRUPO_ID)
    // o grupo novo (Carlos) NUNCA recebe a trilha do grupo antigo
    await new Promise((r) => setTimeout(r, 150))
    expect(getGroupState(GRUPO_CARLOS).hexes).toHaveLength(0)
  }, 30000)

  it('push carimba o grupoId do dono no blob remoto', async () => {
    const repo = new InMemorySessionRepo()
    const sess = await repo.createSession({ name: 'Mesa', gmUserId: 'gm', code: 'DN2' })
    setLiveSession(liveMesa(sess.id, '[[Carlos, Dante, Mera, Pind, Thoren]]'))
    renderView(repo, MESA_GRUPO_ID)
    // edição local no grupo persistente → push semeia o remoto com o carimbo
    addGroupHex(GRUPO_CARLOS, { col: 5, row: 5, kind: 'parada' })
    await waitFor(async () => {
      const s = await repo.findSessionById(sess.id)
      const explo = s?.state?.exploracao as { grupoId?: string; hexes?: unknown[] } | undefined
      expect(explo?.hexes).toHaveLength(1)
      expect(explo?.grupoId).toBe(GRUPO_CARLOS)
    })
  }, 30000)

  it('upgrade path: remoto carimbado com o ESCOPO-SESSÃO desta mesa ainda puxa', async () => {
    const repo = new InMemorySessionRepo()
    const sess = await repo.createSession({ name: 'Mesa', gmUserId: 'gm', code: 'DN3' })
    // trilha da própria mesa, acumulada ANTES do grupo persistente existir
    setLiveSession({
      ...liveMesa(sess.id, '[[Carlos, Dante, Mera, Pind, Thoren]]'),
      state: {
        exploracao: {
          ...(TRILHA_ANTIGA as object),
          grupoId: `${MESA_GRUPO_ID}:${sess.id}`,
          updatedAt: '2026-08-01T00:00:00.000Z',
        },
      } as LiveSession['state'],
    })
    renderView(repo, MESA_GRUPO_ID)
    await waitFor(() => {
      expect(getGroupState(GRUPO_CARLOS).hexes).toHaveLength(2)
    })
  }, 30000)
})
