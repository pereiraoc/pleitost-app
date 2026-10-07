// @vitest-environment jsdom
// VIAGEM DO HEXCRAWL na aba EXPLORAÇÃO (2026-10-04, UX 2026-10-05): com o
// bloco `viagem` no Contexto-Def (Fantasia), a barra do CAMINHO mostra o total
// da trilha em DIAS; cada PARADA mostra o tempo desde a parada anterior + o(s)
// ícone(s) do meio (config); cada hex de caminho aberto mostra o próprio passo.
// UM MEIO POR TRECHO (2026-10-06): no EDITAR, cada parada com trecho ganha
// um seletor único (AUTO ou o ícone do meio) que grava `meio` na parada de
// chegada; o meio vale onde o terreno deixa, o resto cai no automático. O terreno é DADO DO MUNDO (nota
// `viagem.terreno`, FM `Terreno`), lido pelo doc efetivo (overlay publicado /
// rascunho do Modo Dev). O pintor (✎ TERRENO) mora no Atlas (atlas-terreno.test). Sem o bloco (POA), nada de viagem aparece.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { PanelExploracao } from '../src/grupo/PanelExploracao'
import {
  __resetGroupStoreMemoryForTests,
  getGroupState,
  groupStateJson,
  setGroupStateFull,
  setMeioPasso,
  setMeioTrecho,
} from '../src/data/group-store'
import { InMemorySessionRepo } from '../src/data/session-repo/in-memory'
import { __resetHexMapStoreMemoryForTests, __setSeedsForTests } from '../src/data/hexmap-store'
import { __resetPublishedForTests, __setPublishedForTests } from '../src/data/published-overlay-store'
import { __resetDraftsForTests, allLocalDrafts, localDraftFor } from '../src/data/local-draft-store'
import { __resetSettingsForTests } from '../src/settings'
import { atlasHexCenter } from '../src/map/atlas-grid'
import { MAPA_VISTAS, vistaCrop } from '../src/map/mapa-vistas'
import { getMapaAtlas } from '../src/map/mapa-atlas-store'
import { __resetMapaAtlasForTests } from '../src/map/mapa-atlas-store'
import { setActiveContexto } from '../src/data/reskin'
import type { ContextoDef } from '../src/data/context-def'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
const baseCatalog = buildCatalog(manifest)

const GROUP_ID = 'Sistema/Criaturas/Grupos de Criaturas/Adriann, Carlos, Kenji, Zuko'

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
      { chave: 'dificil', nome: 'Difícil', custo: 2, cor: '#2f6b3a' },
      { chave: 'muito_dificil', nome: 'Montanha', custo: 3, cor: '#8a6a4a' },
      { chave: 'mar', nome: 'Mar', custo: 3, cor: '#4a90c2', agua: true, custoPorMeio: { Barco: 1 } },
    ],
    rotas: [
      { chave: 'estrada', nome: 'Estrada', cor: '#c9a36b', bonus: 1, meios: ['Cavalo', 'Caravana'] },
      { chave: 'rota_maritima', nome: 'Rota marítima', cor: '#ffffff', bonus: 1, meios: ['Barco'] },
    ],
    meios: [
      { nome: 'A pé', icone: '🚶', padrao: true, hexPorDia: 2, em: ['normal', 'dificil', 'muito_dificil'], costa: true },
      { nome: 'Cavalo', icone: '🐎', hexPorDia: 3, em: ['normal', 'dificil'] },
      {
        nome: 'Caravana',
        icone: '🐪',
        padrao: true,
        hexPorDia: 4,
        em: ['normal', 'dificil', 'muito_dificil'],
        soEmRota: 'estrada',
        antigos: ['Carruagem'],
      },
      { nome: 'Barco', icone: '⛵', padrao: true, hexPorDia: 5, em: ['mar'], costa: true, antigos: ['Navio'] },
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
  __resetSettingsForTests()
  __resetDraftsForTests()
  __resetPublishedForTests()
  // a nota real já traz o terreno pintado do mapa: cada teste parte de um
  // mundo todo Gramado, sem rotas (e pinta o que precisa)
  terrenoPublicado({})
  __setSeedsForTests({})
  __resetMapaAtlasForTests()
  __resetGroupStoreMemoryForTests()
  __resetHexMapStoreMemoryForTests()
  // trilha vertical col 60, linhas 20..22 (adjacentes), paradas nas pontas
  setGroupStateFull(GROUP_ID, {
    grade: 'mundo',
    hexes: [
      { id: 'a', col: 60, row: 20, kind: 'parada' },
      { id: 'b', col: 60, row: 21, kind: 'caminho' },
      { id: 'c', col: 60, row: 22, kind: 'parada' },
    ],
  })
})
afterEach(cleanup)
afterAll(() => {
  setActiveContexto(null)
  __resetSettingsForTests()
})

const TERRENO_ID = 'Atlas/Mundo Livre/Terreno do Mundo Livre'
/** Terreno do mundo PUBLICADO (overlay que todo viewer lê): camada base
 *  (`Terreno`) + camada de rotas (`Rotas`). */
function terrenoPublicado(t: Record<string, string[]>, rotas: Record<string, string[]> = {}) {
  __setPublishedForTests({ [TERRENO_ID]: { frontmatter: { Terreno: t, Rotas: rotas } } })
}
function ligarDev() {
  window.localStorage.setItem('pleitost.settings.desenvolvedor', 'true')
  __resetSettingsForTests()
}

