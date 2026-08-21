// @vitest-environment jsdom
// Report 2026-08-21 r2: "abri em outro dispositivo e tá sem imagem" — o
// retrato vivia SÓ no IndexedDB do navegador. Agora o upload também grava uma
// versão pequena (data URL + updatedAt) em pleitost.entityImage.<id>, que
// viaja pelo espelho por conta (newer-wins por carimbo); a leitura cai nela
// quando o IndexedDB local não tem o blob. E o publish na MESA leva o retrato
// no summary — jogadores da sessão veem os retratos uns dos outros.
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
import {
  saveEntityImage,
  deleteEntityImage,
  syncedImageDataUrl,
  __resetImagesStoreForTests,
} from '../src/data/images'
import { buildCharacterSummary } from '../src/data/session-repo/publish'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import {
  __resetLocalStoreForTests,
  createLocalEntity,
  emptyHeroFrontmatter,
  getLocalDoc,
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

const KEY = (id: string) => `pleitost.entityImage.${id}`

function renderHerois() {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={['/herois']}>
        <Routes>
          <Route path="/herois" element={<HeroisPage />} />
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

describe('retrato sincronizado pela conta (r2)', () => {
  it('upload grava a chave espelhável {dataUrl, updatedAt} e deletar remove', async () => {
    const id = createLocalEntity('Heroi', 'Zé Sync', emptyHeroFrontmatter())
    await saveEntityImage(id, fakePng())
    const raw = window.localStorage.getItem(KEY(id))
    expect(raw).toBeTruthy()
    const v = JSON.parse(raw!) as { dataUrl?: string; updatedAt?: string }
    expect(v.dataUrl!.startsWith('data:image')).toBe(true)
    expect(Number.isFinite(Date.parse(v.updatedAt!))).toBe(true)
    expect(syncedImageDataUrl(id)).toBe(v.dataUrl)
    await deleteEntityImage(id)
    expect(window.localStorage.getItem(KEY(id))).toBeNull()
  })

  it('OUTRO device (IndexedDB vazio, chave da conta presente): lista mostra o retrato', async () => {
    const id = createLocalEntity('Heroi', 'Zé Viajante', emptyHeroFrontmatter())
    window.localStorage.setItem(
      KEY(id),
      JSON.stringify({ dataUrl: 'data:image/png;base64,iVBORw0KGgo=', updatedAt: '2026-08-21T00:00:00.000Z' }),
    )
    renderHerois()
    await screen.findByText('Zé Viajante')
    await waitFor(() => {
      const el = document.querySelector<HTMLElement>('.hero-portrait')
      expect(el).toBeTruthy()
      expect(el!.style.backgroundImage).toContain('data:image')
    })
  })

  it('publish: o summary leva o retrato da chave da conta (mesa vê)', async () => {
    const id = createLocalEntity('Heroi', 'Zé Publicado', emptyHeroFrontmatter())
    await saveEntityImage(id, fakePng())
    const doc = getLocalDoc(id)!
    const summary = buildCharacterSummary(doc)
    expect(summary.retrato?.startsWith('data:image')).toBe(true)
    // sem imagem, summary segue sem o campo
    const id2 = createLocalEntity('Heroi', 'Zé Sem Foto', emptyHeroFrontmatter())
    expect(buildCharacterSummary(getLocalDoc(id2)!).retrato).toBeUndefined()
  })
})
