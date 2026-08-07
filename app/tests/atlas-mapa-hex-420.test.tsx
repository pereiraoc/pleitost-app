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
  cellsFromStroke,
  getMapaAtlas,
  normalizeRegioesToHex,
  outlineRingsFromCells,
  toggleRegiaoHabilitada,
  toggleRegiaoHex,
  __setSeedMapaAtlasForTests,
} from '../src/map/mapa-atlas-store'
import { DetailProvider, useDetail } from '../src/data/detail-context'
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

describe('#420 — regiões por HEX INTEIRO (células + contorno derivado)', () => {
  it('desenho livre vira CÉLULAS + contorno cujos vértices são vértices de hex', () => {
    const r = regiaoSobreKrasnogor()
    expect(r.cells.length).toBeGreaterThan(10)
    expect(r.cells).toContainEqual(KRAS_CELL)
    const contorno = r.aneis?.[0] ?? r.pontos
    expect(contorno.length).toBeGreaterThan(6)
    const todos: Array<{ x: number; y: number }> = []
    for (let c = 40; c <= 52; c++)
      for (let rr = 12; rr <= 22; rr++) todos.push(...atlasHexVertices(c, rr))
    for (const p of contorno) {
      const perto = todos.some((v) => Math.hypot(v.x - p.x, v.y - p.y) < 0.2)
      expect(perto).toBe(true)
    }
  })

  it('report "ficou cortado": traço na BORDA esquerda inclui a coluna 0 (centro x≈−2.8)', () => {
    const cells = cellsFromStroke([
      { x: -20, y: 900 },
      { x: 400, y: 900 },
      { x: 400, y: 1500 },
      { x: -20, y: 1500 },
    ])
    expect(cells.some((c) => c.col === 0)).toBe(true)
  })

  it('pintura: toggleRegiaoHex adiciona e remove hex, re-derivando o contorno', () => {
    const r = regiaoSobreKrasnogor()
    const fora = { col: KRAS_CELL.col + 6, row: KRAS_CELL.row }
    toggleRegiaoHex(r.id, fora)
    let atual = getMapaAtlas().regioes.find((x) => x.id === r.id)!
    expect(atual.cells).toContainEqual(fora)
    expect((atual.aneis ?? []).length).toBeGreaterThanOrEqual(2) // blob separado = anel próprio
    toggleRegiaoHex(r.id, fora)
    atual = getMapaAtlas().regioes.find((x) => x.id === r.id)!
    expect(atual.cells).not.toContainEqual(fora)
  })

  it('normalize regrava blob ANTIGO (região sem cells) na forma migrada', () => {
    const cur = getMapaAtlas()
    window.localStorage.setItem(
      'pleitost.mapaAtlas',
      JSON.stringify({
        ...cur,
        regioes: [
          { id: 'r-antiga', nome: 'Antiga', pontos: [{ x: 4300, y: 2300 }, { x: 4900, y: 2300 }, { x: 4900, y: 2900 }, { x: 4300, y: 2900 }] },
        ],
      }),
    )
    __resetMapaAtlasForTests()
    expect(normalizeRegioesToHex()).toBe(true)
    const depois = getMapaAtlas().regioes.find((x) => x.id === 'r-antiga')!
    expect(depois.cells.length).toBeGreaterThan(10)
    expect(normalizeRegioesToHex()).toBe(false) // idempotente
  })

  it('outlineRingsFromCells: célula única vira 1 anel de 6 vértices', () => {
    const aneis = outlineRingsFromCells([KRAS_CELL])
    expect(aneis).toHaveLength(1)
    expect(aneis[0]).toHaveLength(6)
  })
})


