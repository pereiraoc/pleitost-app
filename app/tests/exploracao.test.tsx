// @vitest-environment jsdom
// Aba EXPLORAÇÃO do grupo (issue #36; grade hexagonal issue #48): mapa real
// do Mundo Livre + trilha do grupo persistida por grupo
// (`pleitost.groupState.<id>`), agora como HEXES {col,row} de uma grade
// sobreposta e alinhada aos hexágonos da arte. Integração no padrão do repo —
// fetch stubado lê os JSONs REAIS do disco, grupo real e doc de Localização
// real (Krasnogor); expectativas recomputadas AQUI a partir do manifest.
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
import { GrupoView } from '../src/grupo/GrupoView'
import { MAPA_MUNDO_LIVRE } from '../src/grupo/PanelExploracao'
import {
  fracToHex,
  hexCenter,
  hexGridCells,
  hexGridPath,
  hexPolygonPoints,
  hexVertices,
  locaisSelectLines,
  pixelToHex,
  HEX_HSTEP,
  HEX_OFFSET_X,
  HEX_OFFSET_Y,
  HEX_SIZE,
  HEX_VSTEP,
  MAP_H,
  MAP_W,
} from '../src/grupo/exploracao'
import { listLocalizacoes } from '../src/rules/naturalidade'
import {
  __resetGroupStoreMemoryForTests,
  addGroupHex,
  getGroupState,
  hexAt,
  hexAtual,
  insertGroupHex,
  moveGroupHex,
  setAtualHex,
  setRegiaoAtiva,
  removeGroupHex,
  todayISO,
  updateGroupHex,
} from '../src/data/group-store'
import { activeRegionId } from '../src/grupo/PanelExploracao'
import { REGION_MAPS } from '../src/data/region-maps'
import {
  __resetHexMapStoreMemoryForTests,
  getHexMapState,
  setHexLocal,
} from '../src/data/hexmap-store'
import { docPath } from '../src/paths'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

const GROUP_ID = 'Sistema/Criaturas/Grupos de Criaturas/Adriann, Carlos, Kenji, Zuko'
const STORE_KEY = `pleitost.groupState.${GROUP_ID}`
// Doc de Localização REAL do Atlas (Pequena Cidade com imagem no corpo)
const KRASNOGOR_ID = 'Atlas/Mundo Livre/Federação Áurea/Pedra Fina/Krasnogor'

/** Mesmo polyfill do persistencia.test.tsx: vitest 4 + jsdom delega ao
 *  webstorage experimental do Node → window.localStorage vem undefined. */
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
  // jsdom não implementa PointerEvent → o fireEvent.pointerMove cairia num
  // Event genérico SEM clientX/Y; MouseEvent carrega as coordenadas do pan.
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
  __resetGroupStoreMemoryForTests()
  __resetHexMapStoreMemoryForTests()
})
afterEach(cleanup)

const renderGroup = () =>
  render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter>
        <GrupoView groupId={GROUP_ID} />
      </MemoryRouter>
    </CatalogProvider>,
  )

/** jsdom não faz layout: fixa o rect do wrapper do mapa pra converter
 *  clientX/Y em frações da imagem. */
function mockMapaRect(container: HTMLElement, width = 400, height = 540) {
  const mapa = container.querySelector('[data-mapa]') as HTMLElement
  expect(mapa).toBeTruthy()
  mapa.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: width, bottom: height, width, height, x: 0, y: 0 }) as DOMRect
  return mapa
}

const esperaMapa = async (container: HTMLElement) => {
  await waitFor(() => expect(container.querySelector('[data-mapa]')).toBeTruthy())
}

/** O overlay SVG é pointer-events:none: o hit-test é MATEMÁTICO no div do mapa.
 *  Pra "clicar num hex" o clique precisa cair no centro da célula (com o rect
 *  mockado). Reproduz o que um clique real do browser faz atravessando o SVG. */
function clickHex(
  mapa: HTMLElement,
  cell: { col: number; row: number },
  width = 400,
  height = 540,
) {
  fireEvent.click(mapa, clickCoords(cell, width, height))
}

/** Coordenadas de cliente que caem no CENTRO da célula com o rect mockado. */
function clickCoords(cell: { col: number; row: number }, width = 400, height = 540) {
  const c = hexCenter(cell.col, cell.row)
  return { clientX: (c.x / MAP_W) * width, clientY: (c.y / MAP_H) * height }
}

/** Doc real do disco (mesmos JSONs do dev server) — pra expectativas do FM. */
const readDoc = (id: string): VaultDoc =>
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8')) as VaultDoc

