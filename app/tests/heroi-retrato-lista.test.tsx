// @vitest-environment jsdom
// Report 2026-08-21: retrato subido na FICHA não aparecia na LISTA de heróis —
// o HeroCard lia só o caminho da vault (creatureImageUrl) e ignorava a imagem
// local do IndexedDB. Agora usa o hook local-first (useCreaturePortrait), o
// MESMO dos cards de criatura (#280) — e reage ao upload sem reload.
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
import { HeroisPage } from '../src/components/creatures/CreaturesPages'
import { saveEntityImage, __resetImagesStoreForTests } from '../src/data/images'
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

const fakePng = () =>
  new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'retrato.png', { type: 'image/png' })

describe('retrato local na LISTA de heróis (report 2026-08-21)', () => {
  it('imagem subida pro herói aparece no card da lista (blob:)', async () => {
    const id = createLocalEntity('Heroi', 'Zé Retratado', emptyHeroFrontmatter())
    await saveEntityImage(id, fakePng())
    render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter initialEntries={['/herois']}>
          <Routes>
            <Route path="/herois" element={<HeroisPage />} />
          </Routes>
        </MemoryRouter>
      </CatalogProvider>,
    )
    await screen.findByText('Zé Retratado')
    await waitFor(() => {
      const el = document.querySelector<HTMLElement>('.hero-portrait')
      expect(el).toBeTruthy()
      expect(el!.style.backgroundImage).toContain('blob:')
    })
  })
})