describe('feedback — lugar clicado abre nos DETALHES (barra direita), não navega', () => {
  function ProbeDetalhe() {
    const d = useDetail()
    return <div data-target={d?.target?.id ?? ''} />
  }
  it('info do hex → botão do lugar abre no detail-context; a rota não muda', async () => {
    const { container } = render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter initialEntries={['/mapa']}>
          <DetailProvider>
            <Routes>
              <Route path="/mapa" element={<AtlasMapaPage />} />
              <Route path="/doc/*" element={<div data-doc-page="" />} />
            </Routes>
            <ProbeDetalhe />
          </DetailProvider>
        </MemoryRouter>
      </CatalogProvider>,
    )
    await screen.findByAltText('Mapa do mundo')
    mockRectEClicaHex(container, KRAS_CELL)
    await waitFor(() => expect(container.querySelector('[data-hex-info]')).toBeTruthy())
    fireEvent.click(screen.getByText('Krasnogor'))
    expect(
      (document.querySelector('[data-target]') as HTMLElement).getAttribute('data-target'),
    ).toBe(KRASNOGOR)
    expect(container.querySelector('[data-doc-page]')).toBeNull() // NÃO navegou
  })
})


describe('#422 — tap de dedo TREMIDO no celular pinta (touch slop 12px; mouse segue 3px)', () => {
  function setupPaint(container: HTMLElement) {
    const W = 744
    const H = 526.2
    const mapa = container.querySelector('[data-mapa]') as HTMLElement
    mapa.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: W, bottom: H, width: W, height: H, x: 0, y: 0 }) as DOMRect
    return container.querySelector('[data-mapa-viewport]') as HTMLElement
  }

  async function comecaEdicao() {
    window.localStorage.setItem('pleitost.settings.mestre', 'true')
    __resetSettingsForTests()
    const r = regiaoSobreKrasnogor()
    const utils = renderMapa()
    await screen.findByAltText('Mapa do mundo')
    fireEvent.click(screen.getByLabelText('Editar hexes de Pedra Fina Norte'))
    await screen.findByText('✓ CONCLUIR EDIÇÃO')
    return { r, container: utils.container }
  }

  /** jsdom não tem PointerEvent — despacha Event cru com os campos que o
   *  React lê no sintético (pointerId/pointerType/clientX/clientY). */
  function pointer(vp: HTMLElement, type: string, pointerType: string, x: number, y: number) {
    const ev = new Event(type, { bubbles: true }) as unknown as Record<string, unknown>
    ev.pointerId = 1
    ev.pointerType = pointerType
    ev.clientX = x
    ev.clientY = y
    vp.dispatchEvent(ev as unknown as Event)
  }

  it('TOQUE com tremida de 8px: o click não é suprimido e o hex pinta', async () => {
    const { r, container } = await comecaEdicao()
    const antes = getMapaAtlas().regioes.find((x2) => x2.id === r.id)!.cells.length
    const vp = setupPaint(container)
    const alvo = atlasHexCenter(KRAS_CELL.col + 6, KRAS_CELL.row)
    const x = alvo.x / 10
    const y = alvo.y / 10
    pointer(vp, 'pointerdown', 'touch', x, y)
    pointer(vp, 'pointermove', 'touch', x + 6, y + 5)
    pointer(vp, 'pointerup', 'touch', x + 6, y + 5)
    fireEvent.click(vp, { clientX: x + 6, clientY: y + 5 })
    // a tremida (coords de cliente ×10 na fonte) pode cair no hex vizinho —
    // o que importa é o CLICK ter registrado: uma célula nova entrou.
    await waitFor(() => {
      const atual = getMapaAtlas().regioes.find((x2) => x2.id === r.id)!
      expect(atual.cells.length).toBe(antes + 1)
    })
  })

  it('trap reverso: MOUSE arrastando 8px continua suprimindo o click (pan preciso)', async () => {
    const { r, container } = await comecaEdicao()
    const antes = getMapaAtlas().regioes.find((x2) => x2.id === r.id)!.cells.length
    const vp = setupPaint(container)
    const alvo = atlasHexCenter(KRAS_CELL.col + 6, KRAS_CELL.row)
    const x = alvo.x / 10
    const y = alvo.y / 10
    pointer(vp, 'pointerdown', 'mouse', x, y)
    pointer(vp, 'pointermove', 'mouse', x + 6, y + 5)
    pointer(vp, 'pointerup', 'mouse', x + 6, y + 5)
    fireEvent.click(vp, { clientX: x + 6, clientY: y + 5 })
    await new Promise((res) => setTimeout(res, 60))
    const atual = getMapaAtlas().regioes.find((x2) => x2.id === r.id)!
    expect(atual.cells.length).toBe(antes)
  })
})