// ── Geometria da grade hexagonal (issue #48) — puro e determinístico ──────
describe('grade hexagonal (geometria calibrada flat-top)', () => {
  it('constantes casam com a calibração: size 74, offset (39,122), passos 111/128', () => {
    expect([MAP_W, MAP_H]).toEqual([4352, 5888])
    expect(HEX_SIZE).toBe(74)
    expect([HEX_OFFSET_X, HEX_OFFSET_Y]).toEqual([39, 122])
    expect(HEX_HSTEP).toBe(1.5 * HEX_SIZE) // 111
    expect(HEX_HSTEP).toBeCloseTo(111)
    expect(HEX_VSTEP).toBe(Math.sqrt(3) * HEX_SIZE) // √3·size = altura do hex
    expect(HEX_VSTEP).toBeCloseTo(128, 0) // ≈128
  })

  it('hexCenter: (0,0) na origem; passo horiz 1.5·size; coluna ímpar +meio-hex', () => {
    expect(hexCenter(0, 0)).toEqual({ x: HEX_OFFSET_X, y: HEX_OFFSET_Y })
    // mesma coluna: passo vertical = √3·size
    expect(hexCenter(0, 1).y - hexCenter(0, 0).y).toBeCloseTo(HEX_VSTEP)
    expect(hexCenter(1, 0).x - hexCenter(0, 0).x).toBeCloseTo(HEX_HSTEP)
    // coluna ímpar deslocada meio-hex (≈64) pra baixo (odd-q)
    expect(hexCenter(1, 0).y - hexCenter(0, 0).y).toBeCloseTo(HEX_VSTEP / 2)
  })

  it('hexVertices: flat-top (ponta à direita/esquerda, topo/base planos)', () => {
    const v = hexVertices(3, 5)
    const c = hexCenter(3, 5)
    expect(v.length).toBe(6)
    // vértice 0 = ponta direita (cx+size, cy); vértice 3 = ponta esquerda
    expect(v[0].x).toBeCloseTo(c.x + HEX_SIZE)
    expect(v[0].y).toBeCloseTo(c.y)
    expect(v[3].x).toBeCloseTo(c.x - HEX_SIZE)
    // topo plano: v4 e v5 na mesma altura (aresta horizontal)
    expect(v[4].y).toBeCloseTo(v[5].y)
    expect(v[4].y).toBeCloseTo(c.y - HEX_VSTEP / 2)
  })

  it('pixelToHex é o inverso EXATO de hexCenter (round-trip em várias células)', () => {
    for (const col of [0, 1, 2, 7, 18, 38]) {
      for (const row of [0, 1, 3, 12, 25, 45]) {
        const c = hexCenter(col, row)
        expect(pixelToHex(c.x, c.y)).toEqual({ col, row })
        // um ponto qualquer DENTRO do hex (perto do centro) cai na mesma célula
        expect(pixelToHex(c.x + 20, c.y - 15)).toEqual({ col, row })
        expect(pixelToHex(c.x - 25, c.y + 18)).toEqual({ col, row })
      }
    }
  })

  it('fracToHex compõe fração→pixel→hex', () => {
    expect(fracToHex(0.25, 0.5)).toEqual(pixelToHex(0.25 * MAP_W, 0.5 * MAP_H))
    expect(fracToHex(0, 0)).toEqual(pixelToHex(0, 0))
  })

  it('hexPolygonPoints: 6 pares "x,y" arredondados a 1 casa', () => {
    const pts = hexPolygonPoints(2, 3).split(' ')
    expect(pts.length).toBe(6)
    for (const p of pts) expect(p).toMatch(/^-?\d+(\.\d)?,-?\d+(\.\d)?$/)
  })

  it('hexGridCells cobre a imagem inteira (~40×47) com margem nas bordas', () => {
    const cells = hexGridCells()
    // ~40 colunas × ~47 linhas, com margem (-1) → milhares de células
    expect(cells.length).toBeGreaterThan(1600)
    expect(cells.length).toBeLessThan(2200)
    // toda célula tem centro dentro da imagem OU a até 1 hex da borda
    for (const { col, row } of cells) {
      const c = hexCenter(col, row)
      expect(c.x).toBeGreaterThan(-HEX_SIZE)
      expect(c.x).toBeLessThan(MAP_W + HEX_SIZE)
      expect(c.y).toBeGreaterThan(-HEX_SIZE)
      expect(c.y).toBeLessThan(MAP_H + HEX_SIZE)
    }
    // cobre os 4 cantos: existe célula cujo centro está a <1 hex de cada canto
    const near = (px: number, py: number) =>
      cells.some((c) => {
        const p = hexCenter(c.col, c.row)
        return Math.abs(p.x - px) < HEX_HSTEP && Math.abs(p.y - py) < HEX_VSTEP
      })
    expect(near(0, 0)).toBe(true)
    expect(near(MAP_W, MAP_H)).toBe(true)
  })

  it('hexGridPath: um único path com uma cadeia (M…L…L…L) por célula', () => {
    const d = hexGridPath()
    expect(d.startsWith('M')).toBe(true)
    // uma cadeia contígua de 3 arestas (v2→v3→v4→v5) por célula
    expect(d.split('M').length - 1).toBe(hexGridCells().length)
    expect((d.match(/L/g) ?? []).length).toBe(hexGridCells().length * 3)
  })
})

