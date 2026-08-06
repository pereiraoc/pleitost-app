// @vitest-environment jsdom
// Mapa do mundo — FASE 2 (#419, pedido do mestre): regiões marcadas pelo GM
// habilitáveis POR GRUPO; região desabilitada fica coberta pelo
// atlas-overlay.webp (clipado no polígono) e nenhum lugar (pin) por baixo
// aparece/é clicável. Autoria local-first (pleitost.mapaAtlas); jogadores da
// mesa recebem via sessions.state.mapaAtlas (GM empurra; jogador só lê).
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
import {
  DEFAULT_VIEWER,
  __resetMapaAtlasForTests,
  addPin,
  addRegiao,
  getMapaAtlas,
  pinVisivel,
  pontoNaRegiao,
  regioesDesabilitadas,
  sanitize,
  toggleRegiaoHabilitada,
} from '../src/map/mapa-atlas-store'
import { __resetSettingsForTests } from '../src/settings'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

const KRASNOGOR = 'Atlas/Mundo Livre/Federação Áurea/Pedra Fina/Krasnogor'
const CANTO_ALTO = 'Atlas/Mundo Livre/Federação Áurea/Canto Alto'

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
  __resetMapaAtlasForTests()
  __resetSettingsForTests()
  setLiveSession(null)
})
afterEach(() => {
  cleanup()
  setLiveSession(null)
})

/** Região quadrada 0..1000 × 0..1000 (px da fonte). */
function regiaoQuadrada(nome = 'Mundo Livre Norte') {
  return addRegiao(nome, [
    { x: 0, y: 0 },
    { x: 1000, y: 0 },
    { x: 1000, y: 1000 },
    { x: 0, y: 1000 },
  ])!
}

function renderMapa(repo?: InMemorySessionRepo) {
  const inner = (
    <MemoryRouter initialEntries={['/mapa']}>
      <Routes>
        <Route path="/mapa" element={<AtlasMapaPage />} />
        <Route path="/doc/*" element={<div data-doc-page="" />} />
      </Routes>
    </MemoryRouter>
  )
  return render(
    <CatalogProvider catalog={catalog}>
      {repo ? <SessionRepoProvider repo={repo}>{inner}</SessionRepoProvider> : inner}
    </CatalogProvider>,
  )
}

describe('mapa-atlas-store — gating por grupo', () => {
  it('ponto-no-polígono + pin visível só fora de região desabilitada', () => {
    const r = regiaoQuadrada()
    expect(pontoNaRegiao({ x: 500, y: 500 }, r)).toBe(true)
    expect(pontoNaRegiao({ x: 1500, y: 500 }, r)).toBe(false)
    const off = regioesDesabilitadas(getMapaAtlas(), DEFAULT_VIEWER)
    expect(off.map((x) => x.id)).toEqual([r.id])
    expect(pinVisivel({ id: 'p1', localId: KRASNOGOR, x: 500, y: 500 }, off)).toBe(false)
    expect(pinVisivel({ id: 'p2', localId: CANTO_ALTO, x: 1500, y: 500 }, off)).toBe(true)
  })

  it('habilitar POR GRUPO abre só pra aquele grupo; default segue fechado', () => {
    const r = regiaoQuadrada()
    toggleRegiaoHabilitada('grupo-a', r.id)
    expect(regioesDesabilitadas(getMapaAtlas(), 'grupo-a')).toHaveLength(0)
    expect(regioesDesabilitadas(getMapaAtlas(), 'grupo-b')).toHaveLength(1)
    expect(regioesDesabilitadas(getMapaAtlas(), DEFAULT_VIEWER)).toHaveLength(1)
  })

  it('sem nenhuma região marcada, nada é coberto (fase 1 intacta)', () => {
    expect(regioesDesabilitadas(getMapaAtlas(), DEFAULT_VIEWER)).toHaveLength(0)
  })

  it('sanitize valida o blob remoto (state da sessão) sem confiar no shape', () => {
    const s = sanitize({
      regioes: [{ id: 'r1', nome: 'X', pontos: [{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 }] }, { lixo: true }],
      pins: [{ id: 'p', localId: KRASNOGOR, x: 9, y: 9 }, { semLocal: 1 }],
      habilitadas: { g: ['r1'], invalido: 'não-lista' },
    })
    expect(s.regioes).toHaveLength(1)
    expect(s.pins).toHaveLength(1)
    expect(s.habilitadas).toEqual({ g: ['r1'] })
  })
})

