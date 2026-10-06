// @vitest-environment jsdom
// VIAGEM DO HEXCRAWL na aba EXPLORAÇÃO (2026-10-04, UX 2026-10-05): com o
// bloco `viagem` no Contexto-Def (Fantasia), a barra do CAMINHO mostra o total
// da trilha em DIAS; cada PARADA mostra o tempo desde a parada anterior + o(s)
// ícone(s) do meio (config); cada hex de caminho aberto mostra o próprio passo.
// O seletor de meios só aparece no EDITAR. O terreno é DADO DO MUNDO (nota
// `viagem.terreno`, FM `Terreno`), lido pelo doc efetivo (overlay publicado /
// rascunho do Modo Dev). O pintor (✎ TERRENO) só existe no Modo Dev e grava UM
// rascunho por traço. Sem o bloco (POA), nada de viagem aparece.
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
} from '../src/data/group-store'
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
      { chave: 'estrada', nome: 'Estrada', custo: 1, cor: '#c9a36b' },
      { chave: 'normal', nome: 'Gramado', custo: 1, cor: '#7fb069' },
      { chave: 'mar', nome: 'Mar navegável', custo: 1, cor: '#4a90c2' },
      { chave: 'dificil', nome: 'Difícil', custo: 2, cor: '#b5835a' },
      { chave: 'muito_dificil', nome: 'Montanha', custo: 3, cor: '#8a8a8a' },
    ],
    meios: [
      { nome: 'A pé', icone: '🚶', padrao: true, hexPorDia: 2, em: ['estrada', 'normal', 'dificil', 'muito_dificil'] },
      { nome: 'Cavalo', icone: '🐎', hexPorDia: 3, em: ['estrada', 'normal', 'dificil'] },
      { nome: 'Carruagem', icone: '🛞', padrao: true, hexPorDia: 4, em: ['estrada'] },
      { nome: 'Navio', icone: '⛵', padrao: true, hexPorDia: 5, em: ['mar'] },
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
  __setSeedsForTests({})
  __resetMapaAtlasForTests()
  __resetGroupStoreMemoryForTests()
  __resetHexMapStoreMemoryForTests()
  // trilha vertical col 60, linhas 20..22 (adjacentes), parada no início
  setGroupStateFull(GROUP_ID, {
    grade: 'mundo',
    hexes: [
      { id: 'a', col: 60, row: 20, kind: 'parada' },
      { id: 'b', col: 60, row: 21, kind: 'caminho' },
      { id: 'c', col: 60, row: 22, kind: 'caminho' },
    ],
  })
})
afterEach(cleanup)
afterAll(() => {
  setActiveContexto(null)
  __resetSettingsForTests()
})