describe('group-store (namespace pleitost.groupState.<groupId>) — hexes', () => {
  it('add/update/remove gravam NA HORA na chave do grupo; remount relê', () => {
    const h = addGroupHex(GROUP_ID, { col: 5, row: 12, data: '2026-07-01' })
    expect(getGroupState(GROUP_ID).hexes).toEqual([h])
    // gravação imediata (canal 'imediato' do padrão hero-store)
    const salvo = JSON.parse(window.localStorage.getItem(STORE_KEY)!)
    expect(salvo.hexes).toEqual([h])

    updateGroupHex(GROUP_ID, h.id, { data: '2026-07-02', localId: KRASNOGOR_ID })
    expect(getGroupState(GROUP_ID).hexes[0]).toEqual({
      ...h,
      data: '2026-07-02',
      localId: KRASNOGOR_ID,
    })
    // localId vazio remove a associação
    updateGroupHex(GROUP_ID, h.id, { localId: undefined })
    expect(getGroupState(GROUP_ID).hexes[0].localId).toBeUndefined()

    // "reload": zera a memória, o localStorage rehidrata
    __resetGroupStoreMemoryForTests()
    expect(getGroupState(GROUP_ID).hexes[0].data).toBe('2026-07-02')

    removeGroupHex(GROUP_ID, h.id)
    expect(getGroupState(GROUP_ID).hexes).toEqual([])
    // sem hexes → chave removida (espelha o hasEdits do hero-store)
    expect(window.localStorage.getItem(STORE_KEY)).toBeNull()
  })

  it('addGroupHex não duplica a mesma célula (col,row) por padrão; hexAt localiza', () => {
    const a = addGroupHex(GROUP_ID, { col: 3, row: 3, data: '2026-07-01' })
    const b = addGroupHex(GROUP_ID, { col: 3, row: 3, data: '2026-07-09' })
    expect(b.id).toBe(a.id) // mesma célula → devolve o existente
    expect(getGroupState(GROUP_ID).hexes.length).toBe(1)
    expect(hexAt(getGroupState(GROUP_ID).hexes, 3, 3)!.id).toBe(a.id)
    expect(hexAt(getGroupState(GROUP_ID).hexes, 9, 9)).toBeNull()
  })

  it('#82 allowDuplicate=true cria NOVA parada no mesmo hex (revisitar o lugar)', () => {
    const a = addGroupHex(GROUP_ID, { col: 3, row: 3 }, true)
    const b = addGroupHex(GROUP_ID, { col: 3, row: 3 }, true)
    expect(b.id).not.toBe(a.id) // parada distinta no MESMO hex
    expect(getGroupState(GROUP_ID).hexes.length).toBe(2)
    // insertGroupHex com allowDuplicate insere no meio, também duplicando
    insertGroupHex(GROUP_ID, { col: 3, row: 3 }, 1, true)
    expect(getGroupState(GROUP_ID).hexes.map((h) => `${h.col},${h.row}`)).toEqual(['3,3', '3,3', '3,3'])
  })

  it('descarta a forma antiga {pontos:[{x,y}]} do localStorage (issue #48)', () => {
    window.localStorage.setItem(
      STORE_KEY,
      JSON.stringify({ pontos: [{ id: 'p1', x: 0.5, y: 0.5, data: '2026-01-01' }] }),
    )
    expect(getGroupState(GROUP_ID).hexes).toEqual([])
  })

  it('namespaces por grupo são independentes', () => {
    addGroupHex('grupo-a', { col: 1, row: 1, data: '2026-01-01' })
    expect(getGroupState('grupo-b').hexes).toEqual([])
    expect(window.localStorage.getItem('pleitost.groupState.grupo-a')).toBeTruthy()
    expect(window.localStorage.getItem('pleitost.groupState.grupo-b')).toBeNull()
  })

  it('#69 caminho: ordem é a do array; hexAtual default = última parada', () => {
    const a = addGroupHex(GROUP_ID, { col: 1, row: 1 })
    const b = addGroupHex(GROUP_ID, { col: 2, row: 2 })
    const c = addGroupHex(GROUP_ID, { col: 3, row: 3 })
    // addGroupHex acrescenta ao FIM (não por data) → ordem de inserção
    expect(getGroupState(GROUP_ID).hexes.map((h) => h.id)).toEqual([a.id, b.id, c.id])
    // sem atualId setado, o ATUAL é a última parada do caminho
    expect(hexAtual(getGroupState(GROUP_ID))!.id).toBe(c.id)
  })

  it('#69 insertGroupHex INSERE no meio; moveGroupHex REORDENA por drag', () => {
    const a = addGroupHex(GROUP_ID, { col: 1, row: 1 })
    const c = addGroupHex(GROUP_ID, { col: 3, row: 3 })
    // insere no MEIO (índice 1) entre a e c
    const b = insertGroupHex(GROUP_ID, { col: 2, row: 2 }, 1)
    expect(getGroupState(GROUP_ID).hexes.map((h) => h.id)).toEqual([a.id, b.id, c.id])
    // arrasta c pro início (índice 0)
    moveGroupHex(GROUP_ID, c.id, 0)
    expect(getGroupState(GROUP_ID).hexes.map((h) => h.id)).toEqual([c.id, a.id, b.id])
    // arrasta c pro fim
    moveGroupHex(GROUP_ID, c.id, 2)
    expect(getGroupState(GROUP_ID).hexes.map((h) => h.id)).toEqual([a.id, b.id, c.id])
    // célula já existente não duplica ao inserir
    expect(insertGroupHex(GROUP_ID, { col: 1, row: 1 }, 0).id).toBe(a.id)
    expect(getGroupState(GROUP_ID).hexes.length).toBe(3)
  })

  it('#71 token: setAtualHex fixa o ATUAL; remover o atual cai no default', () => {
    const a = addGroupHex(GROUP_ID, { col: 1, row: 1 })
    const b = addGroupHex(GROUP_ID, { col: 2, row: 2 })
    // default = última (b)
    expect(hexAtual(getGroupState(GROUP_ID))!.id).toBe(b.id)
    // fixa a primeira como ATUAL → persiste no localStorage
    setAtualHex(GROUP_ID, a.id)
    expect(hexAtual(getGroupState(GROUP_ID))!.id).toBe(a.id)
    expect(JSON.parse(window.localStorage.getItem(STORE_KEY)!).atualId).toBe(a.id)
    // reload preserva o atualId
    __resetGroupStoreMemoryForTests()
    expect(hexAtual(getGroupState(GROUP_ID))!.id).toBe(a.id)
    // remover a parada ATUAL → volta ao default (última = b)
    removeGroupHex(GROUP_ID, a.id)
    expect(getGroupState(GROUP_ID).atualId).toBeUndefined()
    expect(hexAtual(getGroupState(GROUP_ID))!.id).toBe(b.id)
  })

  it('#68 região ativa: default = 1ª com mapa; setRegiaoAtiva persiste', () => {
    // sem escolha → região ativa efetiva é a primeira de REGION_MAPS
    expect(activeRegionId(getGroupState(GROUP_ID))).toBe(REGION_MAPS[0].regionId)
    setRegiaoAtiva(GROUP_ID, REGION_MAPS[0].regionId)
    expect(getGroupState(GROUP_ID).regiaoAtiva).toBe(REGION_MAPS[0].regionId)
    // grava mesmo sem paradas (a região é estado do grupo)
    expect(JSON.parse(window.localStorage.getItem(STORE_KEY)!).regiaoAtiva).toBe(
      REGION_MAPS[0].regionId,
    )
    __resetGroupStoreMemoryForTests()
    expect(getGroupState(GROUP_ID).regiaoAtiva).toBe(REGION_MAPS[0].regionId)
  })
})

describe('locaisSelectLines (árvore real do Atlas)', () => {
  it('toda Localização do Atlas vira opção selecionável com value = id do doc', () => {
    const lines = locaisSelectLines(catalog)
    // expectativa independente: varre o índice cru (mesma regra do scan
    // espelhado do plugin: categoria Localização em Atlas/, sem TEMPLATE,
    // subcategoria obrigatória)
    const esperados = manifest.docs.filter(
      (d) =>
        d.kind === 'content' &&
        d.type === 'Localização' &&
        d.path.startsWith('Atlas/') &&
        !/^TEMPLATE/i.test(d.basename ?? '') &&
        (d.subtype ?? '').trim() !== '',
    )
    const selecionaveis = lines.filter((l) => l.value)
    expect(new Set(selecionaveis.map((l) => l.value)).size).toBe(esperados.length)
    for (const doc of esperados) {
      expect(selecionaveis.some((l) => l.value === doc.id)).toBe(true)
    }
    // reusa o scan das regras: mesmo universo do listLocalizacoes
    expect(esperados.length).toBe(listLocalizacoes(catalog).length)
    // primeira linha = sem associação
    expect(lines[0]).toEqual({ value: '', label: '—', disabled: false })
    // nota-índice de pasta (Região) é selecionável nesta tela
    const pedraFina = lines.find(
      (l) => l.value === 'Atlas/Mundo Livre/Federação Áurea/Pedra Fina/Pedra Fina',
    )!
    expect(pedraFina.disabled).toBe(false)
    // folha mais funda indenta mais que a nota-índice da pasta
    const krasnogor = lines.find((l) => l.value === KRASNOGOR_ID)!
    // a indentação da árvore usa NBSP por nível → \s (casa NBSP também)
    const indent = (s: string) => /^\s*/.exec(s)![0].length
    expect(indent(krasnogor.label)).toBeGreaterThan(indent(pedraFina.label))
  })
})

