// @vitest-environment jsdom
// Report 2026-08-21 r4/r5: o avatar do topo (e o switcher de heróis) lia só a
// imagem da vault — nem o upload local nem o retrato sincronizado pela conta
// apareciam. AvatarHeroi usa o hook local-first; aqui o cenário do OUTRO
// device: sem blob no IndexedDB, com a chave da conta → o avatar renderiza.
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { AppShell } from '../src/components/layout/AppShell'
import { FichaPage } from '../src/components/ficha/FichaPage'
import { heroPath } from '../src/paths'
import { __resetImagesStoreForTests } from '../src/data/images'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import {
  __resetLocalStoreForTests,
  createLocalEntity,
  emptyHeroFrontmatter,
} from '../src/data/local-entities'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

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
  let seq = 0
  URL.createObjectURL = () => `blob:fake-${seq++}`
  URL.revokeObjectURL = () => undefined
})

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  __resetImagesStoreForTests()
  window.localStorage.clear()
  __resetLocalStoreForTests()
  __resetHeroStoreMemoryForTests()
})
afterEach(cleanup)

describe('topbar — avatar local-first (r5)', () => {
  it('sem blob local, com chave da conta: o avatar do topo mostra a imagem', async () => {
    const id = createLocalEntity('Heroi', 'Zé do Topo', emptyHeroFrontmatter())
    window.localStorage.setItem(
      `pleitost.entityImage.${id}`,
      JSON.stringify({
        dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
        updatedAt: '2026-08-21T00:00:00.000Z',
      }),
    )
    render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter initialEntries={[heroPath(id)]}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/heroi/*" element={<FichaPage />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </CatalogProvider>,
    )
    // switcher do topo montou com o herói
    await screen.findByTestId('switcher-list', undefined, { timeout: 10000 }).catch(() => null)
    await waitFor(
      () => {
        const hit = [...document.querySelectorAll<HTMLElement>('*')].some(
          (e) =>
            (e.style?.backgroundImage ?? '').includes('data:image') ||
            (e as HTMLImageElement).src?.startsWith?.('data:image'),
        )
        expect(hit).toBe(true)
      },
      { timeout: 10000 },
    )
  })
})
