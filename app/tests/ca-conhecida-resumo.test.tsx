// @vitest-environment jsdom
// CA CONHECIDA → FICHA RESUMO (#241) — req do usuário: "Quando eu abro a
// ficha de Metis (se ela é conhecida e eu não tenho direito de escrita, tipo
// abrindo em criaturas/companheiros animais), tu não ta mostrando a ficha
// resumo dela, ta errado." O card da vault (selo CONHECIDO) abre o RESUMO no
// painel de detalhes, não o doc cru do compêndio.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { AppShell } from '../src/components/layout/AppShell'
import { NpcsPage } from '../src/components/creatures/CreaturesPages'
import { __resetLocalStoreForTests } from '../src/data/local-entities'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
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
  __resetLocalStoreForTests()
  __resetHeroStoreMemoryForTests()
})
afterEach(cleanup)

describe('CA conhecida abre a ficha RESUMO (#241)', () => {
  it('clicar na Metis (vault, selo CONHECIDO) abre o resumo no painel de detalhes', async () => {
    render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter initialEntries={['/npcs']}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/npcs" element={<NpcsPage />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </CatalogProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'COMPANHEIROS ANIMAIS' }))
    const card = (await screen.findAllByText('Metis, a Graxaim'))
      .map((el) => el.closest('[role="button"], button'))
      .find((el): el is HTMLElement => Boolean(el))!
    expect(card.textContent).toContain('CONHECIDO')
    fireEvent.click(card)
    // resumo montou no painel direito: seções do modo Resumo com a Metis
    await waitFor(() => expect(screen.getByText('// PERÍCIAS')).toBeTruthy())
    expect(screen.getByText('// ATAQUES')).toBeTruthy()
    // e o nome aparece também no detalhe (título do resumo)
    expect(screen.getAllByText('Metis, a Graxaim').length).toBeGreaterThan(1)
  })
})