describe('aba EXPLORAÇÃO (GrupoView, grupo real) — grade hexagonal', () => {
  it('é a PRIMEIRA aba, ativa por padrão, mostra o mapa real e a grade', async () => {
    const { container } = renderGroup()
    const tabExp = screen.getByText('EXPLORAÇÃO')
    // primeira aba da fila e ativa por padrão (accent + track em -0%)
    const tabsRow = tabExp.parentElement as HTMLElement
    expect((tabsRow.querySelector('button') as HTMLElement).textContent).toBe('EXPLORAÇÃO')
    expect(tabExp.style.color).toBe('var(--accent)')
    const track = container.querySelector('[data-track]') as HTMLElement
    expect(track.style.transform).toBe('translateX(-0%)')
    // kicker da linguagem do design
    expect(screen.getByText('// EXPLORAÇÃO')).toBeTruthy()
    // asset real via byPath + assetUrl
    await esperaMapa(container)
    const img = container.querySelector('[data-mapa] img') as HTMLImageElement
    expect(decodeURIComponent(img.getAttribute('src') ?? '')).toBe(
      `/vault-data/assets/${MAPA_MUNDO_LIVRE}`,
    )
    // overlay SVG em px da fonte + a malha hexagonal (1 path)
    const svg = container.querySelector('[data-mapa] svg') as SVGSVGElement
    expect(svg.getAttribute('viewBox')).toBe(`0 0 ${MAP_W} ${MAP_H}`)
    const grid = container.querySelector('[data-hexgrid]') as SVGPathElement
    expect(grid.getAttribute('d')).toBe(hexGridPath())
    expect(grid.getAttribute('vector-effect')).toBe('non-scaling-stroke')
  })

  it('MARCAR HEX: clique destaca o HEX certo (col,row de pixelToHex) e abre o popover', async () => {
    const { container } = renderGroup()
    await esperaMapa(container)
    const mapa = mockMapaRect(container)

    fireEvent.click(document.querySelector('[data-marcar-hex]') as HTMLElement)
    fireEvent.click(mapa, { clientX: 100, clientY: 270 })

    // célula esperada = pixelToHex da fração clicada (0.25, 0.5)
    const cell = fracToHex(0.25, 0.5)
    const hexes = getGroupState(GROUP_ID).hexes
    expect(hexes.length).toBe(1)
    expect({ col: hexes[0].col, row: hexes[0].row }).toEqual(cell)
    expect(hexes[0].data).toBe(todayISO())
    expect(hexes[0].localId).toBeUndefined()

    // ponto de caminho (hex nu) desenhado na célula certa (data-col/row)
    const mark = container.querySelector(`[data-hex="${hexes[0].id}"]`) as SVGElement
    expect(Number(mark.getAttribute('data-col'))).toBe(cell.col)
    expect(Number(mark.getAttribute('data-row'))).toBe(cell.row)

    // popover abre já no hex criado (único = ATUAL)
    const info = container.querySelector('[data-hex-info]') as HTMLElement
    expect(info).toBeTruthy()
    expect(within(info).getByText('ATUAL')).toBeTruthy()
    const dataInput = within(info).getByLabelText('DATA') as HTMLInputElement
    expect(dataInput.value).toBe(todayISO())
    fireEvent.change(dataInput, { target: { value: '2026-07-01' } })
    expect(getGroupState(GROUP_ID).hexes[0].data).toBe('2026-07-01')

    // dropdown com a árvore real do Atlas → associa o Krasnogor à parada
    fireEvent.change(within(info).getByLabelText('LOCAL'), { target: { value: KRASNOGOR_ID } })
    expect(getGroupState(GROUP_ID).hexes[0].localId).toBe(KRASNOGOR_ID)
    expect(within(info).getByText('Krasnogor')).toBeTruthy()
    // link pro doc via docPath (a info rica — Tipo/Descrição/Recursos + imagem
    // — mora na barra DIREITA do #70, alimentada pelo hexmap-store da região)
    const link = within(info).getByText('ABRIR DOC') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe(docPath(KRASNOGOR_ID))
  })

  it('#82 modo marcar: clicar de novo no MESMO hex REVISITA (2 paradas, não remove)', async () => {
    const { container } = renderGroup()
    await esperaMapa(container)
    const mapa = mockMapaRect(container)
    fireEvent.click(document.querySelector('[data-marcar-hex]') as HTMLElement)
    fireEvent.click(mapa, { clientX: 100, clientY: 108 }) // cria 1ª
    expect(getGroupState(GROUP_ID).hexes.length).toBe(1)
    // clicar de novo na MESMA célula ADICIONA outra parada (revisitar o lugar)
    fireEvent.click(mapa, { clientX: 100, clientY: 108 })
    const hexes = getGroupState(GROUP_ID).hexes
    expect(hexes.length).toBe(2)
    // ambas no MESMO hex (mesma col,row) — caminho que passa 2× pelo lugar
    expect(hexes[0].col).toBe(hexes[1].col)
    expect(hexes[0].row).toBe(hexes[1].row)
  })

  it('#85 dois modos: CAMINHO adiciona vários hexes de rota; PARADA rotula pro log', async () => {
    const { container } = renderGroup()
    await esperaMapa(container)
    const mapa = mockMapaRect(container)
    // os dois botões existem na barra
    expect(container.querySelector('[data-add-parada]')).toBeTruthy()
    expect(container.querySelector('[data-add-caminho]')).toBeTruthy()

    // CAMINHO: toca 3 hexes → 3 pontos de rota, SEM abrir o popover
    fireEvent.click(container.querySelector('[data-add-caminho]') as HTMLElement)
    fireEvent.click(mapa, { clientX: 60, clientY: 60 })
    fireEvent.click(mapa, { clientX: 130, clientY: 150 })
    fireEvent.click(mapa, { clientX: 200, clientY: 240 })
    expect(getGroupState(GROUP_ID).hexes.length).toBe(3)
    expect(container.querySelector('[data-hex-info]')).toBeNull()

    // PARADA: toca 1 hex → abre o popover; rotula → persiste no grupo
    fireEvent.click(container.querySelector('[data-add-parada]') as HTMLElement)
    fireEvent.click(mapa, { clientX: 300, clientY: 330 })
    const info = container.querySelector('[data-hex-info]') as HTMLElement
    expect(info).toBeTruthy()
    const labelInput = info.querySelector('[data-hex-label]') as HTMLInputElement
    fireEvent.change(labelInput, { target: { value: 'acampamos aqui' } })
    expect(getGroupState(GROUP_ID).hexes.at(-1)?.label).toBe('acampamos aqui')

    // no MAPA a parada rotulada vira MARCADOR (hex); os 3 de caminho não.
    // (o NOME não é desenhado — o mapa já tem o texto na própria arte.)
    expect(container.querySelectorAll('[data-parada-mapa]').length).toBe(1)
    expect(container.querySelector('[data-parada-label]')).toBeNull()
  })

  it('#85 parada SEM rótulo (pelo kind) já é relevante; caminho colapsa indentado abaixo', async () => {
    const { container } = renderGroup()
    await esperaMapa(container)
    const mapa = mockMapaRect(container)
    // 1 PARADA (sem rotular) e depois 2 pontos de CAMINHO
    fireEvent.click(container.querySelector('[data-add-parada]') as HTMLElement)
    fireEvent.click(mapa, { clientX: 80, clientY: 90 })
    fireEvent.click(container.querySelector('[data-add-caminho]') as HTMLElement)
    fireEvent.click(mapa, { clientX: 150, clientY: 170 })
    fireEvent.click(mapa, { clientX: 220, clientY: 250 })

    const hexes = getGroupState(GROUP_ID).hexes
    expect(hexes[0].kind).toBe('parada')
    expect(hexes[1].kind).toBe('caminho')

    const bar = container.querySelector('[data-caminho-bar]') as HTMLElement
    // a parada (mesmo SEM rótulo) é linha proeminente na lista
    expect(bar.querySelector(`[data-parada="${hexes[0].id}"]`)).toBeTruthy()
    // e os 2 caminhos colapsam identados abaixo (3 pontinhos = N HEX), sem virar linha
    const run = bar.querySelector('[data-collapsed-run]') as HTMLElement
    expect(run).toBeTruthy()
    expect(run.textContent).toContain('2 HEX')
    expect(bar.querySelector(`[data-parada="${hexes[1].id}"]`)).toBeNull()
  })

  it('#82 MARCAR HEX vive DENTRO da barra de caminho (acessível em tela cheia)', async () => {
    addGroupHex(GROUP_ID, { col: 2, row: 2 })
    const { container } = renderGroup()
    await esperaMapa(container)
    const bar = container.querySelector('[data-caminho-bar]') as HTMLElement
    expect(bar.querySelector('[data-marcar-hex]')).toBeTruthy()
  })

  it('#69 trilha liga os centros na ORDEM do caminho; ATUAL (último) com glow; reordenar reflete', async () => {
    const a = addGroupHex(GROUP_ID, { col: 4, row: 6 })
    const b = addGroupHex(GROUP_ID, { col: 12, row: 20 })
    const { container } = renderGroup()
    await esperaMapa(container)

    // dois pontos de CAMINHO (hexes nus = bolinhas); o ATUAL (b) com glow accent
    expect(container.querySelectorAll('[data-hex]').length).toBe(2)
    const atual = container.querySelector('[data-atual]') as SVGElement
    expect(atual.getAttribute('data-hex')).toBe(b.id)
    expect((atual.getAttribute('style') ?? '')).toContain('drop-shadow') // glow do atual
    const outro = container.querySelector(`[data-hex="${a.id}"]`) as SVGElement
    expect((outro.getAttribute('style') ?? '')).not.toContain('drop-shadow')
    // o atual é mais forte que o outro (bolinha cheia vs translúcida)
    expect(atual.getAttribute('fill')).not.toBe(outro.getAttribute('fill'))

    // trilha tracejada ligando os CENTROS na ordem do array (a → b)
    const centro = (h: { col: number; row: number }) => {
      const c = hexCenter(h.col, h.row)
      return `${c.x},${c.y}`
    }
    const trilha = container.querySelector('[data-trilha]') as SVGPolylineElement
    expect(trilha.getAttribute('points')).toBe(`${centro(a)} ${centro(b)}`)
    expect(trilha.getAttribute('stroke-dasharray')).toBeTruthy()

    // reordenar (drag): mover a pro fim → a vira o ATUAL e a trilha inverte
    moveGroupHex(GROUP_ID, a.id, 2)
    await waitFor(() =>
      expect(
        (container.querySelector('[data-atual]') as SVGPolygonElement).getAttribute('data-hex'),
      ).toBe(a.id),
    )
    expect((container.querySelector('[data-trilha]') as SVGPolylineElement).getAttribute('points')).toBe(
      `${centro(b)} ${centro(a)}`,
    )
  })

  it('#82 reordena o caminho arrastando o HANDLE de emoji por PONTEIRO (toque)', async () => {
    // marca os 3 hexes como LUGARES → viram paradas PRINCIPAIS (visíveis)
    const regionId = REGION_MAPS[0].regionId
    setHexLocal(regionId, 3, 3, KRASNOGOR_ID)
    setHexLocal(regionId, 6, 6, KRASNOGOR_ID)
    setHexLocal(regionId, 9, 9, KRASNOGOR_ID)
    const a = addGroupHex(GROUP_ID, { col: 3, row: 3 })
    const b = addGroupHex(GROUP_ID, { col: 6, row: 6 })
    const c = addGroupHex(GROUP_ID, { col: 9, row: 9 })
    const { container } = renderGroup()
    await esperaMapa(container)

    // handles de arraste (um por parada), na ordem a,b,c
    expect(container.querySelectorAll('[data-drag-handle]').length).toBe(3)
    const handleA = container.querySelector(`[data-drag-handle="${a.id}"]`) as HTMLElement

    // jsdom não faz layout: fixa o rect de cada parada (a:0-30, b:30-60, c:60-90)
    const paradas = [...container.querySelectorAll('[data-parada]')] as HTMLElement[]
    paradas.forEach((el, i) => {
      el.getBoundingClientRect = () =>
        ({ top: i * 30, bottom: i * 30 + 30, left: 0, right: 240, width: 240, height: 30, x: 0, y: i * 30 }) as DOMRect
    })

    // arrasta o handle de A pra BAIXO de C (y=100 → cai no fim) → ordem b,c,a
    fireEvent.pointerDown(handleA, { pointerId: 1, clientY: 5 })
    fireEvent.pointerMove(handleA, { pointerId: 1, clientY: 100 })
    fireEvent.pointerUp(handleA, { pointerId: 1, clientY: 100 })

    await waitFor(() =>
      expect(getGroupState(GROUP_ID).hexes.map((h) => h.id)).toEqual([b.id, c.id, a.id]),
    )
  })

  it('#82 caminho HIERÁRQUICO: principais visíveis, hex-only COLAPSADOS (expande no clique)', async () => {
    const regionId = REGION_MAPS[0].regionId
    setHexLocal(regionId, 2, 2, KRASNOGOR_ID) // (2,2) = LUGAR → principal
    const p = addGroupHex(GROUP_ID, { col: 2, row: 2 })
    const h1 = addGroupHex(GROUP_ID, { col: 3, row: 3 }) // hex-only (filhos)
    const h2 = addGroupHex(GROUP_ID, { col: 4, row: 4 })
    const { container } = renderGroup()
    await esperaMapa(container)
    const bar = container.querySelector('[data-caminho-bar]') as HTMLElement

    // principal visível; hex-only colapsados (não renderizados como parada)
    expect(bar.querySelector(`[data-parada="${p.id}"]`)).toBeTruthy()
    expect(bar.querySelector(`[data-parada="${h1.id}"]`)).toBeNull()
    const run = bar.querySelector('[data-collapsed-run]') as HTMLElement
    expect(run).toBeTruthy()
    expect(run.textContent).toContain('2 HEX')

    // clicar no colapsado EXPANDE → os hex-only aparecem
    fireEvent.click(run)
    expect(bar.querySelector(`[data-parada="${h1.id}"]`)).toBeTruthy()
    expect(bar.querySelector(`[data-parada="${h2.id}"]`)).toBeTruthy()

    // inserir-entre-partes disponível (botões +)
    expect(bar.querySelector('[data-insert-at]')).toBeTruthy()
  })

  it('fora do modo marcar, clicar num hex marcado abre o popover (não cria)', async () => {
    const h = addGroupHex(GROUP_ID, { col: 8, row: 8, data: '2026-07-01' })
    const { container } = renderGroup()
    await esperaMapa(container)
    const mapa = mockMapaRect(container)
    // clica na fração cujo pixelToHex cai exatamente na célula do hex marcado
    const c = hexCenter(h.col, h.row)
    fireEvent.click(mapa, { clientX: (c.x / MAP_W) * 400, clientY: (c.y / MAP_H) * 540 })
    // NÃO cria outro (fora do modo) e abre o popover do hex existente
    expect(getGroupState(GROUP_ID).hexes.length).toBe(1)
    const info = container.querySelector('[data-hex-info]') as HTMLElement
    expect(info).toBeTruthy()
    // hex fica marcado como selecionado (borda de texto)
    expect(container.querySelector(`[data-hex="${h.id}"][data-sel]`)).toBeTruthy()
  })

  it('remover hex pelo × do popover limpa o store e o mapa', async () => {
    const h = addGroupHex(GROUP_ID, { col: 7, row: 7, data: '2026-07-01' })
    const { container } = renderGroup()
    await esperaMapa(container)
    const mapa = mockMapaRect(container)
    clickHex(mapa, h) // abre o popover do hex marcado
    fireEvent.click(screen.getByLabelText('Remover hex'))
    expect(getGroupState(GROUP_ID).hexes).toEqual([])
    expect(container.querySelector('[data-hex]')).toBeNull()
    expect(container.querySelector('[data-hex-info]')).toBeNull()
    expect(window.localStorage.getItem(STORE_KEY)).toBeNull()
  })

  it('persistência com remount: hex criado no clique sobrevive ao "reload"', async () => {
    const r = renderGroup()
    await esperaMapa(r.container)
    const mapa = mockMapaRect(r.container)
    fireEvent.click(document.querySelector('[data-marcar-hex]') as HTMLElement)
    fireEvent.click(mapa, { clientX: 200, clientY: 135 })
    const cell = fracToHex(0.5, 0.25)
    const salvo = getGroupState(GROUP_ID).hexes[0]
    expect({ col: salvo.col, row: salvo.row }).toEqual(cell)

    // "reload da página": desmonta, zera a memória, MANTÉM o localStorage
    r.unmount()
    __resetGroupStoreMemoryForTests()
    const r2 = renderGroup()
    await esperaMapa(r2.container)
    const mark = r2.container.querySelector('[data-hex]') as SVGElement
    expect(mark.getAttribute('data-hex')).toBe(salvo.id)
    expect(Number(mark.getAttribute('data-col'))).toBe(cell.col)
    expect(Number(mark.getAttribute('data-row'))).toBe(cell.row)
  })

  it('hover realça a célula livre sob o cursor (data-hex-hover)', async () => {
    const { container } = renderGroup()
    await esperaMapa(container)
    const viewport = container.querySelector('[data-mapa-viewport]') as HTMLElement
    mockMapaRect(container)
    // move o cursor sobre uma fração livre → aparece o realce
    fireEvent.pointerMove(viewport, { clientX: 150, clientY: 200 })
    const cell = fracToHex(150 / 400, 200 / 540)
    const hover = container.querySelector('[data-hex-hover]') as SVGPolygonElement
    expect(hover).toBeTruthy()
    expect(hover.getAttribute('points')).toBe(hexPolygonPoints(cell.col, cell.row))
    // sair do viewport limpa o realce
    fireEvent.pointerLeave(viewport)
    expect(container.querySelector('[data-hex-hover]')).toBeNull()
  })

  it('wheel dá zoom com clamp [1,8]; drag faz pan e NÃO marca hex', async () => {
    const { container } = renderGroup()
    await esperaMapa(container)
    const viewport = container.querySelector('[data-mapa-viewport]') as HTMLElement
    const mapa = mockMapaRect(container)

    // zoom in ancorado (clamp superior)
    fireEvent.wheel(viewport, { deltaY: -100 })
    expect(mapa.style.transform).toContain('scale(1.2)')
    for (let i = 0; i < 30; i++) fireEvent.wheel(viewport, { deltaY: -100 })
    const scaleOf = () => Number(/scale\(([\d.]+)\)/.exec(mapa.style.transform)![1])
    expect(scaleOf()).toBeLessThanOrEqual(8)
    // zoom out clampa em 1 e re-centra (translate zerado)
    for (let i = 0; i < 40; i++) fireEvent.wheel(viewport, { deltaY: 100 })
    expect(mapa.style.transform).toBe('translate(0px, 0px) scale(1)')

    // drag = pan (translate muda) e o clique resultante não marca hex
    fireEvent.click(document.querySelector('[data-marcar-hex]') as HTMLElement)
    fireEvent.pointerDown(viewport, { clientX: 100, clientY: 100 })
    fireEvent.pointerMove(viewport, { clientX: 140, clientY: 130 })
    fireEvent.pointerUp(viewport)
    expect(mapa.style.transform).toContain('translate(40px, 30px)')
    fireEvent.click(mapa, { clientX: 140, clientY: 130 })
    expect(getGroupState(GROUP_ID).hexes).toEqual([])
    // clique limpo (sem drag) marca normalmente
    fireEvent.click(mapa, { clientX: 100, clientY: 108 })
    expect(getGroupState(GROUP_ID).hexes.length).toBe(1)
  })
})

