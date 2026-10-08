// @vitest-environment jsdom
// Report 2026-10-08: o ESCUDO DO MESTRE é da sessão, não de um personagem —
// sem ninguém selecionado o botão da barra caía na rota genérica (página
// errada). Agora tem rota própria (/escudo) e o botão sempre vai pra ela.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { AppShell } from '../src/components/layout/AppShell'
import { HeroisPage } from '../src/components/creatures/CreaturesPages'
import { FichaPage } from '../src/components/ficha/FichaPage'
import { EscudoPage } from '../src/components/mestre/escudo/EscudoPage'
import { __resetSelectedCreatureForTests, setSelectedCreature } from '../src/data/selected-creature-store'
import { __resetSettingsForTests } from '../src/settings'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
const catalog = buildCatalog(manifest)
const CARLOS_ID = 'Sistema/Criaturas/Heróis/Carlos Facão de Andradas'

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
  window.localStorage?.clear()
  __resetSelectedCreatureForTests()
  __resetSettingsForTests()
})
afterEach(() => {
  cleanup()
  window.localStorage?.clear()
  __resetSelectedCreatureForTests()
  __resetSettingsForTests()
})

function Onde() {
  return <div data-onde={useLocation().pathname} />
}
function renderAt(at: string) {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={[at]}>
        <Onde />
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/herois" element={<HeroisPage />} />
            <Route path="/heroi/*" element={<FichaPage />} />
            <Route path="/escudo" element={<EscudoPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}
function ligarMestre() {
  window.localStorage.setItem('pleitost.settings.mestre', 'true')
  __resetSettingsForTests()
}
const onde = () => document.querySelector('[data-onde]')!.getAttribute('data-onde')

describe('ESCUDO DO MESTRE tem rota própria', () => {
  it('sem personagem selecionado: o botão abre /escudo com o escudo e o título certo', async () => {
    ligarMestre()
    renderAt('/herois')
    const btn = await screen.findByRole('button', { name: /ESCUDO DO MESTRE/ })
    fireEvent.click(btn)
    await waitFor(() => expect(onde()).toBe('/escudo'))
    expect(await screen.findByText(/SEM MESA/)).toBeTruthy()
    expect(btn.className).toContain('active')
  })

  it('com herói selecionado também vai pro /escudo', async () => {
    ligarMestre()
    setSelectedCreature(CARLOS_ID)
    renderAt('/herois')
    fireEvent.click(await screen.findByRole('button', { name: /ESCUDO DO MESTRE/ }))
    await waitFor(() => expect(onde()).toBe('/escudo'))
  })

  it('jogador (sem modo mestre) em /escudo volta pros heróis', async () => {
    renderAt('/escudo')
    await waitFor(() => expect(onde()).toBe('/herois'))
  })
})
