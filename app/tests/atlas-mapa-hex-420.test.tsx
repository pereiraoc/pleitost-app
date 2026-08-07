// @vitest-environment jsdom
// Mapa do mundo #420: a grade hex do Mundo Livre PORTADA pro atlas.webp.
//   • Calibração REAL: afim uniforme s=0.74777 t=(3620.1,466.5) fitada nas
//     âncoras (pin do mestre no Krasnogor + emblemas), malha conferida por
//     autocorrelação (83/96px) e overlay visual — o teste trava o resultado:
//     Krasnogor = célula (46,16) com centro ≈ (3815,1612), a ~2px do pin.
//   • Seed mapa:mundo DERIVADO do seed do Mundo Livre (col+44,row+5 — shift
//     par preserva o odd-q), incluindo as 896 células do backup do mestre.
//   • Clique num hex abre a INFO (lugar + áreas, como na exploração) — e em
//     região DESABILITADA não abre NADA ("não vai dar pra clicar no mapa e
//     ver a respeito de cada hex").
//   • Regiões são ALINHADAS a hex inteiro (snap no salvar + normalização das
//     antigas) — feedback "quero algo mais smooth, marcando sempre hex
//     inteiro".
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { AtlasMapaPage } from '../src/components/compendium/AtlasMapaPage'
import {
  ATLAS_COL_SHIFT,
  ATLAS_ROW_SHIFT,
  atlasHexCenter,
  atlasHexPolygonPoints,
  atlasHexVertices,
  atlasPixelToHex,
} from '../src/map/atlas-grid'
import { MAPA_MUNDO_ID, SEED_HEXMAPS } from '../src/data/seed-hexmaps'
import { __resetHexMapStoreMemoryForTests } from '../src/data/hexmap-store'
import {
  DEFAULT_VIEWER,
  __resetMapaAtlasForTests,
  addRegiao,
  getMapaAtlas,
  normalizeRegioesToHex,
  snapPontosToHexes,
  toggleRegiaoHabilitada,
} from '../src/map/mapa-atlas-store'
import { __resetSettingsForTests } from '../src/settings'
import { setLiveSession } from '../src/data/session-repo/live-session'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

const KRASNOGOR = 'Atlas/Mundo Livre/Federação Áurea/Pedra Fina/Krasnogor'
/** Célula do Krasnogor no MUNDO: (2,11) do Mundo Livre + shift (44,5). */
const KRAS_CELL = { col: 2 + ATLAS_COL_SHIFT, row: 11 + ATLAS_ROW_SHIFT }

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
  __resetHexMapStoreMemoryForTests()
  __resetSettingsForTests()
  setLiveSession(null)
})
afterEach(() => {
  cleanup()
  setLiveSession(null)
})

describe('#420 — grade calibrada do mapa-múndi', () => {
  it('Krasnogor: célula (46,16) com centro a ≤5px do pin do mestre (3815,1614)', () => {
    const c = atlasHexCenter(KRAS_CELL.col, KRAS_CELL.row)
    expect(Math.hypot(c.x - 3815, c.y - 1614)).toBeLessThan(5)
    // roundtrip pixel→hex no ponto do pin
    expect(atlasPixelToHex(3815, 1614)).toEqual(KRAS_CELL)
  })

  it('seed mapa:mundo = seed do Mundo Livre deslocado (mesma contagem, Krasnogor em 46,16)', () => {
    const mundo = SEED_HEXMAPS[MAPA_MUNDO_ID] as Array<Record<string, unknown>>
    const ml = SEED_HEXMAPS['Atlas/Mundo Livre/Mundo Livre'] as Array<Record<string, unknown>>
    expect(mundo.length).toBe(ml.length)
    expect(ml.length).toBeGreaterThan(800) // backup completo do mestre (896 células)
    const kras = mundo.find((c) => c.localId === KRASNOGOR)
    expect(kras).toMatchObject(KRAS_CELL)
  })
})

function renderMapa() {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={['/mapa']}>
        <Routes>
          <Route path="/mapa" element={<AtlasMapaPage />} />
          <Route path="/doc/*" element={<div data-doc-page="" />} />
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

/** jsdom não tem layout: mocka o rect do div do mapa (idioma exploracao.test)
 *  e clica no CENTRO da célula convertido pra coordenada de cliente. */
function mockRectEClicaHex(container: HTMLElement, cell: { col: number; row: number }) {
  const W = 744 // 1/10 da fonte — mantém a conta simples
  const H = 526.2
  const mapa = container.querySelector('[data-mapa]') as HTMLElement
  expect(mapa).toBeTruthy()
  mapa.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: W, bottom: H, width: W, height: H, x: 0, y: 0 }) as DOMRect
  const viewport = container.querySelector('[data-mapa-viewport]') as HTMLElement
  const c = atlasHexCenter(cell.col, cell.row)
  fireEvent.click(viewport, { clientX: c.x / 10, clientY: c.y / 10 })
}