const TERRENO_ID = 'Atlas/Mundo Livre/Terreno do Mundo Livre'
/** Terreno do mundo PUBLICADO (overlay que todo viewer lê). */
function terrenoPublicado(t: Record<string, string[]>) {
  __setPublishedForTests({ [TERRENO_ID]: { frontmatter: { Terreno: t } } })
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
    // 60,21 = estrada (Carruagem padrão: ¼) · 60,22 = difícil (a pé: 1)
    terrenoPublicado({ estrada: ['60,21'], dificil: ['60,22'] })
    const { container } = renderPanel(DEF)
    await waitFor(() => expect(container.querySelector('[data-viagem-total]')!.textContent).toContain('1¼ dias'))
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

  it('padrões da config: estrada → Carruagem 🛞, mar → Navio ⛵, gramado → A pé 🚶 (ícones nos passos)', async () => {
    setGroupStateFull(GROUP_ID, {
      grade: 'mundo',
      hexes: [
        { id: 'a', col: 60, row: 20, kind: 'parada' },
        { id: 'b', col: 60, row: 21, kind: 'caminho' },
        { id: 'c', col: 60, row: 22, kind: 'caminho' },
        { id: 'd', col: 60, row: 23, kind: 'caminho' },
      ],
    })
    terrenoPublicado({ estrada: ['60,21'], mar: ['60,22'] })
    const { container } = renderPanel(DEF)
    await waitFor(() => expect(container.querySelector('[data-collapsed-run="a"]')).not.toBeNull())
    fireEvent.click(container.querySelector('[data-collapsed-run="a"]')!)
    await waitFor(() => expect(container.querySelector('[data-viagem-passo="b"]')!.textContent).toBe('🛞 ¼ dia'))
    expect(container.querySelector('[data-viagem-passo="c"]')!.textContent).toBe('⛵ ⅕ dia')
    expect(container.querySelector('[data-viagem-passo="d"]')!.textContent).toBe('🚶 ½ dia')
    expect(container.querySelector('[data-viagem-passo="b"]')!.getAttribute('title')).toBe('¼ dia · Carruagem · Estrada')
    expect(container.querySelector('[data-viagem-bloqueado]')).toBeNull()
  })

  it('PARADA mostra o tempo desde a parada anterior + ícones do trecho; caminho e conector não mostram tempo', async () => {
    // a(parada) → b mar, c mar (caminho) → d(parada, gramado) → e(parada, estrada)
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
    terrenoPublicado({ mar: ['60,21', '60,22'], estrada: ['60,24'] })
    const { container } = renderPanel(DEF)
    await waitFor(() => expect(container.querySelector('[data-viagem-trecho="d"]')).not.toBeNull())
    // 1ª parada: nada
    expect(container.querySelector('[data-viagem-trecho="a"]')).toBeNull()
    // d: navio ⅖ + a pé ½ = 0,9 dia, ícones na ordem da viagem
    const td = container.querySelector('[data-parada="d"] [data-viagem-trecho="d"]')!
    expect(td.textContent).toBe('⛵🚶 0,9 dia')
    expect(td.getAttribute('title')).toBe('Desde a parada anterior: 0,9 dia\n⛵ Navio · ⅖ dia\n🚶 A pé · ½ dia')
    expect(container.querySelector('[data-viagem-trecho="e"]')!.textContent).toBe('🛞 ¼ dia')
    // linha do caminho (recolhida e aberta) sem tempo; sem conector ↓
    expect(container.querySelector('[data-collapsed-run="a"] [data-viagem-segmento]')).toBeNull()
    expect(container.querySelector('[data-collapsed-run="a"]')!.textContent).not.toMatch(/dia/)
    expect(container.querySelector('[data-viagem-conector]')).toBeNull()
    fireEvent.click(container.querySelector('[data-collapsed-run="a"]')!)
    expect(container.querySelector('[data-collapse-run="a"]')!.textContent).not.toMatch(/dia/)
    // total segue ao lado de // CAMINHO
    expect(container.querySelector('[data-viagem-total]')!.textContent).toContain('1,2 dias')
  })

  it('1ª parada depois de caminho conta desde o início da trilha', async () => {
    setGroupStateFull(GROUP_ID, {
      grade: 'mundo',
      hexes: [
        { id: 'a', col: 60, row: 20, kind: 'caminho' },
        { id: 'b', col: 60, row: 21, kind: 'caminho' },
        { id: 'c', col: 60, row: 22, kind: 'parada' },
      ],
    })
    const { container } = renderPanel(DEF)
    await waitFor(() => expect(container.querySelector('[data-viagem-trecho="c"]')!.textContent).toBe('🚶 1 dia'))
  })

  it('trecho bloqueado: ⚠ vermelho com hex e terreno no tooltip', async () => {
    setGroupStateFull(GROUP_ID, {
      grade: 'mundo',
      meios: ['A pé'],
      hexes: [
        { id: 'a', col: 60, row: 20, kind: 'parada' },
        { id: 'b', col: 60, row: 21, kind: 'parada' },
      ],
    })
    terrenoPublicado({ mar: ['60,21'] })
    const { container } = renderPanel(DEF)
    await waitFor(() => expect(container.querySelector('[data-viagem-trecho-bloqueado]')).not.toBeNull())
    const t = container.querySelector('[data-viagem-trecho="b"]')!
    expect(t.textContent).toContain('⚠')
    expect(t.getAttribute('title')).toContain('hex 60,21 (Mar navegável)')
    expect(container.querySelector('[data-viagem-bloqueado]')).not.toBeNull()
  })

  it('meios de viagem só aparecem no EDITAR; editar grava o conjunto explícito', async () => {
    const { container } = renderPanel(DEF)
    await waitFor(() => expect(container.querySelector('[data-viagem-total]')).not.toBeNull())
    expect(container.querySelector('[data-viagem-meios]')).toBeNull()
    expect(container.querySelector('[data-viagem-total]')!.textContent).toContain('1 dia')
    fireEvent.click(container.querySelector('[data-editar-trilha]')!)
    const meios = container.querySelector('[data-viagem-meios]')!
    expect(meios).not.toBeNull()
    // padrões ligados, Cavalo desligado
    expect(screen.getByRole('button', { name: /Carruagem/ }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: /Cavalo/ }).getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: /Cavalo/ }))
    expect(getGroupState(GROUP_ID).meios).toEqual(['A pé', 'Cavalo', 'Carruagem', 'Navio'])
    await waitFor(() => expect(container.querySelector('[data-viagem-total]')!.textContent).toContain('⅔ dia'))
    fireEvent.click(screen.getByRole('button', { name: /Navio/ }))
    expect(getGroupState(GROUP_ID).meios).toEqual(['A pé', 'Cavalo', 'Carruagem'])
    fireEvent.click(container.querySelector('[data-concluir-edicao]')!)
    expect(container.querySelector('[data-viagem-meios]')).toBeNull()
  })

  it('sync: meios só entram no JSON com trilha (vazio+meios nunca empurra por cima, #450)', () => {
    expect(groupStateJson({ hexes: [], meios: ['Cavalo'] })).toBe(groupStateJson({ hexes: [] }))
    const comTrilha = getGroupState(GROUP_ID)
    expect(groupStateJson({ ...comTrilha, meios: ['Cavalo'] })).not.toBe(groupStateJson(comTrilha))
    setGroupStateFull(GROUP_ID, { ...comTrilha, meios: ['Navio'] })
    expect(getGroupState(GROUP_ID).meios).toEqual(['Navio'])
  })

  it('popover da parada mostra o terreno e o tempo pra cruzar o hex com o meio', async () => {
    terrenoPublicado({ estrada: ['60,21'] })
    const { container } = renderPanel(DEF)
    await waitFor(() => expect(container.querySelector('[data-collapsed-run]')).not.toBeNull())
    fireEvent.click(container.querySelector('[data-collapsed-run]')!)
    fireEvent.click(container.querySelector('[data-parada="b"]')!)
    await waitFor(() => expect(container.querySelector('[data-hex-terreno="estrada"]')).not.toBeNull())
    expect(container.querySelector('[data-hex-terreno="estrada"]')!.textContent).toContain('Estrada · ¼ dia com Carruagem')
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

describe('pintor de terreno (Modo Dev)', () => {
  it('sem Modo Dev não há ✎ TERRENO', async () => {
    const { container } = renderPanel(DEF)
    await mapaPronto(container)
    expect(container.querySelector('[data-pintor-terreno-toggle]')).toBeNull()
  })

  it('Modo Dev: pincéis da config + Limpar; um traço arrastado grava UM rascunho com as listas certas', async () => {
    ligarDev()
    const { container } = renderPanel(DEF)
    const vp = await mapaPronto(container)
    await waitFor(() => expect(container.querySelector('[data-pintor-terreno-toggle]')).not.toBeNull())
    fireEvent.click(container.querySelector('[data-pintor-terreno-toggle]')!)
    const barra = container.querySelector('[data-pintor-terreno]')!
    expect([...barra.querySelectorAll('[data-pincel]')].map((b) => b.textContent)).toEqual([
      'Estrada',
      'Gramado',
      'Mar navegável',
      'Difícil',
      'Montanha',
    ])
    expect(barra.querySelector('[data-pincel-limpar]')).not.toBeNull()
    expect(barra.textContent).toContain('rascunho local')
    fireEvent.click(barra.querySelector('[data-pincel="mar"]')!)
    // traço: 60,20 → 60,22 (passa por 60,21)
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
    // a viagem já usa o rascunho (mar sem navio? navio é padrão: 3 × ⅕)
    await waitFor(() => expect(container.querySelector('[data-viagem-total]')!.textContent).toContain('⅖ dia'))
    // tinta por terreno no mapa
    await waitFor(() => expect(container.querySelector('[data-terreno-tinta="mar"]')).not.toBeNull())
  })

  it('toque único pinta um hex; Limpar tira; pan desligado durante a pintura', async () => {
    ligarDev()
    terrenoPublicado({ dificil: ['60,21', '60,22'] })
    const { container } = renderPanel(DEF)
    const vp = await mapaPronto(container)
    await waitFor(() => expect(container.querySelector('[data-pintor-terreno-toggle]')).not.toBeNull())
    fireEvent.click(container.querySelector('[data-pintor-terreno-toggle]')!)
    fireEvent.click(container.querySelector('[data-pincel-limpar]')!)
    const antes = (container.querySelector('[data-mapa]') as HTMLElement).style.transform
    fireEvent.pointerDown(vp, coords({ col: 60, row: 21 }))
    fireEvent.pointerUp(vp, coords({ col: 60, row: 21 }))
    fireEvent.click(vp, coords({ col: 60, row: 21 }))
    expect((container.querySelector('[data-mapa]') as HTMLElement).style.transform).toBe(antes)
    const fm = localDraftFor(TERRENO_ID)!.frontmatter as { Terreno: Record<string, string[]> }
    expect(fm.Terreno.dificil).toEqual(['60,22'])
    // clique durante a pintura não vira parada nem seleção
    expect(getGroupState(GROUP_ID).hexes).toHaveLength(3)
  })
})
