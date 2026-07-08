// @vitest-environment jsdom
// AUTORIA DO MAPA DE HEXCRAWL (issue #67): a aba Hexploração da ficha de
// Localização habilita na nota-raiz da região com mapa (Mundo Livre), e o
// editor associa hexes da grade real a Localizações reais do Atlas. Integração
// no padrão do repo: fetch stubado lê os JSONs REAIS do disco, catálogo real,
// grade calibrada de exploracao.ts; expectativas recomputadas do manifest.
// Cliques no mapa simulados com getBoundingClientRect mockado (jsdom não faz
// layout); "reload" = zerar a memória do store mantendo o window.localStorage.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { DocView } from '../src/components/compendium/DocPage'
import { locationHasHexMap } from '../src/components/compendium/LocationSheet'
import { REGION_MAPS, regionMapById, regionMapForDoc } from '../src/data/region-maps'
import {
  __resetHexMapStoreMemoryForTests,
  areaAt,
  areaIdsInMap,
  cellAt,
  cellsByLocal,
  cellsOfArea,
  getHexMapState,
  removeArea,
  removeHex,
  removeHexArea,
  setHexArea,
  setHexAreaBulk,
  setHexLocal,
} from '../src/data/hexmap-store'
import { listLocalizacoes } from '../src/rules/naturalidade'
import {
  fracToHex,
  hexCenter,
  hexesInPolygon,
  hexUnionPath,
  MAP_H,
  MAP_W,
  pixelToHex,
  pointInPolygon,
} from '../src/grupo/exploracao'
import { docPath } from '../src/paths'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

const readDoc = (id: string): VaultDoc =>
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8')) as VaultDoc

const REGION_ID = 'Atlas/Mundo Livre/Mundo Livre'
const STORE_KEY = `pleitost.hexMap.${REGION_ID}`
const mundoLivre = readDoc(REGION_ID)
const cantoAlto = readDoc('Atlas/Mundo Livre/Principado das Flores/Canto Alto')
const KRASNOGOR_ID = 'Atlas/Mundo Livre/Federação Áurea/Pedra Fina/Krasnogor'
const LICIAE_ID = 'Atlas/Mundo Livre/Federação Áurea/Campos do Provento/Líciae'
const NACAO_ID = 'Atlas/Mundo Livre/Principado das Flores/Principado das Flores'
const POI_ID = 'Atlas/Mundo Livre/Pátria Aurora/Magna Vigilia'

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
    const url = String(input)
    const rel = decodeURIComponent(url.replace(/^\/vault-data\//, ''))
    const file = path.join(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return {
      ok,
      status: ok ? 200 : 404,
      json: async () => JSON.parse(fs.readFileSync(file, 'utf8')),
    }
  }) as typeof fetch
})

beforeEach(() => {
  window.localStorage.clear()
  __resetHexMapStoreMemoryForTests()
})
afterEach(cleanup)

function renderDoc(doc: VaultDoc) {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter>
        <DocView doc={doc} />
      </MemoryRouter>
    </CatalogProvider>,
  )
}

/** jsdom não faz layout: fixa o rect do wrapper do mapa pra converter
 *  clientX/Y em frações da imagem. */
function mockMapaRect(container: HTMLElement, width = 400, height = 540) {
  const mapa = container.querySelector('[data-mapa]') as HTMLElement
  expect(mapa).toBeTruthy()
  mapa.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: width, bottom: height, width, height, x: 0, y: 0 }) as DOMRect
  return mapa
}

const esperaMapa = async (container: HTMLElement) =>
  waitFor(() => expect(container.querySelector('[data-mapa]')).toBeTruthy())

/** Coordenadas de cliente que caem no CENTRO da célula (col,row) com o rect
 *  mockado — reproduz o clique real atravessando o SVG pointer-events:none. */
function clientOfCell(cell: { col: number; row: number }, width = 400, height = 540) {
  const c = hexCenter(cell.col, cell.row)
  return { clientX: (c.x / MAP_W) * width, clientY: (c.y / MAP_H) * height }
}

