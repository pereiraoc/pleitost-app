// @vitest-environment jsdom
// #430 — DISTRIBUIÇÃO do mapa-múndi autorado pelo mestre (hexmap mapa:mundo)
// pros jogadores da mesa via sessions.state.hexMapMundo. O MESTRE empurra as
// células editadas; o JOGADOR conectado adota no store local. Antes as
// marcações viviam só no user_state por-conta → jogadores não viam (report
// 8935deaf/c85c98cf).
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { SessionRepoProvider } from '../src/data/session-repo/provider'
import { InMemorySessionRepo } from '../src/data/session-repo/in-memory'
import { setLiveSession } from '../src/data/session-repo/live-session'
import type { LiveSession } from '../src/data/session-repo/live-session'
import { AtlasMapaPage } from '../src/components/compendium/AtlasMapaPage'
import { __setSeedMapaAtlasForTests, __resetMapaAtlasForTests } from '../src/map/mapa-atlas-store'
import {
  __resetHexMapStoreMemoryForTests,
  cellAt,
  getHexMapState,
  setHexLocal,
} from '../src/data/hexmap-store'
import { MAPA_MUNDO_ID } from '../src/data/seed-hexmaps'
import { __resetSettingsForTests } from '../src/settings'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
const catalog = buildCatalog(manifest)
const KRASNOGOR = 'Atlas/Mundo Livre/Federação Áurea/Pedra Fina/Krasnogor'

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
  __setSeedMapaAtlasForTests(null)
  window.localStorage.clear()
  __resetMapaAtlasForTests()
  __resetHexMapStoreMemoryForTests()
  __resetSettingsForTests()
  setLiveSession(null)
})
afterEach(() => {
  cleanup()
  setLiveSession(null)
})

function renderMapa(repo?: InMemorySessionRepo) {
  const inner = (
    <MemoryRouter initialEntries={['/mapa']}>
      <Routes>
        <Route path="/mapa" element={<AtlasMapaPage />} />
      </Routes>
    </MemoryRouter>
  )
  return render(
    <CatalogProvider catalog={catalog}>
      {repo ? <SessionRepoProvider repo={repo}>{inner}</SessionRepoProvider> : inner}
    </CatalogProvider>,
  )
}

describe('#430 — mestre empurra o hexmap mapa:mundo pra mesa', () => {
  it('mestre que EDITOU o mapa empurra as células pro sessions.state', async () => {
    window.localStorage.setItem('pleitost.settings.mestre', 'true')
    __resetSettingsForTests()
    // o mestre marca um lugar num hex NOVO do mapa-múndi (edição real → persiste;
    // (46,16) já é o Krasnogor no seed, seria no-op)
    setHexLocal(MAPA_MUNDO_ID, 20, 20, KRASNOGOR)
    const repo = new InMemorySessionRepo()
    const sess = await repo.createSession({ name: 'Mesa', gmUserId: 'gm', code: 'HX1' })
    setLiveSession({
      sessionId: sess.id,
      gmUserId: 'gm',
      state: null,
      characters: [],
      members: [],
      encounters: [],
    })
    const spy = vi.spyOn(repo, 'updateSessionState')
    renderMapa(repo)
    await screen.findByAltText('Mapa do mundo')
    await waitFor(() =>
      expect(spy.mock.calls.some((c) => 'hexMapMundo' in ((c[1] ?? {}) as object))).toBe(true),
    )
    const call = spy.mock.calls.find((c) => 'hexMapMundo' in ((c[1] ?? {}) as object))!
    const blob = (call[1] as { hexMapMundo: { cells: { localId?: string }[] } }).hexMapMundo
    expect(blob.cells.some((c) => c.localId === KRASNOGOR)).toBe(true)
  })

  it('mestre SEM edição (só seed) NÃO empurra hexMapMundo (sem spam do seed)', async () => {
    window.localStorage.setItem('pleitost.settings.mestre', 'true')
    __resetSettingsForTests()
    const repo = new InMemorySessionRepo()
    const sess = await repo.createSession({ name: 'Mesa', gmUserId: 'gm', code: 'HX2' })
    setLiveSession({
      sessionId: sess.id,
      gmUserId: 'gm',
      state: null,
      characters: [],
      members: [],
      encounters: [],
    })
    const spy = vi.spyOn(repo, 'updateSessionState')
    renderMapa(repo)
    await screen.findByAltText('Mapa do mundo')
    await new Promise((r) => setTimeout(r, 120))
    expect(spy.mock.calls.some((c) => 'hexMapMundo' in ((c[1] ?? {}) as object))).toBe(false)
  })
})

describe('#430 — jogador adota o mapa da mesa', () => {
  it('jogador (não-mestre) conectado adota hexMapMundo no store local', async () => {
    // NADA editado localmente; o mapa vem SÓ do state remoto (autor = GM).
    setLiveSession({
      sessionId: 's1',
      gmUserId: 'gm',
      state: {
        hexMapMundo: { cells: [{ col: 46, row: 16, localId: KRASNOGOR }] },
      } as unknown as LiveSession['state'],
      characters: [],
      members: [],
      encounters: [],
    })
    renderMapa()
    await screen.findByAltText('Mapa do mundo')
    await waitFor(() =>
      expect(cellAt(getHexMapState(MAPA_MUNDO_ID).cells, 46, 16)?.localId).toBe(KRASNOGOR),
    )
  })

  it('adoção NÃO faz loop quando o remoto NORMALIZA diferente (React #185)', async () => {
    // célula com `areaId` (forma antiga) → setHexMapFull normaliza pra
    // `areaIds`; o JSON normalizado NUNCA bate com o cru → o efeito re-importava
    // a cada render (loop infinito de commit/emit → crash). Com o fix, adota 1×.
    setLiveSession({
      sessionId: 's1',
      gmUserId: 'gm',
      state: {
        hexMapMundo: { cells: [{ col: 5, row: 5, areaId: 'AREA-X' }] },
      } as unknown as LiveSession['state'],
      characters: [],
      members: [],
      encounters: [],
    })
    // se houver loop, o render estoura "Maximum update depth" e o findBy falha
    renderMapa()
    await screen.findByAltText('Mapa do mundo')
    await waitFor(() => {
      const cel = cellAt(getHexMapState(MAPA_MUNDO_ID).cells, 5, 5)
      expect(cel?.areaIds).toEqual(['AREA-X'])
    })
    // estabilizou: uma janela extra sem re-render descontrolado
    await new Promise((r) => setTimeout(r, 80))
    expect(cellAt(getHexMapState(MAPA_MUNDO_ID).cells, 5, 5)?.areaIds).toEqual(['AREA-X'])
  })
})