// ── #68 seletor de região troca mapa + mapeamento hex→localização ───────────
describe('#68 GM define a região do grupo → mapa e mapeamento trocam', () => {
  it('o seletor lista as regiões com mapa; a ativa usa o asset e o hexmap DELA', async () => {
    const { container } = renderGroup()
    await esperaMapa(container)
    // seletor de região (só as com mapa — REGION_MAPS)
    const sel = screen.getByLabelText('Região do grupo') as HTMLSelectElement
    const opts = [...sel.options].map((o) => o.value)
    expect(opts).toEqual(REGION_MAPS.map((m) => m.regionId))
    // ativa por default = 1ª com mapa; asset do mapa vem de region-maps
    const rm = REGION_MAPS[0]
    expect(sel.value).toBe(rm.regionId)
    const img = container.querySelector('[data-mapa] img') as HTMLImageElement
    expect(decodeURIComponent(img.getAttribute('src') ?? '')).toBe(`/vault-data/assets/${rm.mapAsset}`)

    // configura o mapeamento hex→local NA REGIÃO ativa (autoria do #67) →
    // o hex ganha o realce "tem localização" no mapa do grupo
    const cell = fracToHex(0.3, 0.3)
    setHexLocal(rm.regionId, cell.col, cell.row, KRASNOGOR_ID)
    await waitFor(() =>
      expect(container.querySelector(`[data-hex-local="${cell.col},${cell.row}"]`)).toBeTruthy(),
    )
    // escolher a região persiste no group-store
    fireEvent.change(sel, { target: { value: rm.regionId } })
    expect(getGroupState(GROUP_ID).regiaoAtiva).toBe(rm.regionId)
    // e o mapeamento exibido é o da região ativa (getHexMapState dela)
    expect(getHexMapState(rm.regionId).cells.some((c) => c.localId === KRASNOGOR_ID)).toBe(true)
  })
})

