// @vitest-environment jsdom
// IMPLEMENTO COM FOCO na ficha: a linha de Inventario.Implementos aparece nos
// TESOUROS do Combate com o rótulo do combo e as CARGAS do foco no tier.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { DetailProvider } from '../src/data/detail-context'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { FichaPage } from '../src/components/ficha/FichaPage'
import { heroPath } from '../src/paths'
import {
  __resetLocalStoreForTests,
  createLocalEntity,
  emptyHeroFrontmatter,
} from '../src/data/local-entities'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const catalog = buildCatalog(JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest)

function makeStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k) => (data.has(k) ? data.get(k)! : null),
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
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
  __resetLocalStoreForTests()
  __resetHeroStoreMemoryForTests()
})
afterEach(cleanup)


describe('implemento com foco no Combate', () => {
  it('Broche Artístico da Repetição (M) com CARGAS', async () => {
    const base = emptyHeroFrontmatter() as Record<string, unknown>
    const id = createLocalEntity('Heroi', 'Bardo do Broche', {
      ...base,
      Classe: '[[Bardo]]',
      Inventario: {
        ...(base['Inventario'] as Record<string, unknown>),
        Implementos: [
          { Nome: '[[Broche Artístico]]', Propriedade: '[[Foco da Repetição]]', Categoria: '[[Mestre]]', Fonte: 'Comércio' },
        ],
      },
    })
    render(
      <CatalogProvider catalog={catalog}>
        <DetailProvider>
          <MemoryRouter initialEntries={[heroPath(id, 'combate')]}>
            <Routes>
              <Route path="/heroi/*" element={<FichaPage />} />
            </Routes>
          </MemoryRouter>
        </DetailProvider>
      </CatalogProvider>,
    )
    const tabs = await screen.findAllByText('TESOUROS', undefined, { timeout: 15000 })
    fireEvent.click(tabs.find((el) => el.closest('button'))!)
    const item = await screen.findByText('Broche Artístico da Repetição', undefined, { timeout: 15000 })
    // qualidade ao lado, tier-colorida (2026-10-29)
    expect(item.textContent).toBe('Broche Artístico da Repetição(M)')
    expect((item.parentElement as HTMLElement).textContent).toContain('CARGAS')
  }, 40000)
})
