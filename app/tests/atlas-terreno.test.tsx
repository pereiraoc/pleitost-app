// @vitest-environment jsdom
// TERRENO NO ATLAS (2026-10-07): o mundo se define no Atlas do Compêndio, não
// na Exploração do grupo.
//   • Modo Dev: ✎ TERRENO no mapa do Atlas — pincéis da config; um traço
//     arrastado grava UM rascunho local da nota de terreno; botão do meio
//     arrasta o mapa (não pinta).
//   • Modo Dev: o Atlas mostra o mundo inteiro, sem o overlay do desconhecido.
//   • Modificadores (pra todos) também no Atlas.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { AtlasMapaPage, ATLAS_MAPA_H, ATLAS_MAPA_W } from '../src/components/compendium/AtlasMapaPage'
import { __resetMapaAtlasForTests, __setSeedMapaAtlasForTests, addPin, addRegiao } from '../src/map/mapa-atlas-store'
import { __resetPublishedForTests, __setPublishedForTests } from '../src/data/published-overlay-store'
import { __resetDraftsForTests, allLocalDrafts, localDraftFor } from '../src/data/local-draft-store'
import { __resetSettingsForTests } from '../src/settings'
import { setLiveSession } from '../src/data/session-repo/live-session'
import { atlasHexCenter } from '../src/map/atlas-grid'
import { setActiveContexto } from '../src/data/reskin'
import type { ContextoDef } from '../src/data/context-def'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
const baseCatalog = buildCatalog(manifest)

const KRASNOGOR = 'Atlas/Mundo Livre/Federação Áurea/Pedra Fina/Krasnogor'
const TERRENO_ID = 'Atlas/Mundo Livre/Terreno do Mundo Livre'

const DEF: ContextoDef = {
  id: 'fantasia',
  nome: 'Fantasia',
  fonte: 'Contexto Fantasia.md',
  moeda: { simbolo: 'PO', nome: 'Peças de Ouro' },
  atlas: { raiz: 'Atlas', mapa: null },
  pericias: {},
  reskin: { notas: {}, notasFuturas: {}, termos: {}, excecoes: [] },
  disponibilidade: { padrao: 'disponivel', indisponiveis: [], restritos: {} },
  base: { sempreDisponiveis: [] },
  viagem: {
    padrao: 'normal',
    terrenos: [
      { chave: 'normal', nome: 'Gramado', custo: 1, cor: '#7fb069' },
      { chave: 'dificil', nome: 'Terreno difícil', custo: 2, cor: '#b5835a' },
      { chave: 'muito_dificil', nome: 'Terreno muito difícil', custo: 3, cor: '#8a8a8a' },
      { chave: 'mar', nome: 'Mar', custo: 3, cor: '#4a90c2', agua: true, custoPorMeio: { Barco: 1 } },
    ],
    rotas: [
      { chave: 'estrada', nome: 'Estrada', cor: '#c9a36b', bonus: 1, meios: ['Cavalo', 'Caravana'] },
      { chave: 'rota_maritima', nome: 'Rota marítima', cor: '#ffffff', bonus: 1, meios: ['Barco'] },
    ],
    meios: [
      { nome: 'A pé', icone: '🚶', padrao: true, hexPorDia: 2, em: ['normal', 'dificil', 'muito_dificil'], costa: true },
      { nome: 'Barco', icone: '⛵', padrao: true, hexPorDia: 5, em: ['mar'], costa: true },
    ],
    terreno: 'Terreno do Mundo Livre',
  },
} as ContextoDef

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
  if (!window.PointerEvent) {
    Object.defineProperty(window, 'PointerEvent', { value: window.MouseEvent, configurable: true })
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
  __setSeedMapaAtlasForTests(null)
  __resetMapaAtlasForTests()
  __resetSettingsForTests()
  __resetDraftsForTests()
  __resetPublishedForTests()
  __setPublishedForTests({ [TERRENO_ID]: { frontmatter: { Terreno: {}, Rotas: {} } } })
  setLiveSession(null)
})
afterEach(cleanup)
afterAll(() => {
  setActiveContexto(null)
  __resetSettingsForTests()
})

function ligarDev() {
  window.localStorage.setItem('pleitost.settings.desenvolvedor', 'true')
  __resetSettingsForTests()
}

