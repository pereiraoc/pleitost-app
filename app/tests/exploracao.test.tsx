// @vitest-environment jsdom
// Aba EXPLORAÇÃO do grupo (issue #36): mapa real do Mundo Livre + trilha do
// grupo persistida por grupo (`pleitost.groupState.<id>`). Integração no
// padrão do repo — fetch stubado lê os JSONs REAIS do disco, grupo real e
// doc de Localização real (Krasnogor); expectativas recomputadas AQUI a
// partir do manifest. Cliques no mapa simulados com getBoundingClientRect
// mockado (jsdom não faz layout); "reload" = zerar a memória do store
// mantendo o window.localStorage.
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
import { locaisSelectLines } from '../src/grupo/exploracao'
import { listLocalizacoes } from '../src/rules/naturalidade'
import {
  __resetGroupStoreMemoryForTests,
  addGroupPoint,
  getGroupState,
  ordenarPontos,
  pontoAtual,
  removeGroupPoint,
  todayISO,
  updateGroupPoint,
} from '../src/data/group-store'
import { docPath } from '../src/paths'
import type { IndexManifest } from '../src/data/types'

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

describe('group-store (namespace pleitost.groupState.<groupId>)', () => {
  it('add/update/remove gravam NA HORA na chave do grupo; remount relê', () => {
    const p = addGroupPoint(GROUP_ID, { x: 0.25, y: 0.5, data: '2026-07-01' })
    expect(getGroupState(GROUP_ID).pontos).toEqual([p])
    // gravação imediata (canal 'imediato' do padrão hero-store)
    const salvo = JSON.parse(window.localStorage.getItem(STORE_KEY)!)
    expect(salvo.pontos).toEqual([p])

    updateGroupPoint(GROUP_ID, p.id, { data: '2026-07-02', localId: KRASNOGOR_ID })
    expect(getGroupState(GROUP_ID).pontos[0]).toEqual({
      ...p,
      data: '2026-07-02',
      localId: KRASNOGOR_ID,
    })
    // localId vazio remove a associação
    updateGroupPoint(GROUP_ID, p.id, { localId: undefined })
    expect(getGroupState(GROUP_ID).pontos[0].localId).toBeUndefined()

    // "reload": zera a memória, o localStorage rehidrata
    __resetGroupStoreMemoryForTests()
    expect(getGroupState(GROUP_ID).pontos[0].data).toBe('2026-07-02')

    removeGroupPoint(GROUP_ID, p.id)
    expect(getGroupState(GROUP_ID).pontos).toEqual([])
    // sem pontos → chave removida (espelha o hasEdits do hero-store)
    expect(window.localStorage.getItem(STORE_KEY)).toBeNull()
  })

  it('namespaces por grupo são independentes', () => {
    addGroupPoint('grupo-a', { x: 0.1, y: 0.1, data: '2026-01-01' })
    expect(getGroupState('grupo-b').pontos).toEqual([])
    expect(window.localStorage.getItem('pleitost.groupState.grupo-a')).toBeTruthy()
    expect(window.localStorage.getItem('pleitost.groupState.grupo-b')).toBeNull()
  })

  it('ordenarPontos: data ASC com empate estável; pontoAtual = último', () => {
    const b = addGroupPoint(GROUP_ID, { x: 0.2, y: 0.2, data: '2026-07-03' })
    const a = addGroupPoint(GROUP_ID, { x: 0.1, y: 0.1, data: '2026-07-01' })
    const c = addGroupPoint(GROUP_ID, { x: 0.3, y: 0.3, data: '2026-07-03' })
    const ordenados = ordenarPontos(getGroupState(GROUP_ID).pontos)
    // 01 primeiro; empate 03/03 preserva inserção (b antes de c)
    expect(ordenados.map((p) => p.id)).toEqual([a.id, b.id, c.id])
    expect(pontoAtual(getGroupState(GROUP_ID).pontos)!.id).toBe(c.id)
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
    const indent = (s: string) => /^ */.exec(s)![0].length
    expect(indent(krasnogor.label)).toBeGreaterThan(indent(pedraFina.label))
  })
})