// ── Registro de mapas por região (fonte de verdade, sem inventar) ──────────
describe('region-maps (fonte de verdade de "tem mapa")', () => {
  it('a região do Mundo Livre existe no catálogo e aponta o asset REAL', () => {
    // a nota-raiz é uma Localização real, subcategoria Região
    expect(mundoLivre.type).toBe('Localização')
    expect(mundoLivre.subtype).toBe('Região')
    const rm = regionMapById(REGION_ID)
    expect(rm).not.toBeNull()
    // asset real: existe no manifest de assets (byPath do dev server)
    const assets = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'assets.json'), 'utf8')) as {
      assets: { path: string }[]
    }
    expect(assets.assets.some((a) => a.path === rm!.mapAsset)).toBe(true)
    // e a nota-raiz de fato embute esse mapa no corpo (não inventado)
    expect(mundoLivre.images.some((i) => i.target === 'Mapa do Mundo Livre.png')).toBe(true)
  })

  it('regionMapForDoc casa por id do doc; outras Localizações não têm mapa', () => {
    expect(regionMapForDoc(mundoLivre)?.regionId).toBe(REGION_ID)
    // Canto Alto é Capital (não é raiz de região com mapa)
    expect(regionMapForDoc(cantoAlto)).toBeNull()
  })

  it('locationHasHexMap habilita SÓ na nota-raiz com mapa', () => {
    expect(locationHasHexMap(mundoLivre)).toBe(true)
    expect(locationHasHexMap(cantoAlto)).toBe(false)
  })
})

// ── Store pleitost.hexMap.<regiao> (padrão group-store/hero-store) ─────────
describe('hexmap-store (namespace pleitost.hexMap.<regiao>)', () => {
  it('associa/re-associa/remove gravam NA HORA; remount relê', () => {
    const c = setHexLocal(REGION_ID, 5, 12, KRASNOGOR_ID)
    expect(c).toEqual({ col: 5, row: 12, localId: KRASNOGOR_ID })
    expect(getHexMapState(REGION_ID).cells).toEqual([c])
    // gravação imediata na chave da REGIÃO
    const salvo = JSON.parse(window.localStorage.getItem(STORE_KEY)!)
    expect(salvo.cells).toEqual([c])

    // re-associar a MESMA célula sobrescreve (não duplica)
    const c2 = setHexLocal(REGION_ID, 5, 12, LICIAE_ID)
    expect(c2.localId).toBe(LICIAE_ID)
    expect(getHexMapState(REGION_ID).cells).toEqual([c2])

    // "reload": zera a memória, o localStorage rehidrata
    __resetHexMapStoreMemoryForTests()
    expect(getHexMapState(REGION_ID).cells[0].localId).toBe(LICIAE_ID)

    removeHex(REGION_ID, 5, 12)
    expect(getHexMapState(REGION_ID).cells).toEqual([])
    // sem células → chave removida (espelha o hasEdits do hero-store)
    expect(window.localStorage.getItem(STORE_KEY)).toBeNull()
  })

  it('cellAt localiza por (col,row); cellsByLocal indexa por localId', () => {
    setHexLocal(REGION_ID, 3, 3, KRASNOGOR_ID)
    setHexLocal(REGION_ID, 4, 4, LICIAE_ID)
    const cells = getHexMapState(REGION_ID).cells
    expect(cellAt(cells, 3, 3)!.localId).toBe(KRASNOGOR_ID)
    expect(cellAt(cells, 9, 9)).toBeNull()
    const byLocal = cellsByLocal(cells)
    expect(byLocal.get(KRASNOGOR_ID)).toEqual({ col: 3, row: 3, localId: KRASNOGOR_ID })
    expect(byLocal.has(LICIAE_ID)).toBe(true)
  })

  it('descarta células malformadas do localStorage', () => {
    window.localStorage.setItem(
      STORE_KEY,
      JSON.stringify({ cells: [{ col: 1, row: 1 }, { col: 2, row: 2, localId: KRASNOGOR_ID }] }),
    )
    expect(getHexMapState(REGION_ID).cells).toEqual([{ col: 2, row: 2, localId: KRASNOGOR_ID }])
  })

  it('namespaces por região são independentes', () => {
    setHexLocal('regiao-a', 1, 1, KRASNOGOR_ID)
    expect(getHexMapState('regiao-b').cells).toEqual([])
    expect(window.localStorage.getItem('pleitost.hexMap.regiao-a')).toBeTruthy()
    expect(window.localStorage.getItem('pleitost.hexMap.regiao-b')).toBeNull()
  })
})

