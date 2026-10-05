// @vitest-environment jsdom
// VIAGEM DO HEXCRAWL na aba EXPLORAÇÃO (2026-10-04): com o bloco `viagem` no
// Contexto-Def (Fantasia), a barra do CAMINHO mostra o total da trilha em DIAS
// (regras v2: custo do terreno / hex por dia do meio), os dias por segmento e o
// seletor de meios do grupo; o
// terreno vem do hexmap `mapa:mundo` nas MESMAS coords da trilha. Sem o bloco
// (POA / dataset antigo), nada de viagem aparece.
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
import { __resetHexMapStoreMemoryForTests, setHexTerrenoBulk } from '../src/data/hexmap-store'
import { MAPA_MUNDO_ID } from '../src/data/seed-hexmaps'
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
      { chave: 'estrada', nome: 'Estrada', custo: 1 },
      { chave: 'normal', nome: 'Gramado', custo: 1 },
      { chave: 'mar', nome: 'Mar navegável', custo: 1 },
      { chave: 'dificil', nome: 'Difícil', custo: 2 },
      { chave: 'muito_dificil', nome: 'Montanha', custo: 3 },
    ],
    meios: [
      { nome: 'A pé', hexPorDia: 2, em: ['estrada', 'normal', 'dificil', 'muito_dificil'] },
      { nome: 'Cavalo', hexPorDia: 3, em: ['estrada', 'normal', 'dificil'] },
      { nome: 'Carruagem', hexPorDia: 4, em: ['estrada'] },
      { nome: 'Navio', hexPorDia: 5, em: ['mar'] },
    ],
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
afterAll(() => setActiveContexto(null))

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
  it('com `viagem` no contexto: total da trilha em dias', async () => {
    // 60,21 = estrada (½ dia a pé) · 60,22 = difícil (1 dia a pé)
    setHexTerrenoBulk(MAPA_MUNDO_ID, [{ col: 60, row: 22 }], 'dificil')
    setHexTerrenoBulk(MAPA_MUNDO_ID, [{ col: 60, row: 21 }], 'estrada')
    const { container } = renderPanel(DEF)
    await waitFor(() => expect(container.querySelector('[data-viagem-total]')).not.toBeNull())
    // estrada ½ + difícil 1 (a pé)
    expect(container.querySelector('[data-viagem-total]')!.textContent).toContain('1½ dias')
    // segmento da parada inicial carrega os dias dela até o fim
    expect(container.querySelector('[data-viagem-segmento="a"]')!.textContent).toContain('1½ dias')
  })

  it('meio do grupo (Cavalo, 3 hex/dia) acelera e grava na trilha', async () => {
    const { container } = renderPanel(DEF)
    await waitFor(() => expect(container.querySelector('[data-viagem-total]')).not.toBeNull())
    expect(container.querySelector('[data-viagem-total]')!.textContent).toContain('1 dia')
    fireEvent.click(screen.getByRole('button', { name: 'Cavalo' }))
    expect(getGroupState(GROUP_ID).meios).toEqual(['Cavalo'])
    await waitFor(() => expect(container.querySelector('[data-viagem-total]')!.textContent).toContain('⅔ dia'))
  })

  it('sync: meios só entram no JSON com trilha (vazio+meios nunca empurra por cima, #450)', () => {
    expect(groupStateJson({ hexes: [], meios: ['Cavalo'] })).toBe(groupStateJson({ hexes: [] }))
    const comTrilha = getGroupState(GROUP_ID)
    expect(groupStateJson({ ...comTrilha, meios: ['Cavalo'] })).not.toBe(groupStateJson(comTrilha))
    // remoto com meios é adotado pelo setGroupStateFull
    setGroupStateFull(GROUP_ID, { ...comTrilha, meios: ['Navio'] })
    expect(getGroupState(GROUP_ID).meios).toEqual(['Navio'])
  })

  it('mar sem navio marca a trilha como bloqueada', async () => {
    setHexTerrenoBulk(MAPA_MUNDO_ID, [{ col: 60, row: 22 }], 'mar')
    const { container } = renderPanel(DEF)
    await waitFor(() => expect(container.querySelector('[data-viagem-bloqueado]')).not.toBeNull())
  })

  it('popover da parada mostra o terreno e o tempo pra cruzar o hex com o meio', async () => {
    setHexTerrenoBulk(MAPA_MUNDO_ID, [{ col: 60, row: 21 }], 'estrada')
    setGroupStateFull(GROUP_ID, { ...getGroupState(GROUP_ID), meios: ['Cavalo', 'Carruagem'] })
    const { container } = renderPanel(DEF)
    await waitFor(() => expect(container.querySelector('[data-parada="a"]')).not.toBeNull())
    fireEvent.click(container.querySelector('[data-collapsed-run]')!)
    fireEvent.click(container.querySelector('[data-parada="b"]')!)
    const info = container.querySelector('[data-hex-terreno="estrada"]')
    expect(info).not.toBeNull()
    expect(info!.textContent).toContain('Estrada')
    expect(info!.textContent).toContain('Estrada · ¼ dia com Carruagem')
  })

  it('sem `viagem` no contexto: nada de tempo de viagem', async () => {
    const { container } = renderPanel(null)
    await waitFor(() => expect(container.querySelector('[data-parada="a"]')).not.toBeNull())
    expect(container.querySelector('[data-viagem-total]')).toBeNull()
    expect(container.querySelector('[data-viagem-meios]')).toBeNull()
  })
})