/** Região quadrada em px da fonte cobrindo o Krasnogor (célula 46,16). */
function regiaoSobreKrasnogor() {
  return addRegiao('Pedra Fina Norte', [
    { x: 3600, y: 1400 },
    { x: 4100, y: 1400 },
    { x: 4100, y: 1900 },
    { x: 3600, y: 1900 },
  ])!
}

describe('#420 — clique no hex: info gateada por região', () => {
  it('sem região marcada, clicar no hex do Krasnogor abre a info com o lugar', async () => {
    const { container } = renderMapa()
    await screen.findByAltText('Mapa do mundo')
    mockRectEClicaHex(container, KRAS_CELL)
    await waitFor(() => expect(container.querySelector('[data-hex-info]')).toBeTruthy())
    expect(screen.getByText('Krasnogor')).toBeTruthy()
    expect(container.querySelector('[data-hex-selecionado]')).toBeTruthy()
    // abrir navega pra página do lugar
    fireEvent.click(screen.getByText('Krasnogor'))
    expect(container.querySelector('[data-doc-page]')).toBeTruthy()
  })

  it('região DESABILITADA: o clique no hex NÃO abre info nenhuma', async () => {
    regiaoSobreKrasnogor() // default fechado ⇒ desabilitada pro viewer
    const { container } = renderMapa()
    await screen.findByAltText('Mapa do mundo')
    mockRectEClicaHex(container, KRAS_CELL)
    await new Promise((r) => setTimeout(r, 80))
    expect(container.querySelector('[data-hex-info]')).toBeNull()
    expect(screen.queryByText('Krasnogor')).toBeNull()
  })

  it('trap reverso: a MESMA região habilitada volta a abrir a info', async () => {
    const r = regiaoSobreKrasnogor()
    toggleRegiaoHabilitada(DEFAULT_VIEWER, r.id)
    const { container } = renderMapa()
    await screen.findByAltText('Mapa do mundo')
    mockRectEClicaHex(container, KRAS_CELL)
    await waitFor(() => expect(container.querySelector('[data-hex-info]')).toBeTruthy())
    expect(screen.getByText('Krasnogor')).toBeTruthy()
  })
})

describe('#420 — regiões alinhadas a HEX INTEIRO (feedback do mestre)', () => {
  it('snap: desenho livre vira contorno cujo vértices são vértices de hex', () => {
    const snap = snapPontosToHexes([
      { x: 3600, y: 1400 },
      { x: 4100, y: 1400 },
      { x: 4100, y: 1900 },
      { x: 3600, y: 1900 },
    ])!
    expect(snap.length).toBeGreaterThan(6) // união de vários hexes
    // todo vértice do contorno coincide (0.2px) com um vértice de hex da área
    const todos: Array<{ x: number; y: number }> = []
    for (let c = 40; c <= 52; c++)
      for (let r = 12; r <= 22; r++) todos.push(...atlasHexVertices(c, r))
    for (const p of snap) {
      const perto = todos.some((v) => Math.hypot(v.x - p.x, v.y - p.y) < 0.2)
      expect(perto).toBe(true)
    }
  })

  it('addRegiao salva já alinhada (hexAligned) e normalize converte as antigas', () => {
    const r = regiaoSobreKrasnogor()
    expect(r.hexAligned).toBe(true)
    // injeta uma região "antiga" (traço livre) direto no storage e normaliza
    const cur = getMapaAtlas()
    window.localStorage.setItem(
      'pleitost.mapaAtlas',
      JSON.stringify({
        ...cur,
        regioes: [
          ...cur.regioes,
          { id: 'r-antiga', nome: 'Antiga', pontos: [{ x: 4300, y: 2300 }, { x: 4900, y: 2300 }, { x: 4900, y: 2900 }, { x: 4300, y: 2900 }] },
        ],
      }),
    )
    __resetMapaAtlasForTests()
    expect(normalizeRegioesToHex()).toBe(true)
    const depois = getMapaAtlas().regioes.find((x) => x.id === 'r-antiga')!
    expect(depois.hexAligned).toBe(true)
    expect(depois.pontos.length).toBeGreaterThan(6)
  })
})