// ── pixel → hex → localização determinístico ───────────────────────────────
describe('pixel → hex → localização (determinístico)', () => {
  it('o pixel do centro resolve à célula e à Localização mapeada nela', () => {
    const cell = pixelToHex(1200, 2400)
    setHexLocal(REGION_ID, cell.col, cell.row, KRASNOGOR_ID)
    const c = hexCenter(cell.col, cell.row)
    // qualquer pixel dentro do hex volta pra mesma célula → mesma Localização
    for (const [dx, dy] of [[0, 0], [20, -15], [-25, 18]] as const) {
      const back = pixelToHex(c.x + dx, c.y + dy)
      expect(back).toEqual(cell)
      expect(cellAt(getHexMapState(REGION_ID).cells, back.col, back.row)!.localId).toBe(KRASNOGOR_ID)
    }
    // fração do mapa → célula (fracToHex compõe MAP_W/H)
    expect(fracToHex(1200 / MAP_W, 2400 / MAP_H)).toEqual(cell)
  })
})

// ── Lista filtrável = Localizações REAIS do catálogo ───────────────────────
describe('editor: lista filtrável das Localizações reais', () => {
  it('lista as 47 Localizações reais; filtro por nome retorna as certas', () => {
    renderDoc(mundoLivre)
    fireEvent.click(screen.getByRole('tab', { name: 'Hexploração' }))
    fireEvent.click(screen.getByText('ADICIONAR HEXPLORAÇÃO'))

    const lista = document.querySelector('[data-hex-lista]') as HTMLElement
    const universo = listLocalizacoes(catalog)
    // todas as Localizações reais aparecem como itens (mesmo universo do scan)
    const itens = lista.querySelectorAll('[data-local-item]')
    expect(itens.length).toBe(universo.length)
    expect(universo.length).toBe(47)
    // filtro por nome real ("Kras…") retorna só o Krasnogor
    fireEvent.change(within(lista).getByLabelText('Filtrar Localização'), {
      target: { value: 'kras' },
    })
    const filtrados = lista.querySelectorAll('[data-local-item]')
    expect(filtrados.length).toBe(1)
    expect((filtrados[0] as HTMLElement).getAttribute('data-local-item')).toBe(KRASNOGOR_ID)
    // filtro sem match → sem resultados
    fireEvent.change(within(lista).getByLabelText('Filtrar Localização'), {
      target: { value: 'zzzz' },
    })
    expect(within(lista).getByText('SEM RESULTADOS')).toBeTruthy()
  })
})

