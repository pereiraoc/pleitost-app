// @vitest-environment jsdom
// MODIFICADORES DO MAPA (pedido 2026-10-06): botão no topo do mapa da
// EXPLORAÇÃO (pra todos, não só Modo Dev) liga marcas por hex lidas da nota de
// terreno (overlay-aware): difícil ▲, montanha ▲▲, mar onda, estrada losango,
// rota marítima anel, escadaria degrau — formas/nomes/cores da config. UM
// <path> por classe (DOM constante no gesto, #573). Estado por aparelho
// (localStorage). Legenda pequena ao lado quando ligado.
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


const DEF_M = {
  ...DEF,
  viagem: {
    ...DEF.viagem!,
    rotas: [...DEF.viagem!.rotas!, { chave: 'escadaria', nome: 'Escadaria', cor: '#e8d8b0', bonus: 1, meios: ['A pé'] }],
  },
} as ContextoDef
const CHAVE = 'pleitost.exploracao.modificadores'

describe('modificadores do mapa', () => {
  it('sem viagem na config (POA): sem botão', async () => {
    const { container } = renderPanel(null)
    await waitFor(() => expect(container.querySelector('[data-parada="a"]')).not.toBeNull())
    expect(container.querySelector('[data-modificadores-toggle]')).toBeNull()
  })

  it('desligado por padrão; ligar mostra UM path por classe + legenda; desligar some', async () => {
    terrenoPublicado(
      { dificil: ['60,20', '61,20', '62,20'], muito_dificil: ['60,21'], mar: ['59,20', '59,21'] },
      { estrada: ['61,20', '62,20'], rota_maritima: ['59,20'], escadaria: ['60,21'] },
    )
    const { container } = renderPanel(DEF_M)
    await waitFor(() => expect(container.querySelector('[data-modificadores-toggle]')).not.toBeNull())
    const btn = container.querySelector('[data-modificadores-toggle]')!
    expect(btn.getAttribute('title')).toBe('Mostrar modificadores do mapa')
    expect(btn.getAttribute('aria-pressed')).toBe('false')
    expect(container.querySelectorAll('[data-marca-mapa]')).toHaveLength(0)
    fireEvent.click(btn)
    await waitFor(() => expect(container.querySelectorAll('[data-marca-mapa]')).toHaveLength(6))
    const classes = [...container.querySelectorAll('[data-marca-mapa]')].map((p) => p.getAttribute('data-marca-mapa'))
    expect(classes).toEqual([
      'terreno:dificil',
      'terreno:muito_dificil',
      'terreno:mar',
      'rota:estrada',
      'rota:rota_maritima',
      'rota:escadaria',
    ])
    // dentro da camada transformada (mesmo SVG da trilha)
    const p = container.querySelector('[data-marca-mapa="terreno:dificil"]')!
    expect(p.closest('[data-mapa]')).not.toBeNull()
    expect((p.getAttribute('d')!.match(/M/g) ?? []).length).toBe(3)
    // legenda com os nomes da config
    const leg = container.querySelector('[data-modificadores-legenda]')!
    expect(leg.textContent).toContain('Difícil')
    expect(leg.textContent).toContain('Montanha')
    expect(leg.textContent).toContain('Mar')
    expect(leg.textContent).toContain('Estrada')
    expect(leg.textContent).toContain('Rota marítima')
    expect(leg.textContent).toContain('Escadaria')
    expect(window.localStorage.getItem(CHAVE)).toBe('1')
    fireEvent.click(btn)
    expect(container.querySelectorAll('[data-marca-mapa]')).toHaveLength(0)
    expect(container.querySelector('[data-modificadores-legenda]')).toBeNull()
    expect(window.localStorage.getItem(CHAVE)).toBe('0')
  })

  it('número de paths não cresce com o número de hexes', async () => {
    const muitos = Array.from({ length: 300 }, (_, i) => `${40 + (i % 30)},${10 + Math.floor(i / 30)}`)
    terrenoPublicado({ mar: muitos })
    window.localStorage.setItem(CHAVE, '1')
    const { container } = renderPanel(DEF_M)
    await waitFor(() => expect(container.querySelectorAll('[data-marca-mapa]')).toHaveLength(1))
  })

  it('estado persiste por aparelho: ligado no localStorage → já abre ligado', async () => {
    terrenoPublicado({ dificil: ['60,20'] })
    window.localStorage.setItem(CHAVE, '1')
    const { container } = renderPanel(DEF_M)
    await waitFor(() => expect(container.querySelector('[data-marca-mapa="terreno:dificil"]')).not.toBeNull())
    expect(container.querySelector('[data-modificadores-toggle]')!.getAttribute('aria-pressed')).toBe('true')
  })
})
