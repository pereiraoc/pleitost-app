// @vitest-environment jsdom
// #489 — Arte Marcial (Monge) concede 4 ataques desarmados especiais via
// `Complementar Ataques.Lista [[X]]` (armas especiais: Pontos de Pressão /
// Garra de Tigre / Presas de Lobo / Cauda de Dragão). No app o delta era
// produzido mas o merge não tinha handler pro append de Ataques.Lista, e o
// AtaquesPanel do Combate só listava Inventario.Armas.Lista + customs — o
// monge tinha que adicionar as armas na mão. Espelho do plugin: append no
// calc (monge-arte-marcial-armas.test.ts) + getAllAtaques (naturais junto).
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { FichaPage } from '../src/components/ficha/FichaPage'
import { heroPath } from '../src/paths'
import { projectHeroRules } from '../src/rules/useHeroRules'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import {
  createLocalEntity,
  emptyHeroFrontmatter,
  __resetLocalStoreForTests,
} from '../src/data/local-entities'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)
const load = (id: string): VaultDoc =>
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8')) as VaultDoc

const ATAQUES = ['Pontos de Pressão', 'Garra de Tigre', 'Presas de Lobo', 'Cauda de Dragão']

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
  __resetHeroStoreMemoryForTests()
  __resetLocalStoreForTests()
})
afterEach(cleanup)

const mongeFm = () => ({
  ...(emptyHeroFrontmatter() as Record<string, unknown>),
  Classe: '[[Monge]]',
  'Nível': 3,
  Atributos: { FOR: 2, AGI: 3, INT: 1, PRE: 1 },
  Habilidades: { Lista: [{ '[[Arte Marcial]]': 'Regra.[[Monge]]' }] },
})

describe('#489 — Arte Marcial concede os ataques especiais', () => {
  it('derivedFm: Ataques.Lista ganha as 4 armas especiais (sem duplicar Manobras)', async () => {
    const { projection } = await projectHeroRules(mongeFm(), catalog, async (id) => load(id))
    const d = projection.derivedFm as Record<string, unknown>
    const lista = ((d['Ataques'] as Record<string, unknown>)['Lista'] ?? []) as Record<
      string,
      unknown
    >[]
    const nomes = lista.map((r) => String(r['Nome']))
    for (const atk of ATAQUES) {
      expect(nomes.some((n) => n.includes(atk)), `${atk} em Ataques.Lista`).toBe(true)
    }
    expect(nomes.filter((n) => n === 'Manobras')).toHaveLength(1)
  })

  it('COMBATE: as armas especiais aparecem na lista de ataques', async () => {
    const id = createLocalEntity('Heroi', 'Monge Testudo', mongeFm())
    render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter initialEntries={[heroPath(id, 'combate')]}>
          <Routes>
            <Route path="/heroi/*" element={<FichaPage />} />
          </Routes>
        </MemoryRouter>
      </CatalogProvider>,
    )
    expect(await screen.findByText(/Presas de Lobo/)).toBeTruthy()
    expect(screen.getByText(/Garra de Tigre/)).toBeTruthy()
    expect(screen.getByText(/Cauda de Dragão/)).toBeTruthy()
  })
})