function renderAtlas(def: ContextoDef | null = DEF) {
  setActiveContexto(def)
  const catalog = { ...baseCatalog, contextoDef: def }
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={['/mapa']}>
        <Routes>
          <Route path="/mapa" element={<AtlasMapaPage />} />
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

const W = 744
const H = (W * ATLAS_MAPA_H) / ATLAS_MAPA_W
function coords(cell: { col: number; row: number }, button = 0) {
  const c = atlasHexCenter(cell.col, cell.row)
  return { clientX: (c.x / ATLAS_MAPA_W) * W, clientY: (c.y / ATLAS_MAPA_H) * H, pointerId: 1, button }
}
async function mapaPronto(container: HTMLElement) {
  await screen.findByAltText('Mapa do mundo')
  const mapa = container.querySelector('[data-mapa]') as HTMLElement
  mapa.getBoundingClientRect = () => ({ left: 0, top: 0, right: W, bottom: H, width: W, height: H, x: 0, y: 0 }) as DOMRect
  return container.querySelector('[data-mapa-viewport]') as HTMLElement
}

describe('pintor de terreno no Atlas (Modo Dev)', () => {
  it('sem Modo Dev não há ✎ TERRENO', async () => {
    const { container } = renderAtlas()
    await mapaPronto(container)
    expect(container.querySelector('[data-pintor-terreno-toggle]')).toBeNull()
  })

  it('sem viagem na config (POA): nem pintor nem modificadores', async () => {
    ligarDev()
    const { container } = renderAtlas({ ...DEF, viagem: undefined } as ContextoDef)
    await mapaPronto(container)
    expect(container.querySelector('[data-pintor-terreno-toggle]')).toBeNull()
    expect(container.querySelector('[data-modificadores-toggle]')).toBeNull()
  })

  it('pincéis da config; um traço arrastado grava UM rascunho com as listas certas', async () => {
    ligarDev()
    const { container } = renderAtlas()
    const vp = await mapaPronto(container)
    await waitFor(() => expect(container.querySelector('[data-pintor-terreno-toggle]')).not.toBeNull())
    fireEvent.click(container.querySelector('[data-pintor-terreno-toggle]')!)
    const barra = container.querySelector('[data-pintor-terreno]')!
    expect([...barra.querySelectorAll('[data-pincel]')].map((b) => b.textContent)).toEqual([
      'Gramado',
      'Terreno difícil',
      'Terreno muito difícil',
      'Mar',
    ])
    expect([...barra.querySelectorAll('[data-pincel-rota]')].map((b) => b.textContent)).toEqual([
      'Estrada',
      'Rota marítima',
    ])
    expect(barra.textContent).toContain('botão do meio move o mapa')
    fireEvent.click(barra.querySelector('[data-pincel="mar"]')!)
    let escritas = 0
    const orig = window.localStorage.setItem.bind(window.localStorage)
    window.localStorage.setItem = (k: string, v: string) => {
      if (k === 'pleitost.compendio.drafts') escritas++
      orig(k, v)
    }
    fireEvent.pointerDown(vp, coords({ col: 60, row: 20 }))
    fireEvent.pointerMove(vp, coords({ col: 60, row: 21 }))
    fireEvent.pointerMove(vp, coords({ col: 60, row: 22 }))
    expect(escritas).toBe(0) // nada gravado no meio do traço
    fireEvent.pointerUp(vp, coords({ col: 60, row: 22 }))
    window.localStorage.setItem = orig
    expect(escritas).toBe(1)
    const fm = localDraftFor(TERRENO_ID)!.frontmatter as { Terreno: Record<string, string[]> }
    expect(fm.Terreno.mar).toEqual(['60,20', '60,21', '60,22'])
    expect(Object.keys(allLocalDrafts())).toEqual([TERRENO_ID])
    await waitFor(() => expect(container.querySelector('[data-terreno-tinta="mar"]')).not.toBeNull())
  })

  it('pincel de ROTA grava a camada `Rotas`; Limpar tira o terreno do toque', async () => {
    ligarDev()
    __setPublishedForTests({ [TERRENO_ID]: { frontmatter: { Terreno: { dificil: ['60,21', '60,22'] }, Rotas: {} } } })
    const { container } = renderAtlas()
    const vp = await mapaPronto(container)
    await waitFor(() => expect(container.querySelector('[data-pintor-terreno-toggle]')).not.toBeNull())
    fireEvent.click(container.querySelector('[data-pintor-terreno-toggle]')!)
    fireEvent.click(container.querySelector('[data-pincel-rota="estrada"]')!)
    fireEvent.pointerDown(vp, coords({ col: 60, row: 21 }))
    fireEvent.pointerUp(vp, coords({ col: 60, row: 21 }))
    fireEvent.click(container.querySelector('[data-pincel-limpar]')!)
    fireEvent.pointerDown(vp, coords({ col: 60, row: 22 }))
    fireEvent.pointerUp(vp, coords({ col: 60, row: 22 }))
    fireEvent.click(vp, coords({ col: 60, row: 22 }))
    const fm = localDraftFor(TERRENO_ID)!.frontmatter as { Terreno: Record<string, string[]>; Rotas: Record<string, string[]> }
    expect(fm.Rotas.estrada).toEqual(['60,21'])
    expect(fm.Terreno.dificil).toEqual(['60,21'])
    // clique durante a pintura não abre info do hex
    expect(container.querySelector('[data-hex-selecionado]')).toBeNull()
  })

  it('botão do MEIO arrasta o mapa e não pinta', async () => {
    ligarDev()
    const { container } = renderAtlas()
    const vp = await mapaPronto(container)
    await waitFor(() => expect(container.querySelector('[data-pintor-terreno-toggle]')).not.toBeNull())
    fireEvent.click(container.querySelector('[data-pintor-terreno-toggle]')!)
    fireEvent.click(container.querySelector('[data-pincel="mar"]')!)
    // Firefox: mousedown do meio não abre a rolagem automática
    const md = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 1 })
    vp.dispatchEvent(md)
    expect(md.defaultPrevented).toBe(true)
    const antes = (container.querySelector('[data-mapa]') as HTMLElement).style.transform
    fireEvent.pointerDown(vp, coords({ col: 60, row: 20 }, 1))
    fireEvent.pointerMove(vp, coords({ col: 64, row: 24 }, 1))
    fireEvent.pointerUp(vp, coords({ col: 64, row: 24 }, 1))
    expect(localDraftFor(TERRENO_ID)).toBeFalsy()
    await waitFor(() =>
      expect((container.querySelector('[data-mapa]') as HTMLElement).style.transform).not.toBe(antes),
    )
  })
})