// ── Editor: habilita a aba, marca/arrasta, persiste, remove ────────────────
describe('aba Hexploração na nota-raiz da região (Mundo Livre)', () => {
  it('a aba habilita; o CTA "Adicionar Hexploração" abre o editor', async () => {
    const { container } = renderDoc(mundoLivre)
    const hex = screen.getByRole('tab', { name: 'Hexploração' }) as HTMLButtonElement
    expect(hex.disabled).toBe(false)
    fireEvent.click(hex)
    // sem mapeamentos ainda → onboarding
    const cta = screen.getByText('ADICIONAR HEXPLORAÇÃO')
    expect(cta).toBeTruthy()
    fireEvent.click(cta)
    // editor abre (a lista aparece já; o mapa entra quando o asset resolve)
    expect(container.querySelector('[data-hex-lista]')).toBeTruthy()
    await esperaMapa(container)
    expect(container.querySelector('[data-mapa-viewport]')).toBeTruthy()
  })

  it('MARCAR por clique: seleciona Localização na lista + clica no hex → associa e persiste', async () => {
    const { container } = renderDoc(mundoLivre)
    fireEvent.click(screen.getByRole('tab', { name: 'Hexploração' }))
    fireEvent.click(screen.getByText('ADICIONAR HEXPLORAÇÃO'))
    await esperaMapa(container)
    const mapa = mockMapaRect(container)

    // seleciona o Krasnogor na lista (pendente)
    fireEvent.click(container.querySelector(`[data-local-item="${KRASNOGOR_ID}"]`) as HTMLElement)
    // clica num hex → associa
    const cell = fracToHex(0.25, 0.5)
    fireEvent.click(mapa, clientOfCell(cell))

    const cells = getHexMapState(REGION_ID).cells
    expect(cells).toEqual([{ col: cell.col, row: cell.row, localId: KRASNOGOR_ID }])
    // hex mapeado desenhado com o nome do lugar (fonte de verdade = catálogo)
    const poly = container.querySelector(`[data-hex="${cell.col},${cell.row}"]`) as SVGPolygonElement
    expect(poly.getAttribute('data-local')).toBe(KRASNOGOR_ID)
    const g = poly.parentElement as unknown as SVGGElement
    expect(within(g as unknown as HTMLElement).getByText('Krasnogor')).toBeTruthy()
    // persiste na chave da região
    expect(JSON.parse(window.localStorage.getItem(STORE_KEY)!).cells).toEqual(cells)
  })

  it('ARRASTAR uma Localização da lista pra cima de um hex associa', async () => {
    const { container } = renderDoc(mundoLivre)
    fireEvent.click(screen.getByRole('tab', { name: 'Hexploração' }))
    fireEvent.click(screen.getByText('ADICIONAR HEXPLORAÇÃO'))
    await esperaMapa(container)
    const mapa = mockMapaRect(container)

    const item = container.querySelector(`[data-local-item="${LICIAE_ID}"]`) as HTMLElement
    // DataTransfer simulado (jsdom não popula): armazena o payload
    const store = new Map<string, string>()
    const dataTransfer = {
      setData: (t: string, v: string) => void store.set(t, v),
      getData: (t: string) => store.get(t) ?? '',
      effectAllowed: '',
      dropEffect: '',
    } as unknown as DataTransfer
    fireEvent.dragStart(item, { dataTransfer })
    const cell = fracToHex(0.6, 0.4)
    const { clientX, clientY } = clientOfCell(cell)
    const viewport = container.querySelector('[data-mapa-viewport]') as HTMLElement
    // jsdom não constrói DragEvent (perde clientX/Y): dispara um MouseEvent
    // type="drop" com as coordenadas — no browser DragEvent extends MouseEvent
    // e carrega clientX/Y naturalmente. dataTransfer anexado à mão.
    const dropEvt = new MouseEvent('drop', { bubbles: true, cancelable: true, clientX, clientY })
    Object.defineProperty(dropEvt, 'dataTransfer', { value: dataTransfer })
    viewport.dispatchEvent(dropEvt)

    expect(getHexMapState(REGION_ID).cells).toEqual([
      { col: cell.col, row: cell.row, localId: LICIAE_ID },
    ])
  })

  it('hex mapeado abre o detalhe (ABRIR DOC + ×) e o × remove; persiste vazio', async () => {
    setHexLocal(REGION_ID, 6, 6, KRASNOGOR_ID)
    const { container } = renderDoc(mundoLivre)
    fireEvent.click(screen.getByRole('tab', { name: 'Hexploração' }))
    // já tem mapeamento → editor direto (sem CTA)
    expect(screen.queryByText('ADICIONAR HEXPLORAÇÃO')).toBeNull()
    await esperaMapa(container)
    const mapa = mockMapaRect(container)

    // clica no hex mapeado → detalhe com nome + link
    fireEvent.click(mapa, clientOfCell({ col: 6, row: 6 }))
    const detalhe = container.querySelector('[data-hex-detalhe]') as HTMLElement
    expect(within(detalhe).getByText('Krasnogor')).toBeTruthy()
    expect((within(detalhe).getByText('ABRIR DOC') as HTMLAnchorElement).getAttribute('href')).toBe(
      docPath(KRASNOGOR_ID),
    )
    // × remove a associação e limpa o store
    fireEvent.click(within(detalhe).getByLabelText('Remover associação'))
    expect(getHexMapState(REGION_ID).cells).toEqual([])
    expect(container.querySelector('[data-hex]')).toBeNull()
    expect(window.localStorage.getItem(STORE_KEY)).toBeNull()
  })

  it('re-associar um hex já mapeado: clicar de novo com outra Localização sobrescreve', async () => {
    setHexLocal(REGION_ID, 8, 8, KRASNOGOR_ID)
    const { container } = renderDoc(mundoLivre)
    fireEvent.click(screen.getByRole('tab', { name: 'Hexploração' }))
    await esperaMapa(container)
    const mapa = mockMapaRect(container)
    // seleciona Líciae na lista e clica no hex já do Krasnogor → sobrescreve
    fireEvent.click(container.querySelector(`[data-local-item="${LICIAE_ID}"]`) as HTMLElement)
    fireEvent.click(mapa, clientOfCell({ col: 8, row: 8 }))
    expect(getHexMapState(REGION_ID).cells).toEqual([{ col: 8, row: 8, localId: LICIAE_ID }])
  })
})

