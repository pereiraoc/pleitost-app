// @vitest-environment jsdom
// CONTEXTO (regalia da classe) na BIOGRAFIA — pedido 2026-09-10: sai da coluna
// do topo e passa a morar DENTRO do colapsável da classe, abaixo do que já
// está lá e acima das abas (identidade/experiência/planejamento). Fechado, não
// ocupa espaço; a aba RECURSOS segue com o bloco completo dela.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { FichaPage } from '../src/components/ficha/FichaPage'
import { heroPath } from '../src/paths'
import { setActiveContexto } from '../src/data/reskin'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import {
  __resetLocalStoreForTests,
  createLocalEntity,
  emptyHeroFrontmatter,
  setLocalEntityFm,
} from '../src/data/local-entities'
import type { ContextoDef } from '../src/data/context-def'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const cyberDir = path.join(path.dirname(appDir), 'vault-data-cyberpunk')
const temMundo = fs.existsSync(path.join(cyberDir, 'contexto.json'))

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

describe.skipIf(!temMundo)('Biografia — CONTEXTO dentro do colapsável da classe', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(cyberDir, 'index.json'), 'utf8')) as IndexManifest
  const def = JSON.parse(fs.readFileSync(path.join(cyberDir, 'contexto.json'), 'utf8')) as ContextoDef
  const catalog = { ...buildCatalog(manifest), contextoDef: def }

  beforeAll(() => {
    if (!window.localStorage) {
      Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true })
    }
    globalThis.fetch = (async (input: unknown) => {
      const rel = decodeURIComponent(String(input).replace(/^\/vault-data(-cyberpunk)?\//, ''))
      const file = path.join(cyberDir, rel)
      const ok = fs.existsSync(file)
      return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) }
    }) as typeof fetch
    setActiveContexto(def)
  })
  afterAll(() => setActiveContexto(null))
  beforeEach(() => {
    window.localStorage.clear()
    __resetLocalStoreForTests()
    __resetHeroStoreMemoryForTests()
  })
  afterEach(cleanup)

  it('fechado não mostra o CONTEXTO; abrindo a classe, ele aparece', async () => {
    const id = createLocalEntity('Heroi', 'Executivo Teste', emptyHeroFrontmatter())
    setLocalEntityFm(id, 'Classe', '[[Caçador]]')
    setLocalEntityFm(id, 'Nível', 3)
    render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter initialEntries={[heroPath(id, 'perfil')]}>
          <Routes>
            <Route path="/heroi/*" element={<FichaPage />} />
          </Routes>
        </MemoryRouter>
      </CatalogProvider>,
    )
    const abrir = await screen.findByTitle('Classe e subclasses', undefined, { timeout: 20000 })
    expect(screen.queryByText('CONTEXTO')).toBeNull()
    fireEvent.click(abrir)
    await waitFor(() => expect(screen.getByText('CONTEXTO')).toBeTruthy(), { timeout: 20000 })
  }, 40000)
})