// ── #69 barra esquerda: lista/caminho, add e reorder ────────────────────────
describe('#69 barra esquerda colapsável = caminho (add + reorder)', () => {
  it('lista as paradas na ordem; ＋ colapsa/expande; drag reordena', async () => {
    // paradas PRINCIPAIS (lugares mapeados) pra aparecerem na lista
    const regionId = REGION_MAPS[0].regionId
    setHexLocal(regionId, 2, 2, KRASNOGOR_ID)
    setHexLocal(regionId, 5, 5, KRASNOGOR_ID)
    const a = addGroupHex(GROUP_ID, { col: 2, row: 2 })
    const b = addGroupHex(GROUP_ID, { col: 5, row: 5 })
    const { container } = renderGroup()
    await esperaMapa(container)

    // paradas listadas NA ORDEM do caminho (data-order = índice)
    const bar = container.querySelector('[data-caminho-bar]') as HTMLElement
    const paradas = () =>
      [...bar.querySelectorAll('[data-parada]')].map((el) => el.getAttribute('data-parada'))
    expect(paradas()).toEqual([a.id, b.id])

    // colapsar esconde a lista; expandir volta
    fireEvent.click(within(bar).getByLabelText('Recolher caminho'))
    expect(bar.querySelector('[data-parada]')).toBeNull()
    expect(bar.getAttribute('data-collapsed')).toBe('')
    fireEvent.click(within(bar).getByLabelText('Expandir caminho'))
    expect(paradas()).toEqual([a.id, b.id])

    // reorder por PONTEIRO (handle de emoji, funciona no toque): arrasta o
    // handle de b pra o TOPO (antes de a). jsdom não faz layout → mocka rects.
    ;[...bar.querySelectorAll('[data-parada]')].forEach((el, i) => {
      ;(el as HTMLElement).getBoundingClientRect = () =>
        ({ top: i * 30, bottom: i * 30 + 30, left: 0, right: 240, width: 240, height: 30, x: 0, y: i * 30 }) as DOMRect
    })
    const handleB = bar.querySelector(`[data-drag-handle="${b.id}"]`) as HTMLElement
    fireEvent.pointerDown(handleB, { pointerId: 1, clientY: 35 })
    fireEvent.pointerMove(handleB, { pointerId: 1, clientY: 3 })
    fireEvent.pointerUp(handleB, { pointerId: 1, clientY: 3 })
    expect(getGroupState(GROUP_ID).hexes.map((h) => h.id)).toEqual([b.id, a.id])
    // a UI reflete a nova ordem
    expect(paradas()).toEqual([b.id, a.id])
  })
})