// ── Persistência com remount (reload) ──────────────────────────────────────
describe('persistência do mapa (reload)', () => {
  it('mapeamento sobrevive ao remount + reset da memória', async () => {
    const r = renderDoc(mundoLivre)
    fireEvent.click(screen.getByRole('tab', { name: 'Hexploração' }))
    fireEvent.click(screen.getByText('ADICIONAR HEXPLORAÇÃO'))
    await esperaMapa(r.container)
    const mapa = mockMapaRect(r.container)
    fireEvent.click(r.container.querySelector(`[data-local-item="${KRASNOGOR_ID}"]`) as HTMLElement)
    const cell = fracToHex(0.4, 0.6)
    fireEvent.click(mapa, clientOfCell(cell))
    expect(getHexMapState(REGION_ID).cells.length).toBe(1)

    // "reload": desmonta, zera a memória, MANTÉM o localStorage
    r.unmount()
    __resetHexMapStoreMemoryForTests()
    const r2 = renderDoc(mundoLivre)
    fireEvent.click(screen.getByRole('tab', { name: 'Hexploração' }))
    await esperaMapa(r2.container)
    const poly = r2.container.querySelector('[data-hex]') as SVGPolygonElement
    expect(poly.getAttribute('data-hex')).toBe(`${cell.col},${cell.row}`)
    expect(poly.getAttribute('data-local')).toBe(KRASNOGOR_ID)
  })
})

// ── Sanidade do registro (não regride o universo) ──────────────────────────
describe('REGION_MAPS', () => {
  it('só o Mundo Livre por ora; toda entrada aponta um doc real', () => {
    expect(REGION_MAPS.map((m) => m.regionId)).toEqual([REGION_ID])
    for (const m of REGION_MAPS) expect(catalog.entryById.has(m.regionId)).toBe(true)
  })
})