describe('Atlas no Modo Dev: mundo inteiro, sem o desconhecido', () => {
  function regiaoQuadrada() {
    return addRegiao('Norte', [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 1000, y: 1000 },
      { x: 0, y: 1000 },
    ])!
  }

  it('sem Modo Dev: região desconhecida coberta e pin de dentro some', async () => {
    regiaoQuadrada()
    addPin(KRASNOGOR, 500, 500)
    renderAtlas()
    await screen.findByAltText('Mapa do mundo')
    expect(document.querySelector('[data-overlay-desabilitado]')).toBeTruthy()
    expect(document.querySelector(`[data-pin="${KRASNOGOR}"]`)).toBeNull()
  })

  it('Modo Dev: sem overlay, mapa visível, pin de dentro aparece', async () => {
    ligarDev()
    regiaoQuadrada()
    addPin(KRASNOGOR, 500, 500)
    renderAtlas()
    await screen.findByAltText('Mapa do mundo')
    expect(document.querySelector('[data-overlay-desabilitado]')).toBeNull()
    expect(document.querySelector('[data-mapa-preparando]')).toBeNull()
    expect((document.querySelector('[data-mapa] img') as HTMLImageElement).style.visibility).toBe('visible')
    expect(document.querySelector(`[data-pin="${KRASNOGOR}"]`)).toBeTruthy()
  })
})

describe('modificadores no Atlas', () => {
  it('botão nos controles; ligar mostra as marcas + legenda com os nomes da config', async () => {
    __setPublishedForTests({ [TERRENO_ID]: { frontmatter: { Terreno: { muito_dificil: ['60,21'] }, Rotas: {} } } })
    const { container } = renderAtlas()
    await mapaPronto(container)
    const btn = await waitFor(() => {
      const b = container.querySelector('[data-modificadores-toggle]')
      expect(b).not.toBeNull()
      return b!
    })
    expect(container.querySelector('[data-marca-mapa]')).toBeNull()
    fireEvent.click(btn)
    await waitFor(() => expect(container.querySelector('[data-marca-mapa]')).not.toBeNull())
    expect(container.querySelector('[data-modificadores-legenda]')!.textContent).toContain('Terreno muito difícil')
  })
})