describe('aba EXPLORAÇÃO (GrupoView, grupo real)', () => {
  it('é a PRIMEIRA aba, ativa por padrão, e mostra o mapa real', async () => {
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
  })

  it('ADICIONAR PONTO: clique cria ponto {x,y,data hoje}; popover edita data e associa doc real', async () => {
    const { container } = renderGroup()
    await esperaMapa(container)
    const mapa = mockMapaRect(container)

    fireEvent.click(screen.getByText('ADICIONAR PONTO'))
    fireEvent.click(mapa, { clientX: 100, clientY: 270 })

    // ponto criado com frações relativas à imagem e data de hoje
    const pontos = getGroupState(GROUP_ID).pontos
    expect(pontos.length).toBe(1)
    expect(pontos[0].x).toBeCloseTo(0.25)
    expect(pontos[0].y).toBeCloseTo(0.5)
    expect(pontos[0].data).toBe(todayISO())
    expect(pontos[0].localId).toBeUndefined()

    // popover abre já no ponto criado (único ponto = ATUAL)
    const info = container.querySelector('[data-ponto-info]') as HTMLElement
    expect(info).toBeTruthy()
    expect(within(info).getByText('ATUAL')).toBeTruthy()
    const dataInput = within(info).getByLabelText('DATA') as HTMLInputElement
    expect(dataInput.value).toBe(todayISO())
    fireEvent.change(dataInput, { target: { value: '2026-07-01' } })
    expect(getGroupState(GROUP_ID).pontos[0].data).toBe('2026-07-01')

    // dropdown com a árvore real do Atlas → associa o Krasnogor
    fireEvent.change(within(info).getByLabelText('LOCAL'), { target: { value: KRASNOGOR_ID } })
    expect(getGroupState(GROUP_ID).pontos[0].localId).toBe(KRASNOGOR_ID)
    expect(within(info).getByText('Krasnogor')).toBeTruthy()
    // link pro doc via docPath
    const link = within(info).getByText('ABRIR DOC') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe(docPath(KRASNOGOR_ID))

    // resumo maior do ATUAL: imagem do doc + FM básico (Geolocalização real)
    await waitFor(() => {
      const resumo = within(info).getByAltText('Krasnogor') as HTMLImageElement
      expect(decodeURIComponent(resumo.getAttribute('src') ?? '')).toContain('Krasnogor.png')
    })
    expect(within(info).getByText('GEOLOCALIZAÇÃO')).toBeTruthy()
    expect(within(info).getByText('Pedra Fina')).toBeTruthy()
  })

  it('trilha liga os pontos em ordem de data; ATUAL destacado em accent; editar data reordena', async () => {
    const a = addGroupPoint(GROUP_ID, { x: 0.2, y: 0.2, data: '2026-07-01' })
    const b = addGroupPoint(GROUP_ID, { x: 0.6, y: 0.4, data: '2026-07-03' })
    const { container } = renderGroup()
    await esperaMapa(container)

    // dois losangos; o ATUAL (data maior) marcado e com glow accent
    expect(container.querySelectorAll('[data-ponto]').length).toBe(2)
    const atual = container.querySelector('[data-atual]') as HTMLElement
    expect(atual.getAttribute('data-ponto')).toBe(b.id)
    expect(atual.style.background).toBe('var(--accent)')
    expect(atual.style.boxShadow).toContain('var(--accent)')
    const outro = container.querySelector(`[data-ponto="${a.id}"]`) as HTMLElement
    expect(outro.style.background).toBe('var(--panel)')

    // trilha tracejada na ordem cronológica (a → b)
    const trilha = container.querySelector('[data-trilha]') as SVGPolylineElement
    expect(trilha.getAttribute('points')).toBe('20,20 60,40')
    expect(trilha.getAttribute('stroke-dasharray')).toBeTruthy()

    // clicar no ponto antigo abre o popover; mudar a data pra frente REORDENA
    fireEvent.click(outro)
    const info = container.querySelector('[data-ponto-info]') as HTMLElement
    fireEvent.change(within(info).getByLabelText('DATA'), { target: { value: '2026-07-05' } })
    expect(
      (container.querySelector('[data-atual]') as HTMLElement).getAttribute('data-ponto'),
    ).toBe(a.id)
    expect(
      (container.querySelector('[data-trilha]') as SVGPolylineElement).getAttribute('points'),
    ).toBe('60,40 20,20')
  })

  it('remover ponto pelo × do popover limpa o store e o mapa', async () => {
    const p = addGroupPoint(GROUP_ID, { x: 0.5, y: 0.5, data: '2026-07-01' })
    const { container } = renderGroup()
    await esperaMapa(container)
    fireEvent.click(container.querySelector(`[data-ponto="${p.id}"]`) as HTMLElement)
    fireEvent.click(screen.getByLabelText('Remover ponto'))
    expect(getGroupState(GROUP_ID).pontos).toEqual([])
    expect(container.querySelector('[data-ponto]')).toBeNull()
    expect(container.querySelector('[data-ponto-info]')).toBeNull()
    expect(window.localStorage.getItem(STORE_KEY)).toBeNull()
  })

  it('persistência com remount: ponto criado no clique sobrevive ao "reload"', async () => {
    const r = renderGroup()
    await esperaMapa(r.container)
    const mapa = mockMapaRect(r.container)
    fireEvent.click(screen.getByText('ADICIONAR PONTO'))
    fireEvent.click(mapa, { clientX: 200, clientY: 135 })
    const salvo = getGroupState(GROUP_ID).pontos[0]
    expect(salvo.x).toBeCloseTo(0.5)
    expect(salvo.y).toBeCloseTo(0.25)

    // "reload da página": desmonta, zera a memória, MANTÉM o localStorage
    r.unmount()
    __resetGroupStoreMemoryForTests()
    const r2 = renderGroup()
    await esperaMapa(r2.container)
    const marker = r2.container.querySelector('[data-ponto]') as HTMLElement
    expect(marker.getAttribute('data-ponto')).toBe(salvo.id)
    expect(marker.style.left).toBe('50%')
    expect(marker.style.top).toBe('25%')
  })

  it('wheel dá zoom com clamp [1,8]; drag faz pan e NÃO cria ponto', async () => {
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

    // drag = pan (translate muda) e o clique resultante não vira ponto
    fireEvent.click(screen.getByText('ADICIONAR PONTO'))
    fireEvent.pointerDown(viewport, { clientX: 100, clientY: 100 })
    fireEvent.pointerMove(viewport, { clientX: 140, clientY: 130 })
    fireEvent.pointerUp(viewport)
    expect(mapa.style.transform).toContain('translate(40px, 30px)')
    fireEvent.click(mapa, { clientX: 140, clientY: 130 })
    expect(getGroupState(GROUP_ID).pontos).toEqual([])
    // clique limpo (sem drag) cria normalmente
    fireEvent.click(mapa, { clientX: 100, clientY: 108 })
    expect(getGroupState(GROUP_ID).pontos.length).toBe(1)
  })
})