// ── ÁREAS: marcação em massa ORTOGONAL ao lugar (#79) ──────────────────────
describe('hexmap-store: áreas (Região/Nação/POI) sem apagar lugares', () => {
  it('dados ANTIGOS {col,row,localId} carregam intactos (retrocompat)', () => {
    window.localStorage.setItem(STORE_KEY, JSON.stringify({ cells: [{ col: 2, row: 3, localId: KRASNOGOR_ID }] }))
    expect(getHexMapState(REGION_ID).cells).toEqual([{ col: 2, row: 3, localId: KRASNOGOR_ID }])
  })

  it('marcar ÁREA num hex NÃO apaga o LUGAR já marcado (e vice-versa)', () => {
    setHexLocal(REGION_ID, 5, 5, KRASNOGOR_ID)
    setHexArea(REGION_ID, 5, 5, NACAO_ID)
    const cell = cellAt(getHexMapState(REGION_ID).cells, 5, 5)!
    expect(cell.localId).toBe(KRASNOGOR_ID)
    expect(cell.areaId).toBe(NACAO_ID)
    // remover o LUGAR mantém a ÁREA (célula sobrevive só com área)
    removeHex(REGION_ID, 5, 5)
    const c2 = cellAt(getHexMapState(REGION_ID).cells, 5, 5)!
    expect(c2.localId).toBeUndefined()
    expect(c2.areaId).toBe(NACAO_ID)
    // remover a ÁREA agora esvazia a célula
    removeHexArea(REGION_ID, 5, 5)
    expect(getHexMapState(REGION_ID).cells).toEqual([])
  })

  it('setHexAreaBulk marca vários hexes num commit e reassocia de outra área', () => {
    const targets = [
      { col: 1, row: 1 },
      { col: 2, row: 2 },
      { col: 3, row: 3 },
    ]
    setHexAreaBulk(REGION_ID, targets, NACAO_ID)
    expect(cellsOfArea(getHexMapState(REGION_ID).cells, NACAO_ID).length).toBe(3)
    expect(areaAt(getHexMapState(REGION_ID).cells, 2, 2)).toBe(NACAO_ID)
    // reassociar 1 hex a OUTRA área move-o (não duplica)
    setHexArea(REGION_ID, 2, 2, POI_ID)
    expect(cellsOfArea(getHexMapState(REGION_ID).cells, NACAO_ID).length).toBe(2)
    expect(cellsOfArea(getHexMapState(REGION_ID).cells, POI_ID).length).toBe(1)
    expect(areaIdsInMap(getHexMapState(REGION_ID).cells).sort()).toEqual([NACAO_ID, POI_ID].sort())
  })

  it('removeArea apaga a área inteira mas PRESERVA os lugares dos hexes dela', () => {
    setHexAreaBulk(REGION_ID, [{ col: 7, row: 7 }, { col: 8, row: 8 }], NACAO_ID)
    setHexLocal(REGION_ID, 7, 7, KRASNOGOR_ID) // este hex tem lugar + área
    removeArea(REGION_ID, NACAO_ID)
    const cells = getHexMapState(REGION_ID).cells
    // 8,8 (só área) some; 7,7 (tinha lugar) sobra só com o lugar
    expect(cellsOfArea(cells, NACAO_ID)).toEqual([])
    expect(cellAt(cells, 8, 8)).toBeNull()
    expect(cellAt(cells, 7, 7)).toEqual({ col: 7, row: 7, localId: KRASNOGOR_ID })
  })

  it('célula só-de-área persiste e rehidrata após reload', () => {
    setHexArea(REGION_ID, 4, 9, POI_ID)
    __resetHexMapStoreMemoryForTests()
    const cell = cellAt(getHexMapState(REGION_ID).cells, 4, 9)!
    expect(cell.areaId).toBe(POI_ID)
    expect(cell.localId).toBeUndefined()
  })
})

// ── Geometria de polígono/laço (#79) ───────────────────────────────────────
describe('geometria: pointInPolygon / hexesInPolygon / hexUnionPath', () => {
  it('pointInPolygon acerta dentro/fora de um quadrado', () => {
    const sq = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]
    expect(pointInPolygon({ x: 5, y: 5 }, sq)).toBe(true)
    expect(pointInPolygon({ x: 15, y: 5 }, sq)).toBe(false)
    expect(pointInPolygon({ x: -1, y: 5 }, sq)).toBe(false)
  })

  it('hexesInPolygon seleciona SÓ as células cujo centro cai dentro', () => {
    const c = pixelToHex(1000, 1000)
    const ct = hexCenter(c.col, c.row)
    // quadradinho de ±20px em torno do centro: só ESSA célula (vizinhos ≥64px)
    const poly = [
      { x: ct.x - 20, y: ct.y - 20 },
      { x: ct.x + 20, y: ct.y - 20 },
      { x: ct.x + 20, y: ct.y + 20 },
      { x: ct.x - 20, y: ct.y + 20 },
    ]
    expect(hexesInPolygon(poly)).toEqual([c])
    // polígono degenerado (< 3 pontos) → vazio
    expect(hexesInPolygon([{ x: 0, y: 0 }])).toEqual([])
  })

  it('hexUnionPath compõe um subpath fechado por hex', () => {
    const d = hexUnionPath([{ col: 0, row: 0 }, { col: 1, row: 0 }])
    expect((d.match(/Z/g) ?? []).length).toBe(2)
    expect(d.startsWith('M')).toBe(true)
  })
})

