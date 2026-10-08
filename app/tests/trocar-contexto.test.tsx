// @vitest-environment jsdom
// TROCAR CONTEXTO (pedido 2026-10-08): botão na barra esquerda, logo acima do
// CONFIG, que alterna o contexto Fantasia ⇄ POA1987 sem ir na Config.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { AppShell } from '../src/components/layout/AppShell'
import { NAV_ICON_PATHS } from '../src/components/layout/design-nav'
import { __resetThemeForTests } from '../src/theme'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
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
  if (!window.localStorage) Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true })
  globalThis.fetch = (async (input: unknown) => {
    const rel = decodeURIComponent(String(input).replace(/^\/vault-data[^/]*\//, ''))
    const file = path.join(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) }
  }) as typeof fetch
})
beforeEach(() => {
  window.localStorage.clear()
  __resetThemeForTests()
})
afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

const contexto = () => (JSON.parse(window.localStorage.getItem('pleitost.theme') ?? '{}') as { context?: string }).context

describe('TROCAR CONTEXTO na barra esquerda', () => {
  it('fica logo acima do CONFIG, com ícone próprio, e alterna Fantasia ⇄ POA1987', async () => {
    render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter initialEntries={['/compendio']}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/compendio" element={<div />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </CatalogProvider>,
    )
    const btn = await screen.findByRole('button', { name: /TROCAR CONTEXTO/ })
    const config = screen.getByRole('link', { name: /CONFIG/ })
    expect(btn.nextElementSibling).toBe(config)
    expect(NAV_ICON_PATHS['trocar-contexto']).toContain('<path')
    expect(btn.querySelector('svg')).toBeTruthy()
    expect(btn.getAttribute('title')).toMatch(/POA1987/)
    act(() => fireEvent.click(btn))
    expect(contexto()).toBe('cyberpunk')
    const atual = () => screen.getByRole('button', { name: /TROCAR CONTEXTO/ })
    await waitFor(() => expect(atual().getAttribute('title')).toMatch(/FANTASIA/))
    act(() => fireEvent.click(atual()))
    expect(contexto()).toBe('fantasia')
  })
})
