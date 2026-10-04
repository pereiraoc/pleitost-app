// @vitest-environment jsdom
// PINTOR DE TERRENO no Mapa do Mundo (viagem do hexcrawl, 2026-10-04): o modo
// ⛰ TERRENO só existe quando o Contexto-Def declara `viagem`; os pincéis são
// os terrenos da config (nome da config, nunca inventado) + LIMPAR; hexes
// pintados ganham tinta por terreno no modo TERRENO.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { AtlasMapaPage } from '../src/components/compendium/AtlasMapaPage'
import { __setSeedMapaAtlasForTests, __resetMapaAtlasForTests } from '../src/map/mapa-atlas-store'
import { __resetHexMapStoreMemoryForTests, setHexTerrenoBulk } from '../src/data/hexmap-store'
import { MAPA_MUNDO_ID } from '../src/data/seed-hexmaps'
import { __resetSettingsForTests } from '../src/settings'
import { setActiveContexto } from '../src/data/reskin'
import type { ContextoDef } from '../src/data/context-def'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
const baseCatalog = buildCatalog(manifest)

const VIAGEM: NonNullable<ContextoDef['viagem']> = {
  padrao: 'normal',
  terrenos: [
    { chave: 'estrada', nome: 'Estrada', horas: 8, cor: '#c9a36b' },
    { chave: 'normal', nome: 'Gramado', horas: 16 },
  ],
  meios: [{ nome: 'A pé', fator: 1, em: ['estrada', 'normal'] }],
}
const DEF = {
  id: 'fantasia',
  nome: 'Fantasia',
  fonte: 'Contexto Fantasia.md',
  moeda: { simbolo: 'PO', nome: 'Peças de Ouro' },
  atlas: { raiz: 'Atlas', mapa: null },
  pericias: {},
  reskin: { notas: {}, notasFuturas: {}, termos: {}, excecoes: [] },
  disponibilidade: { padrao: 'disponivel', indisponiveis: [], restritos: {} },
  base: { sempreDisponiveis: [] },
} as unknown as ContextoDef

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
  window.localStorage.setItem('pleitost.settings.mestre', 'true')
  __resetMapaAtlasForTests()
  __resetHexMapStoreMemoryForTests()
  __resetSettingsForTests()
})
afterEach(cleanup)
afterAll(() => {
  setActiveContexto(null)
  window.localStorage.clear()
  __resetSettingsForTests()
})

function renderMapa(def: ContextoDef | null) {
  setActiveContexto(def)
  return render(
    <CatalogProvider catalog={{ ...baseCatalog, contextoDef: def }}>
      <MemoryRouter initialEntries={['/mapa']}>
        <Routes>
          <Route path="/mapa" element={<AtlasMapaPage />} />
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

describe('pintor de terreno do mapa-múndi', () => {
  it('com `viagem`: modo TERRENO com pincéis da config e tinta nos hexes pintados', async () => {
    setHexTerrenoBulk(MAPA_MUNDO_ID, [{ col: 60, row: 20 }], 'estrada')
    const { container } = renderMapa({ ...DEF, viagem: VIAGEM })
    const btn = await waitFor(() => {
      const b = container.querySelector('[data-modo-terreno]')
      expect(b).not.toBeNull()
      return b!
    })
    fireEvent.click(btn)
    const pinceis = [...container.querySelectorAll('[data-pincel]')].map((b) => b.textContent)
    expect(pinceis).toEqual(['Estrada', 'Gramado'])
    expect(container.querySelector('[data-pincel-limpar]')).not.toBeNull()
    await waitFor(() => expect(container.querySelector('[data-terreno-tinta="estrada"]')).not.toBeNull())
    expect(container.querySelector('[data-terreno-tinta="estrada"]')!.getAttribute('fill')).toBe('#c9a36b')
  })

  it('sem `viagem`: não há modo TERRENO', async () => {
    const { container, findByText } = renderMapa(DEF)
    await findByText('FERRAMENTAS DO MESTRE')
    expect(container.querySelector('[data-modo-terreno]')).toBeNull()
  })
})
