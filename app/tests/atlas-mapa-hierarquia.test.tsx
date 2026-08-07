// @vitest-environment jsdom
// Mapa do mundo #425 — painel do mestre reestruturado (pedido do mestre):
//   • a seção do gating por grupo agora se chama "MAPAS";
//   • autoria de PIN saiu (lugares viraram o hexmap mapa:mundo da grade
//     calibrada) — sobra só a lista de PINS LEGADOS pra limpeza;
//   • ATLAS NO MAPA: a hierarquia COMPLETA de Localização com status por item
//     (🟢 definido no hexmap / 🔴 ainda fora) e edição direto da lista —
//     📍 define/MOVE o hex do lugar, ⬡ pinta/despinta a área (capacidades do
//     editor do Mundo Livre, agora no mapa-múndi).
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { AtlasMapaPage } from '../src/components/compendium/AtlasMapaPage'
import { atlasHexCenter } from '../src/map/atlas-grid'
import { MAPA_MUNDO_ID } from '../src/data/seed-hexmaps'
import {
  __resetHexMapStoreMemoryForTests,
  cellAt,
  cellsByLocal,
  getHexMapState,
  hexHasArea,
} from '../src/data/hexmap-store'
import {
  __resetMapaAtlasForTests,
  __setSeedMapaAtlasForTests,
  addRegiao,
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
const CANTO_ALTO = 'Atlas/Mundo Livre/Principado das Flores/Canto Alto'
/** Krasnogor no seed do mapa:mundo (Mundo Livre (2,11) + shift 44,5). */
const KRAS_CELL = { col: 46, row: 16 }

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
  window.localStorage.setItem('pleitost.settings.mestre', 'true')
  __resetSettingsForTests()
  setLiveSession(null)
})
afterEach(() => {
  cleanup()
  setLiveSession(null)
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

/** jsdom sem layout: mocka o rect do mapa (1/10 da fonte) e clica no centro
 *  da célula — idioma do atlas-mapa-hex-420.test. */
function mockRectEClicaHex(container: HTMLElement, cell: { col: number; row: number }) {
  const W = 744
  const H = 526.2
  const mapa = container.querySelector('[data-mapa]') as HTMLElement
  expect(mapa).toBeTruthy()
  mapa.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: W, bottom: H, width: W, height: H, x: 0, y: 0 }) as DOMRect
  const viewport = container.querySelector('[data-mapa-viewport]') as HTMLElement
  const c = atlasHexCenter(cell.col, cell.row)
  fireEvent.click(viewport, { clientX: c.x / 10, clientY: c.y / 10 })
}

describe('#425 — seção MAPAS (era REGIÕES HABILITADAS)', () => {
  it('com região marcada, o gating aparece sob o título MAPAS', async () => {
    addRegiao('Norte', [
      { x: 0, y: 0 },
      { x: 900, y: 0 },
      { x: 900, y: 900 },
      { x: 0, y: 900 },
    ])
    renderMapa()
    await screen.findByAltText('Mapa do mundo')
    expect(screen.getByText('MAPAS')).toBeTruthy()
    expect(screen.queryByText('REGIÕES HABILITADAS')).toBeNull()
  })
})

describe('#425 — ATLAS NO MAPA: hierarquia com status e edição por item', () => {
  it('lista todo o Atlas; Krasnogor 🟢 (hex do seed) e itens ainda fora 🔴', async () => {
    const { container } = renderMapa()
    await screen.findByText('ATLAS NO MAPA')
    const kras = await waitFor(() => {
      const el = container.querySelector(`[data-atlas-item="${KRASNOGOR}"]`)
      expect(el).toBeTruthy()
      return el as HTMLElement
    })
    expect(kras.querySelector('[data-status="definido"]')).toBeTruthy()
    expect(kras.textContent).toContain(`📍 hex ${KRAS_CELL.col},${KRAS_CELL.row}`)
    // Magna Pátria etc. ainda não têm hex — o mestre VÊ o que falta definir
    expect(container.querySelector('[data-status="faltando"]')).toBeTruthy()
  })

  it('📍 define e MOVE o hex do lugar (toque de novo em outro hex)', async () => {
    const { container } = renderMapa()
    await screen.findByText('ATLAS NO MAPA')
    fireEvent.click(await screen.findByLabelText('Definir lugar de Krasnogor'))
    expect(screen.getByText(/Toque no hex onde fica “Krasnogor”/)).toBeTruthy()
    // hex livre fora do Mundo Livre (seed só cobre cols 44+)
    mockRectEClicaHex(container, { col: 20, row: 16 })
    await waitFor(() => {
      const cells = getHexMapState(MAPA_MUNDO_ID).cells
      expect(cellsByLocal(cells).get(KRASNOGOR)).toMatchObject({ col: 20, row: 16 })
      // MOVE: o hex antigo do seed foi liberado
      expect(cellAt(cells, KRAS_CELL.col, KRAS_CELL.row)?.localId).toBeUndefined()
    })
    // segundo toque noutro hex move de novo (um lugar, um hex)
    mockRectEClicaHex(container, { col: 22, row: 16 })
    await waitFor(() => {
      const cells = getHexMapState(MAPA_MUNDO_ID).cells
      expect(cellsByLocal(cells).get(KRASNOGOR)).toMatchObject({ col: 22, row: 16 })
      expect(cellAt(cells, 20, 16)?.localId).toBeUndefined()
    })
  })

  it('barra de info: lugar do hex DESTACADO (NESTE HEX, cor accent) separado das áreas', async () => {
    // célula do seed que tem lugar E áreas — independente da geografia
    const alvo = getHexMapState(MAPA_MUNDO_ID).cells.find((c) => c.localId && c.areaIds?.length)!
    expect(alvo).toBeTruthy()
    const { container } = renderMapa()
    await screen.findByAltText('Mapa do mundo')
    mockRectEClicaHex(container, alvo)
    await waitFor(() => expect(container.querySelector('[data-hex-info]')).toBeTruthy())
    const barra = within(container.querySelector('[data-hex-info]') as HTMLElement)
    // grupo do hex específico: rótulo NESTE HEX + chip destacado com o lugar
    expect(barra.getByText('NESTE HEX')).toBeTruthy()
    const chip = container.querySelector('[data-hex-info-lugar]') as HTMLElement
    expect(chip).toBeTruthy()
    expect(chip.textContent).toContain(alvo.localId!.split('/').pop())
    expect(chip.style.color).toBe('var(--accent)')
    // grupo separado com as áreas/região que englobam o hex (rótulo DENTRO DE)
    expect(barra.getByText('DENTRO DE')).toBeTruthy()
  })

  it('⬡ pinta e despinta hexes da área (toggle por toque)', async () => {
    const { container } = renderMapa()
    await screen.findByText('ATLAS NO MAPA')
    fireEvent.click(await screen.findByLabelText('Pintar área de Canto Alto'))
    expect(screen.getByText(/pintar\/despintar a área “Canto Alto”/)).toBeTruthy()
    mockRectEClicaHex(container, { col: 20, row: 20 })
    await waitFor(() =>
      expect(hexHasArea(getHexMapState(MAPA_MUNDO_ID).cells, 20, 20, CANTO_ALTO)).toBe(true),
    )
    mockRectEClicaHex(container, { col: 20, row: 20 })
    await waitFor(() =>
      expect(hexHasArea(getHexMapState(MAPA_MUNDO_ID).cells, 20, 20, CANTO_ALTO)).toBe(false),
    )
  })
})