describe('AtlasMapaPage — render do gating', () => {
  it('região desabilitada: overlay clipado presente e pin de dentro some; pin de fora clica', async () => {
    regiaoQuadrada()
    addPin(KRASNOGOR, 500, 500) // dentro da região coberta
    addPin(CANTO_ALTO, 1500, 500) // fora
    renderMapa()
    await screen.findByAltText('Mapa do mundo')
    // overlay clipado sobre a região desabilitada
    expect(document.querySelector('[data-overlay-desabilitado]')).toBeTruthy()
    // pin de DENTRO não existe ("nenhum lugar abaixo aparecerá como clicável")
    expect(document.querySelector(`[data-pin="${KRASNOGOR}"]`)).toBeNull()
    // pin de FORA clica e navega pra página do lugar
    const pin = document.querySelector(`[data-pin="${CANTO_ALTO}"]`) as SVGGElement
    expect(pin).toBeTruthy()
    fireEvent.click(pin)
    expect(document.querySelector('[data-doc-page]')).toBeTruthy()
  })

  it('região HABILITADA pro viewer default: sem overlay, pin de dentro volta', async () => {
    const r = regiaoQuadrada()
    addPin(KRASNOGOR, 500, 500)
    toggleRegiaoHabilitada(DEFAULT_VIEWER, r.id)
    renderMapa()
    await screen.findByAltText('Mapa do mundo')
    expect(document.querySelector('[data-overlay-desabilitado]')).toBeNull()
    expect(document.querySelector(`[data-pin="${KRASNOGOR}"]`)).toBeTruthy()
  })
})

describe('AtlasMapaPage — mesa: GM empurra, jogador lê o state', () => {
  it('jogador (sem Modo Mestre) conectado usa o mapaAtlas do state da sessão', async () => {
    // NADA no store local; a região vem SÓ do state remoto (autor = GM).
    setLiveSession({
      sessionId: 's1',
      gmUserId: 'gm',
      state: {
        mapaAtlas: {
          regioes: [
            { id: 'r-remota', nome: 'Norte', pontos: [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }, { x: 0, y: 1000 }] },
          ],
          pins: [{ id: 'p', localId: KRASNOGOR, x: 500, y: 500 }],
          habilitadas: {},
        },
      } as unknown as LiveSession['state'],
      characters: [],
      members: [],
      encounters: [],
    })
    renderMapa()
    await screen.findByAltText('Mapa do mundo')
    expect(document.querySelector('[data-overlay-desabilitado]')).toBeTruthy()
    expect(document.querySelector(`[data-pin="${KRASNOGOR}"]`)).toBeNull()
  })

  it('MESTRE conectado empurra o blob pro sessions.state (veículo da mesa)', async () => {
    window.localStorage.setItem('pleitost.settings.mestre', 'true')
    __resetSettingsForTests()
    regiaoQuadrada('Região do Push')
    const repo = new InMemorySessionRepo()
    const sess = await repo.createSession({ name: 'Mesa', gmUserId: 'gm', code: 'MAPA1' })
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
    await waitFor(() => expect(spy).toHaveBeenCalled())
    const patch = spy.mock.calls.at(-1)![1] as { mapaAtlas?: { regioes?: unknown[] } }
    expect(patch.mapaAtlas?.regioes).toHaveLength(1)
  })
})

describe('AtlasMapaPage — ferramentas do mestre', () => {
  it('painel só aparece no Modo Mestre; fora dele não há autoria', async () => {
    renderMapa()
    await screen.findByAltText('Mapa do mundo')
    expect(screen.queryByText('FERRAMENTAS DO MESTRE')).toBeNull()
    cleanup()
    window.localStorage.setItem('pleitost.settings.mestre', 'true')
    __resetSettingsForTests()
    renderMapa()
    await screen.findByAltText('Mapa do mundo')
    expect(screen.getByText('FERRAMENTAS DO MESTRE')).toBeTruthy()
    expect(screen.getByText('⬡ MARCAR REGIÃO')).toBeTruthy()
    expect(screen.getByText('📍 MARCAR LUGAR')).toBeTruthy()
  })
})