// ── #70 barra direita: info do local ao clicar num hex configurado ──────────
describe('#70 barra direita colapsável = info do local (Tipo/Descrição/Recursos)', () => {
  it('clicar num hex COM localização na região abre a info real; colapsa', async () => {
    // autoria (#67): mapeia um hex da região ativa ao Krasnogor
    const regionId = REGION_MAPS[0].regionId
    const cell = fracToHex(0.4, 0.5)
    setHexLocal(regionId, cell.col, cell.row, KRASNOGOR_ID)
    const krasno = readDoc(KRASNOGOR_ID)

    const { container } = renderGroup()
    await esperaMapa(container)
    const mapa = mockMapaRect(container)

    // sem clique → sem barra direita
    expect(container.querySelector('[data-info-bar]')).toBeNull()
    // clica no hex configurado → abre a barra direita com a info REAL do doc
    fireEvent.click(mapa, clickCoords(cell))
    const bar = await waitFor(() => {
      const b = container.querySelector('[data-info-bar]') as HTMLElement
      expect(b).toBeTruthy()
      return b
    })
    // nome + Tipo (subcategoria) reais (fonte de verdade = catálogo/FM)
    expect(within(bar).getByText('Krasnogor')).toBeTruthy()
    expect(within(bar).getByText('TIPO')).toBeTruthy()
    expect(within(bar).getByText(krasno.subtype as string)).toBeTruthy()
    // Recursos reais do FM, se houver
    const recursos = (krasno.frontmatter['Recursos'] as unknown[] | undefined)?.filter(
      (r) => typeof r === 'string' && r.trim(),
    )
    if (recursos?.length) expect(within(bar).getByText('RECURSOS')).toBeTruthy()
    // ABRIR DOC via docPath
    expect((within(bar).getByText('ABRIR DOC') as HTMLAnchorElement).getAttribute('href')).toBe(
      docPath(KRASNOGOR_ID),
    )
    // colapsar recolhe a barra
    fireEvent.click(within(bar).getByLabelText('Recolher info'))
    expect(bar.getAttribute('data-collapsed')).toBe('')
    expect(within(bar).queryByText('ABRIR DOC')).toBeNull()
  })

  it('clicar num hex SEM localização não abre a barra direita', async () => {
    const { container } = renderGroup()
    await esperaMapa(container)
    const mapa = mockMapaRect(container)
    fireEvent.click(mapa, clickCoords(fracToHex(0.7, 0.7)))
    expect(container.querySelector('[data-info-bar]')).toBeNull()
  })
})