function renderPanel(def: ContextoDef | null) {
  setActiveContexto(def)
  const catalog = { ...baseCatalog, contextoDef: def }
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter>
        <PanelExploracao groupId={GROUP_ID} />
      </MemoryRouter>
    </CatalogProvider>,
  )
}

describe('tempo de viagem na exploração', () => {
  it('total da trilha em dias, com o terreno lido da nota do mundo (overlay publicado)', async () => {
    // 60,21 = gramado + estrada (Caravana padrão: ⅕) · 60,22 = difícil (a pé: 1)
    terrenoPublicado({ dificil: ['60,22'] }, { estrada: ['60,21'] })
    const { container } = renderPanel(DEF)
    await waitFor(() => expect(container.querySelector('[data-viagem-total]')!.textContent).toContain('1⅕ dias'))
  })

  it('rascunho local do Modo Dev vence o publicado (só pro dev)', async () => {
    terrenoPublicado({ dificil: ['60,22'] })
    ligarDev()
    window.localStorage.setItem(
      'pleitost.compendio.drafts',
      JSON.stringify({ [TERRENO_ID]: { frontmatter: { Terreno: { muito_dificil: ['60,22'] } } } }),
    )
    __resetDraftsForTests()
    const { container } = renderPanel(DEF)
    // ½ (gramado) + 1½ (montanha a pé)
    await waitFor(() => expect(container.querySelector('[data-viagem-total]')!.textContent).toContain('2 dias'))
  })

  it('padrões da config: estrada → Caravana 🐪; embarque e desembarque → Barco ⛵ (ícones nos passos)', async () => {
    setGroupStateFull(GROUP_ID, {
      grade: 'mundo',
      hexes: [
        { id: 'a', col: 60, row: 20, kind: 'parada' },
        { id: 'b', col: 60, row: 21, kind: 'caminho' },
        { id: 'c', col: 60, row: 22, kind: 'caminho' },
        { id: 'd', col: 60, row: 23, kind: 'caminho' },
        { id: 'e', col: 60, row: 24, kind: 'parada' },
      ],
    })
    terrenoPublicado({ mar: ['60,22'] }, { estrada: ['60,21'] })
    const { container } = renderPanel(DEF)
    await waitFor(() => expect(container.querySelector('[data-collapsed-run="a"]')).not.toBeNull())
    fireEvent.click(container.querySelector('[data-collapsed-run="a"]')!)
    await waitFor(() => expect(container.querySelector('[data-viagem-passo="b"]')!.textContent).toBe('🐪 ⅕ dia'))
    expect(container.querySelector('[data-viagem-passo="c"]')!.textContent).toBe('⛵ ⅕ dia') // embarca
    expect(container.querySelector('[data-viagem-passo="d"]')!.textContent).toBe('⛵ ⅕ dia') // desembarca
    expect(container.querySelector('[data-viagem-passo="b"]')!.getAttribute('title')).toBe('⅕ dia · Caravana · Gramado + Estrada')
    expect(container.querySelector('[data-viagem-bloqueado]')).toBeNull()
  })

  it('PARADA mostra o tempo desde a parada anterior + ícones do trecho; caminho e conector não mostram tempo', async () => {
    // a(parada) → b mar, c gramado (caminho) → d(parada, gramado) → e(parada, estrada)
    setGroupStateFull(GROUP_ID, {
      grade: 'mundo',
      hexes: [
        { id: 'a', col: 60, row: 20, kind: 'parada' },
        { id: 'b', col: 60, row: 21, kind: 'caminho' },
        { id: 'c', col: 60, row: 22, kind: 'caminho' },
        { id: 'd', col: 60, row: 23, kind: 'parada' },
        { id: 'e', col: 60, row: 24, kind: 'parada' },
      ],
    })
    terrenoPublicado({ mar: ['60,21'] }, { estrada: ['60,24'] })
    const { container } = renderPanel(DEF)
    await waitFor(() => expect(container.querySelector('[data-viagem-trecho="d"]')).not.toBeNull())
    // 1ª parada: nada
    expect(container.querySelector('[data-viagem-trecho="a"]')).toBeNull()
    // d: barco ⅖ (embarca + desembarca) + a pé ½ = 0,9 dia, ícones na ordem da viagem
    const td = container.querySelector('[data-parada="d"] [data-viagem-trecho="d"]')!
    expect(td.textContent).toBe('⛵🚶 0,9 dia')
    expect(td.getAttribute('title')).toBe('Desde a parada anterior: 0,9 dia\n⛵ Barco · ⅖ dia\n🚶 A pé · ½ dia')
    expect(container.querySelector('[data-viagem-trecho="e"]')!.textContent).toBe('🐪 ⅕ dia')
    // linha do caminho (recolhida e aberta) sem tempo, mas com os ícones dos
    // meios do trecho que ela percorre; sem conector ↓
    expect(container.querySelector('[data-collapsed-run="a"] [data-viagem-segmento]')).toBeNull()
    expect(container.querySelector('[data-collapsed-run="a"]')!.textContent).not.toMatch(/dia/)
    expect(container.querySelector('[data-viagem-rota-meios="a"]')!.textContent).toBe('⛵🚶')
    expect(container.querySelector('[data-viagem-conector]')).toBeNull()
    fireEvent.click(container.querySelector('[data-collapsed-run="a"]')!)
    expect(container.querySelector('[data-collapse-run="a"]')!.textContent).not.toMatch(/dia/)
    // total segue ao lado de // CAMINHO
    expect(container.querySelector('[data-viagem-total]')!.textContent).toContain('1,1 dias')
  })

  it('2026-10-06: caminho ANTES da 1ª parada não conta — 1ª parada sem tempo, fora do total, rota sem ícones', async () => {
    setGroupStateFull(GROUP_ID, {
      grade: 'mundo',
      hexes: [
        { id: 'a', col: 60, row: 20, kind: 'caminho' },
        { id: 'b', col: 60, row: 21, kind: 'caminho' },
        { id: 'c', col: 60, row: 22, kind: 'parada' },
        { id: 'd', col: 60, row: 23, kind: 'parada' },
      ],
    })
    const { container } = renderPanel(DEF)
    await waitFor(() => expect(container.querySelector('[data-viagem-trecho="d"]')!.textContent).toBe('🚶 ½ dia'))
    expect(container.querySelector('[data-viagem-trecho="c"]')).toBeNull()
    expect(container.querySelector('[data-viagem-total]')!.textContent).toContain('½ dia')
    expect(container.querySelector('[data-viagem-rota-meios]')).toBeNull()
    fireEvent.click(container.querySelector('[data-editar-trilha]')!)
    expect(container.querySelector('[data-meio-trecho="c"]')).toBeNull()
    expect(container.querySelector('[data-meio-rota]')).toBeNull()
    fireEvent.click(container.querySelector('[data-collapsed-run="lead"]')!)
    expect(container.querySelector('[data-viagem-passo]')).toBeNull()
    expect(container.querySelector('[data-viagem-rota-meios]')).toBeNull()
  })

  it('2026-10-06: caminho DEPOIS da última parada não conta — sem tempo, sem seletor, sem ícones', async () => {
    setGroupStateFull(GROUP_ID, {
      grade: 'mundo',
      hexes: [
        { id: 'a', col: 60, row: 20, kind: 'parada' },
        { id: 'b', col: 60, row: 21, kind: 'parada' },
        { id: 'c', col: 60, row: 22, kind: 'caminho' },
        { id: 'd', col: 60, row: 23, kind: 'caminho' },
      ],
    })
    terrenoPublicado({ dificil: ['60,22', '60,23'] })
    const { container } = renderPanel(DEF)
    await waitFor(() => expect(container.querySelector('[data-viagem-total]')!.textContent).toContain('½ dia'))
    expect(container.querySelector('[data-viagem-rota-meios]')).toBeNull()
    fireEvent.click(container.querySelector('[data-editar-trilha]')!)
    expect(container.querySelector('[data-meio-rota]')).toBeNull()
    fireEvent.click(container.querySelector('[data-collapsed-run="b"]')!)
    expect(container.querySelector('[data-viagem-passo]')).toBeNull()
    expect(container.querySelector('[data-viagem-rota-meios]')).toBeNull()
  })

  it('só caminho + uma parada: nenhum trecho, sem total', async () => {
    setGroupStateFull(GROUP_ID, {
      grade: 'mundo',
      hexes: [
        { id: 'a', col: 60, row: 20, kind: 'parada' },
        { id: 'b', col: 60, row: 21, kind: 'caminho' },
      ],
    })
    const { container } = renderPanel(DEF)
    await waitFor(() => expect(container.querySelector('[data-parada="a"]')).not.toBeNull())
    expect(container.querySelector('[data-viagem-total]')).toBeNull()
  })

  it('linha da ROTA: um ícone com um meio só, vários (em ordem) com meios misturados — recolhida e aberta', async () => {
    setGroupStateFull(GROUP_ID, {
      grade: 'mundo',
      hexes: [
        { id: 'a', col: 60, row: 20, kind: 'parada' },
        { id: 'b', col: 60, row: 21, kind: 'caminho' },
        { id: 'c', col: 60, row: 22, kind: 'parada' },
        { id: 'd', col: 60, row: 23, kind: 'caminho' },
        { id: 'e', col: 60, row: 24, kind: 'parada' },
      ],
    })
    terrenoPublicado({}, { estrada: ['60,21'] })
    const { container } = renderPanel(DEF)
    await waitFor(() => expect(container.querySelector('[data-viagem-rota-meios="a"]')).not.toBeNull())
    expect(container.querySelector('[data-viagem-rota-meios="a"]')!.textContent).toBe('🐪🚶')
    expect(container.querySelector('[data-viagem-rota-meios="c"]')!.textContent).toBe('🚶')
    fireEvent.click(container.querySelector('[data-collapsed-run="a"]')!)
    expect(container.querySelector('[data-collapse-run="a"]')).not.toBeNull()
    expect(container.querySelector('[data-viagem-rota-meios="a"]')!.textContent).toBe('🐪🚶')
    // no EDITAR, o seletor fica ao lado dos ícones
    fireEvent.click(container.querySelector('[data-editar-trilha]')!)
    expect(container.querySelector('[data-viagem-rota-meios="a"]')!.textContent).toBe('🐪🚶')
    expect(container.querySelector('[data-meio-rota="c"]')).not.toBeNull()
    expect(container.querySelector('[data-meio-rota="e"]')).not.toBeNull()
  })

  it('trecho bloqueado: ⚠ vermelho com hex e terreno no tooltip', async () => {
    setGroupStateFull(GROUP_ID, {
      grade: 'mundo',
      hexes: [
        { id: 'a', col: 60, row: 20, kind: 'parada' },
        { id: 'b', col: 60, row: 21, kind: 'parada' },
      ],
    })
    terrenoPublicado({ mar: ['60,20', '60,21'] })
    // config sem barco automático: mar → mar fica sem meio (a pé só faz a costa)
    const semNavio = {
      ...DEF,
      viagem: { ...DEF.viagem!, meios: DEF.viagem!.meios.map((m) => (m.nome === 'Barco' ? { ...m, padrao: false } : m)) },
    } as ContextoDef
    const { container } = renderPanel(semNavio)
    await waitFor(() => expect(container.querySelector('[data-viagem-trecho-bloqueado]')).not.toBeNull())
    const t = container.querySelector('[data-viagem-trecho="b"]')!
    expect(t.textContent).toContain('⚠')
    expect(t.getAttribute('title')).toContain('hex 60,21 (Mar)')
    expect(container.querySelector('[data-viagem-bloqueado]')).not.toBeNull()
  })

  it('sem chips de meios do grupo; seletor de meio por trecho só no EDITAR (nunca na 1ª linha)', async () => {
    setGroupStateFull(GROUP_ID, {
      grade: 'mundo',
      hexes: [
        { id: 'a', col: 60, row: 20, kind: 'parada' },
        { id: 'b', col: 60, row: 21, kind: 'caminho' },
        { id: 'c', col: 60, row: 22, kind: 'parada' },
      ],
    })
    const { container } = renderPanel(DEF)
    await waitFor(() => expect(container.querySelector('[data-viagem-trecho="c"]')).not.toBeNull())
    expect(container.querySelector('[data-viagem-meios]')).toBeNull()
    expect(container.querySelector('[data-meio-trecho]')).toBeNull()
    fireEvent.click(container.querySelector('[data-editar-trilha]')!)
    expect(container.querySelector('[data-viagem-meios]')).toBeNull()
    expect(container.querySelector('[data-meio-trecho="a"]')).toBeNull()
    const sel = container.querySelector('[data-meio-trecho="c"]')!
    expect(sel.textContent).toBe('AUTO')
    fireEvent.click(container.querySelector('[data-concluir-edicao]')!)
    expect(container.querySelector('[data-meio-trecho]')).toBeNull()
  })

  it('Cavalo num trecho de gramado: ½ → ⅓ por hex; limpar volta ao automático', async () => {
    setGroupStateFull(GROUP_ID, {
      grade: 'mundo',
      hexes: [
        { id: 'a', col: 60, row: 20, kind: 'parada' },
        { id: 'b', col: 60, row: 21, kind: 'caminho' },
        { id: 'c', col: 60, row: 22, kind: 'parada' },
      ],
    })
    const { container } = renderPanel(DEF)
    await waitFor(() => expect(container.querySelector('[data-viagem-trecho="c"]')!.textContent).toBe('🚶 1 dia'))
    fireEvent.click(container.querySelector('[data-editar-trilha]')!)
    fireEvent.click(container.querySelector('[data-meio-trecho="c"]')!)
    const menu = container.querySelector('[data-meio-menu="c"]')!
    expect([...menu.querySelectorAll('[role="menuitemradio"]')].map((b) => b.getAttribute('data-meio-opcao'))).toEqual([
      '',
      'A pé',
      'Cavalo',
      'Caravana',
      'Barco',
    ])
    expect(menu.querySelector('[data-meio-opcao=""]')!.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(menu.querySelector('[data-meio-opcao="Cavalo"]')!)
    expect(getGroupState(GROUP_ID).hexes.find((h) => h.id === 'c')!.meio).toBe('Cavalo')
    expect(container.querySelector('[data-meio-menu]')).toBeNull() // fecha ao escolher
    await waitFor(() => expect(container.querySelector('[data-viagem-trecho="c"]')!.textContent).toBe('🐎 ⅔ dia'))
    expect(container.querySelector('[data-meio-trecho="c"]')!.textContent).toBe('🐎')
    // limpar
    fireEvent.click(container.querySelector('[data-meio-trecho="c"]')!)
    fireEvent.click(container.querySelector('[data-meio-opcao=""]')!)
    expect(getGroupState(GROUP_ID).hexes.find((h) => h.id === 'c')!.meio).toBeUndefined()
    await waitFor(() => expect(container.querySelector('[data-viagem-trecho="c"]')!.textContent).toBe('🚶 1 dia'))
  })

  it('menu fecha com Escape e com clique fora', async () => {
    setGroupStateFull(GROUP_ID, {
      grade: 'mundo',
      hexes: [
        { id: 'a', col: 60, row: 20, kind: 'parada' },
        { id: 'c', col: 60, row: 21, kind: 'parada' },
      ],
    })
    const { container } = renderPanel(DEF)
    await waitFor(() => expect(container.querySelector('[data-viagem-trecho="c"]')).not.toBeNull())
    fireEvent.click(container.querySelector('[data-editar-trilha]')!)
    fireEvent.click(container.querySelector('[data-meio-trecho="c"]')!)
    expect(container.querySelector('[data-meio-menu="c"]')).not.toBeNull()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(container.querySelector('[data-meio-menu]')).toBeNull()
    fireEvent.click(container.querySelector('[data-meio-trecho="c"]')!)
    fireEvent.pointerDown(document.body)
    expect(container.querySelector('[data-meio-menu]')).toBeNull()
  })

  it('Carruagem gravada (nome antigo = Caravana) num trecho estrada + gramado: 🐪 na estrada, automático no gramado', async () => {
    setGroupStateFull(GROUP_ID, {
      grade: 'mundo',
      hexes: [
        { id: 'a', col: 60, row: 20, kind: 'parada' },
        { id: 'b', col: 60, row: 21, kind: 'caminho' },
        { id: 'c', col: 60, row: 22, kind: 'parada', meio: 'Carruagem' },
      ],
    })
    terrenoPublicado({}, { estrada: ['60,21'] })
    const { container } = renderPanel(DEF)
    await waitFor(() => expect(container.querySelector('[data-viagem-trecho="c"]')!.textContent).toBe('🐪🚶 0,7 dia'))
    expect(container.querySelector('[data-viagem-trecho="c"]')!.getAttribute('title')).toBe(
      'Desde a parada anterior: 0,7 dia\n🐪 Caravana · ⅕ dia\n🚶 A pé (Gramado, sem Caravana) · ½ dia',
    )
  })

  it('Navio gravado (nome antigo = Barco) num trecho em terra: automático em tudo (🚶)', async () => {
    setGroupStateFull(GROUP_ID, {
      grade: 'mundo',
      hexes: [
        { id: 'a', col: 60, row: 20, kind: 'parada' },
        { id: 'c', col: 60, row: 22, kind: 'parada', meio: 'Navio' },
      ],
    })
    const { container } = renderPanel(DEF)
    await waitFor(() => expect(container.querySelector('[data-viagem-trecho="c"]')!.textContent).toBe('🚶 1 dia'))
  })

  it('report 2026-10-06: o menu mostra o TEMPO do trecho com cada meio e marca quem não anda ali', async () => {
    // sem terreno pintado (tudo Gramado): Carruagem/Navio caíam no automático
    // em silêncio — o botão virava 🐪 e o tempo não mudava ("não muda").
    setGroupStateFull(GROUP_ID, {
      grade: 'mundo',
      hexes: [
        { id: 'a', col: 60, row: 20, kind: 'parada' },
        { id: 'b', col: 60, row: 21, kind: 'caminho' },
        { id: 'c', col: 60, row: 22, kind: 'parada' },
      ],
    })
    const { container } = renderPanel(DEF)
    await waitFor(() => expect(container.querySelector('[data-viagem-trecho="c"]')).not.toBeNull())
    fireEvent.click(container.querySelector('[data-editar-trilha]')!)
    fireEvent.click(container.querySelector('[data-meio-trecho="c"]')!)
    const menu = container.querySelector('[data-meio-menu="c"]')!
    const previa = (m: string) => menu.querySelector(`[data-meio-opcao="${m}"] [data-meio-previa]`)?.textContent
    expect(previa('')).toBe('🚶 1 dia')
    expect(previa('A pé')).toBe('🚶 1 dia')
    expect(previa('Cavalo')).toBe('🐎 ⅔ dia')
    expect(previa('Caravana')).toBe('🚶 1 dia')
    // quem não anda em NENHUM hex do trecho fica marcado, com o terreno/rota da config
    const carr = menu.querySelector('[data-meio-opcao="Caravana"]')!
    expect(carr.hasAttribute('data-meio-inutil')).toBe(true)
    expect(carr.textContent).toContain('só em Estrada')
    expect(menu.querySelector('[data-meio-opcao="Barco"]')!.textContent).toContain('só em Mar')
    expect(menu.querySelector('[data-meio-opcao="Cavalo"]')!.hasAttribute('data-meio-inutil')).toBe(false)
    // continua selecionável (a regra "respeita o terreno" não muda)
    fireEvent.click(carr)
    expect(getGroupState(GROUP_ID).hexes.find((h) => h.id === 'c')!.meio).toBe('Caravana')
  })

  it('com estrada no trecho, a prévia da Caravana mostra o ganho', async () => {
    setGroupStateFull(GROUP_ID, {
      grade: 'mundo',
      hexes: [
        { id: 'a', col: 60, row: 20, kind: 'parada' },
        { id: 'b', col: 60, row: 21, kind: 'caminho' },
        { id: 'c', col: 60, row: 22, kind: 'parada' },
      ],
    })
    terrenoPublicado({}, { estrada: ['60,21', '60,22'] })
    const { container } = renderPanel(DEF)
    await waitFor(() => expect(container.querySelector('[data-viagem-trecho="c"]')!.textContent).toBe('🐪 ⅖ dia'))
    fireEvent.click(container.querySelector('[data-editar-trilha]')!)
    fireEvent.click(container.querySelector('[data-meio-trecho="c"]')!)
    const menu = container.querySelector('[data-meio-menu="c"]')!
    expect(menu.querySelector('[data-meio-opcao="A pé"] [data-meio-previa]')!.textContent).toBe('🚶 1 dia')
    expect(menu.querySelector('[data-meio-opcao="Caravana"] [data-meio-previa]')!.textContent).toBe('🐪 ⅖ dia')
    expect(menu.querySelector('[data-meio-opcao="Caravana"]')!.hasAttribute('data-meio-inutil')).toBe(false)
    // cavalo também ganha da estrada (+1): ¼ por hex
    expect(menu.querySelector('[data-meio-opcao="Cavalo"] [data-meio-previa]')!.textContent).toBe('🐎 ½ dia')
  })

  it('report 2026-10-06: a ROTA (N HEX) também tem o seletor do trecho que ela percorre (só no EDITAR)', async () => {
    setGroupStateFull(GROUP_ID, {
      grade: 'mundo',
      hexes: [
        { id: 'a', col: 60, row: 20, kind: 'parada' },
        { id: 'b', col: 60, row: 21, kind: 'caminho' },
        { id: 'c', col: 60, row: 22, kind: 'parada' },
        { id: 'd', col: 60, row: 23, kind: 'caminho' },
      ],
    })
    const { container } = renderPanel(DEF)
    await waitFor(() => expect(container.querySelector('[data-collapsed-run="a"]')).not.toBeNull())
    expect(container.querySelector('[data-meio-rota]')).toBeNull()
    fireEvent.click(container.querySelector('[data-editar-trilha]')!)
    // a rota a→c ganha o seletor (do trecho que chega em c); a rota depois da
    // última parada não tem trecho (automático) → sem seletor
    const rota = container.querySelector('[data-meio-rota="c"]')!
    expect(rota.textContent).toBe('AUTO')
    expect(container.querySelectorAll('[data-meio-rota]')).toHaveLength(1)
    fireEvent.click(rota)
    const menu = container.querySelector('[data-meio-menu="c"]')!
    fireEvent.click(menu.querySelector('[data-meio-opcao="Cavalo"]')!)
    expect(getGroupState(GROUP_ID).hexes.find((h) => h.id === 'c')!.meio).toBe('Cavalo')
    await waitFor(() => expect(container.querySelector('[data-meio-rota="c"]')!.textContent).toBe('🐎'))
    expect(container.querySelector('[data-meio-trecho="c"]')!.textContent).toBe('🐎')
    expect(container.querySelector('[data-viagem-trecho="c"]')!.textContent).toBe('🐎 ⅔ dia')
    // rota aberta (RECOLHER) mantém o seletor
    fireEvent.click(container.querySelector('[data-collapsed-run="a"]')!)
    expect(container.querySelector('[data-meio-rota="c"]')).not.toBeNull()
    expect(container.querySelector('[data-viagem-passo="b"]')!.textContent).toBe('🐎 ⅓ dia')
  })

  it('sync: `meio` da parada sobrevive à serialização, ao repo (setExploracao) e à hidratação', async () => {
    setMeioTrecho(GROUP_ID, 'c', 'Cavalo')
    expect(getGroupState(GROUP_ID).hexes.find((h) => h.id === 'c')!.meio).toBe('Cavalo')
    expect(groupStateJson(getGroupState(GROUP_ID))).toContain('"meio":"Cavalo"')
    const repo = new InMemorySessionRepo()
    const sess = await repo.createSession({ name: 'm', gmUserId: 'gm', code: 'X1' })
    await repo.setExploracao(sess.id, { ...getGroupState(GROUP_ID) })
    const remoto = (await repo.findSessionById(sess.id))!.state.exploracao!
    __resetGroupStoreMemoryForTests()
    window.localStorage.clear()
    setGroupStateFull(GROUP_ID, JSON.parse(JSON.stringify(remoto)))
    expect(getGroupState(GROUP_ID).hexes.find((h) => h.id === 'c')!.meio).toBe('Cavalo')
    __resetGroupStoreMemoryForTests() // reload: hidrata do localStorage
    expect(getGroupState(GROUP_ID).hexes.find((h) => h.id === 'c')!.meio).toBe('Cavalo')
    setMeioTrecho(GROUP_ID, 'c', null)
    expect('meio' in getGroupState(GROUP_ID).hexes.find((h) => h.id === 'c')!).toBe(false)
  })

  it('popover da parada mostra o terreno e o tempo pra cruzar o hex com o meio', async () => {
    terrenoPublicado({}, { estrada: ['60,21'] })
    const { container } = renderPanel(DEF)
    await waitFor(() => expect(container.querySelector('[data-collapsed-run]')).not.toBeNull())
    fireEvent.click(container.querySelector('[data-collapsed-run]')!)
    fireEvent.click(container.querySelector('[data-parada="b"]')!)
    await waitFor(() => expect(container.querySelector('[data-hex-terreno="normal"]')).not.toBeNull())
    const info = container.querySelector('[data-hex-terreno="normal"]')!
    expect(info.getAttribute('data-hex-rota')).toBe('estrada')
    expect(info.textContent).toContain('Gramado + Estrada · ⅕ dia com Caravana')
  })

  it('sem `viagem` no contexto: nada de tempo de viagem', async () => {
    const { container } = renderPanel(null)
    await waitFor(() => expect(container.querySelector('[data-parada="a"]')).not.toBeNull())
    fireEvent.click(container.querySelector('[data-editar-trilha]')!)
    expect(container.querySelector('[data-viagem-total]')).toBeNull()
    expect(container.querySelector('[data-viagem-meios]')).toBeNull()
    expect(container.querySelector('[data-viagem-trecho]')).toBeNull()
  })
})

// ── Pintor de TERRENO (Modo Dev) ─────────────────────────────────────────────
const cropAtivo = () => vistaCrop(MAPA_VISTAS[0]!.id, getMapaAtlas().regioes)
const W = 400
const H = 540
function coords(cell: { col: number; row: number }) {
  const crop = cropAtivo()
  const c = atlasHexCenter(cell.col, cell.row)
  return { clientX: ((c.x - crop.x) / crop.w) * W, clientY: ((c.y - crop.y) / crop.h) * H, pointerId: 1, button: 0 }
}
async function mapaPronto(container: HTMLElement) {
  await waitFor(() => expect(container.querySelector('[data-mapa]')).not.toBeNull())
  const mapa = container.querySelector('[data-mapa]') as HTMLElement
  mapa.getBoundingClientRect = () => ({ left: 0, top: 0, right: W, bottom: H, width: W, height: H, x: 0, y: 0 }) as DOMRect
  return container.querySelector('[data-mapa-viewport]') as HTMLElement
}

describe('pintor de terreno NÃO mora na Exploração (2026-10-07: só no Atlas)', () => {
  it('nem com Modo Dev há ✎ TERRENO', async () => {
    ligarDev()
    const { container } = renderPanel(DEF)
    await mapaPronto(container)
    await waitFor(() => expect(container.querySelector('[data-viagem-total]')).not.toBeNull())
    expect(container.querySelector('[data-pintor-terreno-toggle]')).toBeNull()
  })
})

// MEIO POR ITEM (2026-10-06, "trecho define, item ajusta"): no EDITAR, cada
// hex DENTRO de um trecho (filho da rota aberta e a própria parada de
// chegada) ganha um seletor pequeno que ajusta SÓ o passo que entra nele
// (`GroupHex.meioPasso`). "Herdar do trecho" limpa. Trocar o meio do trecho
// limpa os ajustes daquele trecho.
describe('meio por item do caminho', () => {
  const trilha = () =>
    setGroupStateFull(GROUP_ID, {
      grade: 'mundo',
      hexes: [
        { id: 'a', col: 60, row: 20, kind: 'parada' },
        { id: 'b', col: 60, row: 21, kind: 'caminho' },
        { id: 'c', col: 60, row: 22, kind: 'caminho' },
        { id: 'd', col: 60, row: 23, kind: 'parada' },
        { id: 'e', col: 60, row: 24, kind: 'caminho' },
        { id: 'f', col: 60, row: 25, kind: 'parada' },
      ],
    })
  const meioPasso = (id: string) => getGroupState(GROUP_ID).hexes.find((h) => h.id === id)!.meioPasso

  it('store: setMeioPasso grava/limpa; setMeioTrecho limpa os ajustes SÓ do trecho; sync preserva', () => {
    trilha()
    setMeioPasso(GROUP_ID, 'b', 'Cavalo')
    setMeioPasso(GROUP_ID, 'd', 'Cavalo')
    setMeioPasso(GROUP_ID, 'e', 'Cavalo')
    expect(meioPasso('b')).toBe('Cavalo')
    expect(groupStateJson(getGroupState(GROUP_ID))).toContain('"meioPasso":"Cavalo"')
    __resetGroupStoreMemoryForTests() // reload: hidrata do localStorage
    expect(meioPasso('b')).toBe('Cavalo')
    setMeioPasso(GROUP_ID, 'b', null)
    expect('meioPasso' in getGroupState(GROUP_ID).hexes.find((h) => h.id === 'b')!).toBe(false)
    setMeioPasso(GROUP_ID, 'b', 'A pé')
    setMeioTrecho(GROUP_ID, 'd', 'Navio') // trecho a→d = b, c, d
    expect(meioPasso('b')).toBeUndefined()
    expect(meioPasso('d')).toBeUndefined()
    expect(meioPasso('e')).toBe('Cavalo') // outro trecho (d→f)
    expect(getGroupState(GROUP_ID).hexes.find((h) => h.id === 'd')!.meio).toBe('Navio')
  })

  it('seletor por item só no EDITAR, só dentro de trechos (filhos + parada de chegada)', async () => {
    trilha()
    const { container } = renderPanel(DEF)
    await waitFor(() => expect(container.querySelector('[data-collapsed-run="a"]')).not.toBeNull())
    fireEvent.click(container.querySelector('[data-collapsed-run="a"]')!)
    expect(container.querySelector('[data-meio-passo]')).toBeNull()
    fireEvent.click(container.querySelector('[data-editar-trilha]')!)
    const ids = [...container.querySelectorAll('[data-meio-passo]')].map((b) => b.getAttribute('data-meio-passo'))
    // 'a' é a partida; o passo da PARADA de chegada só com a rota dela aberta
    expect(ids).toEqual(['b', 'c', 'd'])
    fireEvent.click(container.querySelector('[data-collapsed-run="d"]')!)
    const ids2 = [...container.querySelectorAll('[data-meio-passo]')].map((b) => b.getAttribute('data-meio-passo'))
    expect(ids2).toEqual(['b', 'c', 'd', 'e', 'f'])
  })

  it('trecho de um passo só (parada → parada) não ganha seletor extra', async () => {
    const { container } = renderPanel(DEF)
    setGroupStateFull(GROUP_ID, {
      grade: 'mundo',
      hexes: [
        { id: 'a', col: 60, row: 20, kind: 'parada' },
        { id: 'c', col: 60, row: 21, kind: 'parada' },
      ],
    })
    await waitFor(() => expect(container.querySelector('[data-editar-trilha]')).not.toBeNull())
    fireEvent.click(container.querySelector('[data-editar-trilha]')!)
    await waitFor(() => expect(container.querySelector('[data-meio-trecho="c"]')).not.toBeNull())
    expect(container.querySelector('[data-meio-passo]')).toBeNull()
  })

  it('escolher um meio pro item muda só aquele passo; Herdar do trecho limpa', async () => {
    trilha()
    const { container } = renderPanel(DEF)
    await waitFor(() => expect(container.querySelector('[data-collapsed-run="a"]')).not.toBeNull())
    fireEvent.click(container.querySelector('[data-collapsed-run="a"]')!)
    fireEvent.click(container.querySelector('[data-editar-trilha]')!)
    fireEvent.click(container.querySelector('[data-meio-passo="c"]')!)
    const menu = container.querySelector('[data-meio-menu="c"]')!
    expect([...menu.querySelectorAll('[role="menuitemradio"]')].map((b) => b.getAttribute('data-meio-opcao'))).toEqual([
      '',
      'A pé',
      'Cavalo',
      'Caravana',
      'Barco',
    ])
    expect(menu.querySelector('[data-meio-opcao=""]')!.textContent).toContain('Herdar do trecho')
    expect(menu.querySelector('[data-meio-opcao=""]')!.getAttribute('aria-checked')).toBe('true')
    const previa = (m: string) => menu.querySelector(`[data-meio-opcao="${m}"] [data-meio-previa]`)?.textContent
    expect(previa('')).toBe('🚶 ½ dia')
    expect(previa('Cavalo')).toBe('🐎 ⅓ dia')
    expect(menu.querySelector('[data-meio-opcao="Barco"]')!.hasAttribute('data-meio-inutil')).toBe(true)
    expect(menu.querySelector('[data-meio-opcao="Barco"]')!.textContent).toContain('só em Mar')
    fireEvent.click(menu.querySelector('[data-meio-opcao="Cavalo"]')!)
    expect(meioPasso('c')).toBe('Cavalo')
    expect(container.querySelector('[data-meio-menu]')).toBeNull()
    await waitFor(() => expect(container.querySelector('[data-viagem-passo="c"]')!.textContent).toBe('🐎 ⅓ dia'))
    expect(container.querySelector('[data-viagem-passo="b"]')!.textContent).toBe('🚶 ½ dia')
    expect(container.querySelector('[data-viagem-trecho="d"]')!.textContent).toBe('🚶🐎 1⅓ dias')
    const btn = container.querySelector('[data-meio-passo="c"]')!
    expect(btn.hasAttribute('data-meio-passo-ajustado')).toBe(true)
    expect(btn.textContent).toBe('🐎')
    expect(container.querySelector('[data-meio-passo="b"]')!.hasAttribute('data-meio-passo-ajustado')).toBe(false)
    // herdar
    fireEvent.click(btn)
    fireEvent.click(container.querySelector('[data-meio-menu="c"] [data-meio-opcao=""]')!)
    expect(meioPasso('c')).toBeUndefined()
    await waitFor(() => expect(container.querySelector('[data-viagem-passo="c"]')!.textContent).toBe('🚶 ½ dia'))
  })

  it('trocar o meio do TRECHO limpa os ajustes dos itens dele', async () => {
    trilha()
    setMeioPasso(GROUP_ID, 'b', 'Cavalo')
    const { container } = renderPanel(DEF)
    await waitFor(() => expect(container.querySelector('[data-meio-trecho]') ?? container.querySelector('[data-editar-trilha]')).not.toBeNull())
    fireEvent.click(container.querySelector('[data-editar-trilha]')!)
    fireEvent.click(container.querySelector('[data-meio-trecho="d"]')!)
    fireEvent.click(container.querySelector('[data-meio-menu="d"] [data-meio-opcao="A pé"]')!)
    expect(meioPasso('b')).toBeUndefined()
  })
})

describe('Portal (meio instantâneo, 2026-10-06)', () => {
  const DEF_PORTAL = {
    ...DEF,
    viagem: {
      ...DEF.viagem!,
      meios: [
        ...DEF.viagem!.meios,
        { nome: 'Portal', icone: '✨', hexPorDia: 0, instantaneo: true, em: ['normal', 'dificil', 'muito_dificil', 'mar'] },
      ],
    },
  } as ContextoDef

  it('trecho com Portal: ✨ 0 dias na linha da parada e ✨ na rota; prévia do menu mostra 0 dias', async () => {
    setGroupStateFull(GROUP_ID, {
      grade: 'mundo',
      hexes: [
        { id: 'a', col: 60, row: 20, kind: 'parada' },
        { id: 'b', col: 60, row: 21, kind: 'caminho' },
        { id: 'c', col: 60, row: 22, kind: 'parada', meio: 'Portal' },
      ],
    })
    terrenoPublicado({ mar: ['60,21'] })
    const { container } = renderPanel(DEF_PORTAL)
    await waitFor(() => expect(container.querySelector('[data-viagem-trecho="c"]')!.textContent).toBe('✨ 0 dias'))
    expect(container.querySelector('[data-viagem-rota-meios="a"]')!.textContent).toBe('✨')
    fireEvent.click(container.querySelector('[data-editar-trilha]')!)
    fireEvent.click(container.querySelector('[data-meio-trecho="c"]')!)
    const menu = container.querySelector('[data-meio-menu="c"]')!
    expect(menu.querySelector('[data-meio-opcao="Portal"] [data-meio-previa]')!.textContent).toBe('✨ 0 dias')
    // automático não usa o Portal
    expect(menu.querySelector('[data-meio-opcao=""] [data-meio-previa]')!.textContent).not.toContain('✨')
  })
})