// ── Editor: MODO Regiões (marcar áreas por toque; #79) ──────────────────────
describe('editor: modo Lugares × Regiões', () => {
  it('o seletor de modo troca a lista e o rótulo do filtro', () => {
    renderDoc(mundoLivre)
    fireEvent.click(screen.getByRole('tab', { name: 'Hexploração' }))
    fireEvent.click(screen.getByText('ADICIONAR HEXPLORAÇÃO'))
    const lista = document.querySelector('[data-hex-lista]') as HTMLElement
    // default = Lugares: as 47 Localizações; filtro "Localização"
    expect(lista.querySelectorAll('[data-local-item]').length).toBe(47)
    expect(within(lista).getByLabelText('Filtrar Localização')).toBeTruthy()
    // troca pra Regiões → só Região/Nação/POI (5+4+19 = 28); filtro "Área"
    fireEvent.click(document.querySelector('[data-modo-regioes]') as HTMLElement)
    expect(lista.querySelectorAll('[data-area-item]').length).toBe(28)
    expect(within(lista).getByLabelText('Filtrar Área')).toBeTruthy()
    expect(lista.querySelector(`[data-area-item="${NACAO_ID}"]`)).toBeTruthy()
  })

  it('modo Regiões: selecionar a Nação e tocar hexes marca a ÁREA (um por um)', async () => {
    const { container } = renderDoc(mundoLivre)
    fireEvent.click(screen.getByRole('tab', { name: 'Hexploração' }))
    fireEvent.click(screen.getByText('ADICIONAR HEXPLORAÇÃO'))
    await esperaMapa(container)
    const mapa = mockMapaRect(container)
    fireEvent.click(document.querySelector('[data-modo-regioes]') as HTMLElement)
    fireEvent.click(container.querySelector(`[data-area-item="${NACAO_ID}"]`) as HTMLElement)
    // toca dois hexes → ambos entram na área, UM único doc de área desenhado
    const a = fracToHex(0.3, 0.4)
    const b = fracToHex(0.35, 0.45)
    fireEvent.click(mapa, clientOfCell(a))
    fireEvent.click(mapa, clientOfCell(b))
    const cells = getHexMapState(REGION_ID).cells
    expect(areaAt(cells, a.col, a.row)).toBe(NACAO_ID)
    expect(areaAt(cells, b.col, b.row)).toBe(NACAO_ID)
    expect(container.querySelector(`[data-area="${NACAO_ID}"]`)).toBeTruthy()
    // tocar de novo o mesmo hex DESMARCA (toggle)
    fireEvent.click(mapa, clientOfCell(a))
    expect(areaAt(getHexMapState(REGION_ID).cells, a.col, a.row)).toBeNull()
  })

  it('marcar área num hex que JÁ tem lugar preserva o lugar (ortogonal)', async () => {
    setHexLocal(REGION_ID, 10, 10, KRASNOGOR_ID)
    const { container } = renderDoc(mundoLivre)
    fireEvent.click(screen.getByRole('tab', { name: 'Hexploração' }))
    await esperaMapa(container)
    const mapa = mockMapaRect(container)
    fireEvent.click(document.querySelector('[data-modo-regioes]') as HTMLElement)
    fireEvent.click(container.querySelector(`[data-area-item="${POI_ID}"]`) as HTMLElement)
    fireEvent.click(mapa, clientOfCell({ col: 10, row: 10 }))
    const cell = cellAt(getHexMapState(REGION_ID).cells, 10, 10)!
    expect(cell.localId).toBe(KRASNOGOR_ID)
    expect(cell.areaId).toBe(POI_ID)
  })

  it('o mapa tem o botão de TELA CHEIA (#80)', async () => {
    const { container } = renderDoc(mundoLivre)
    fireEvent.click(screen.getByRole('tab', { name: 'Hexploração' }))
    fireEvent.click(screen.getByText('ADICIONAR HEXPLORAÇÃO'))
    await esperaMapa(container)
    expect(container.querySelector('[data-fullscreen-toggle]')).toBeTruthy()
    expect(container.querySelector('[data-zoom-in]')).toBeTruthy()
  })
})
