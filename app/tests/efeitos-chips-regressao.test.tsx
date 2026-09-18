// @vitest-environment jsdom
// Report 2026-09-17 (user): "vários marcadores não estando disponíveis que
// normalmente estavam (tipo ataque brutal)". Os toggles de EFEITO do COMBATE
// (Efeitos_Interativos das técnicas/habilidades que o herói TEM) sumiram.
// Integração sobre herói REAL da vault (Thoren, Guerreiro com Ataque Brutal
// nas Técnicas): o popover EFEITOS precisa listar o chip.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { FichaPage } from '../src/components/ficha/FichaPage'
import { heroPath } from '../src/paths'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

const THOREN_ID = 'Sistema/Criaturas/Heróis/Thoren'

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
})
afterEach(cleanup)

// sanidade do dado: a técnica está na vault com o bloco e o Thoren a tem
it('sanidade: Ataque Brutal declara Efeitos_Interativos e o Thoren a conhece', () => {
  const tec = JSON.parse(
    fs.readFileSync(
      path.join(vaultDataDir, 'Sistema/Criação de Personagem/Técnicas/Guerreiro/Ataque Brutal.json'),
      'utf8',
    ),
  ) as VaultDoc
  expect(Array.isArray(tec.frontmatter['Efeitos_Interativos'])).toBe(true)
  const thoren = JSON.parse(
    fs.readFileSync(path.join(vaultDataDir, `${THOREN_ID}.json`), 'utf8'),
  ) as VaultDoc
  expect(JSON.stringify(thoren.frontmatter)).toContain('Ataque Brutal')
})

describe('chips de EFEITOS no COMBATE (report 2026-09-17)', () => {
  it('Thoren: o chip de AÇÃO Ataque Brutal está no COMBATE (e a técnica no painel)', async () => {
    render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter initialEntries={[heroPath(THOREN_ID, 'combate')]}>
          <Routes>
            <Route path="/heroi/*" element={<FichaPage />} />
          </Routes>
        </MemoryRouter>
      </CatalogProvider>,
    )
    await screen.findByText('EFEITOS', undefined, { timeout: 10000 })
    // Ataque Brutal (AçãoLocal) rende DOIS lugares no COMBATE: o chip de ação
    // sempre visível e a linha do painel Técnicas — os "marcadores" do report.
    await waitFor(
      () => {
        expect(screen.getAllByText(/Ataque Brutal/).length).toBeGreaterThanOrEqual(2)
      },
      { timeout: 10000 },
    )
  }, 30000)
})