// ── #71 token (moeda): arrastar → adicionar parada; clicar → info + imagem ──
describe('#71 token de grupo (moeda)', () => {
  it('a moeda fica no hex ATUAL; arrastar e soltar mostra "Adicionar parada" → adiciona', async () => {
    const a = addGroupHex(GROUP_ID, { col: 4, row: 4 })
    const { container } = renderGroup()
    await esperaMapa(container)
    const viewport = container.querySelector('[data-mapa-viewport]') as HTMLElement
    mockMapaRect(container)

    // token renderizado no centro do hex ATUAL (última parada = a)
    const token = container.querySelector('[data-token]') as SVGGElement
    expect(token).toBeTruthy()
    const ca = hexCenter(a.col, a.row)
    expect(token.getAttribute('transform')).toBe(`translate(${ca.x},${ca.y})`)

    // arrasta o token pra uma célula NOVA → alvo destacado + botão aparece
    const alvo = fracToHex(0.6, 0.3)
    const { clientX, clientY } = clickCoords(alvo)
    fireEvent.pointerDown(token, { clientX: ca.x, clientY: ca.y })
    fireEvent.pointerMove(viewport, { clientX, clientY })
    fireEvent.pointerUp(token, { clientX, clientY })
    await waitFor(() => expect(container.querySelector('[data-token-alvo]')).toBeTruthy())
    const addBtn = await screen.findByText('+ ADICIONAR PARADA')
    // confirma → adiciona a parada e a fixa como ATUAL
    fireEvent.click(addBtn)
    const hexes = getGroupState(GROUP_ID).hexes
    expect(hexes.length).toBe(2)
    expect({ col: hexes[1].col, row: hexes[1].row }).toEqual(alvo)
    expect(hexAtual(getGroupState(GROUP_ID))!.id).toBe(hexes[1].id)
  })

  it('clicar na moeda, se o hex atual tem localização, abre a info + a IMAGEM da região que linka o doc', async () => {
    const regionId = REGION_MAPS[0].regionId
    const cell = fracToHex(0.35, 0.45)
    setHexLocal(regionId, cell.col, cell.row, KRASNOGOR_ID)
    // parada ATUAL no hex configurado
    addGroupHex(GROUP_ID, { col: cell.col, row: cell.row })

    const { container } = renderGroup()
    await esperaMapa(container)
    mockMapaRect(container)

    const token = container.querySelector('[data-token]') as SVGGElement
    // clique simples na moeda (sem arraste) → abre a info do local ATUAL
    fireEvent.click(token)
    const bar = await waitFor(() => {
      const b = container.querySelector('[data-info-bar]') as HTMLElement
      expect(b).toBeTruthy()
      return b
    })
    expect(within(bar).getByText('Krasnogor')).toBeTruthy()
    // a IMAGEM da região aparece e linka a página da localização (docPath)
    const imgLink = await waitFor(() => {
      const l = bar.querySelector('[data-local-img]') as HTMLAnchorElement
      expect(l).toBeTruthy()
      return l
    })
    expect(imgLink.getAttribute('href')).toBe(docPath(KRASNOGOR_ID))
    const img = imgLink.querySelector('img') as HTMLImageElement
    expect(decodeURIComponent(img.getAttribute('src') ?? '')).toContain('Krasnogor.png')
  })
})
