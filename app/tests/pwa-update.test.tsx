// @vitest-environment jsdom
// TOAST DE UPDATE DO PWA (issue #191): registerType 'prompt' → onNeedRefresh
// (SW novo em espera) liga o estado global (src/pwa-update.ts) e o AppShell
// mostra "Atualização disponível — Recarregar"; o botão chama updateSW(true)
// (ativa o SW e recarrega). virtual:pwa-register MOCKADO via vi.mock — o
// registro real de SW só existe no build servido.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { AppShell } from '../src/components/layout/AppShell'
import { ConfigPage } from '../src/components/config/ConfigPage'
import { __resetPwaUpdateForTests } from '../src/pwa-update'

// mock do virtual:pwa-register (vite-plugin-pwa): captura o onNeedRefresh
// passado pelo initPwaUpdate e devolve um updateSW espionável.
const { updateSW, captured } = vi.hoisted(() => {
  const captured: { onNeedRefresh?: () => void } = {}
  const updateSW = vi.fn(async () => {})
  return { updateSW, captured }
})
vi.mock('virtual:pwa-register', () => ({
  registerSW: (opts: { onNeedRefresh?: () => void } = {}) => {
    captured.onNeedRefresh = opts.onNeedRefresh
    return updateSW
  },
}))

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'))
const catalog = buildCatalog(manifest)

beforeAll(() => {
  globalThis.fetch = (async (input: unknown) => {
    const url = String(input)
    const rel = decodeURIComponent(url.replace(/^\/vault-data\//, ''))
    const file = path.join(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return {
      ok,
      status: ok ? 200 : 404,
      json: async () => JSON.parse(fs.readFileSync(file, 'utf8')),
    }
  }) as typeof fetch
})

/** Mesmo polyfill de localStorage dos demais testes (vitest 4 + jsdom). */
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
})

beforeEach(() => {
  __resetPwaUpdateForTests()
  captured.onNeedRefresh = undefined
  updateSW.mockClear()
})
afterEach(cleanup)

function renderApp() {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={['/config']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/config" element={<ConfigPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

describe('toast de update do PWA (issue #191)', () => {
  it('sem update em espera não há toast; onNeedRefresh faz o toast aparecer', async () => {
    renderApp()
    // o AppShell registra o SW no mount (initPwaUpdate → registerSW mockado)
    await waitFor(() => expect(captured.onNeedRefresh).toBeTruthy())
    expect(screen.queryByText('Atualização disponível')).toBeNull()

    act(() => captured.onNeedRefresh!())
    expect(await screen.findByText('Atualização disponível')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Recarregar' })).toBeTruthy()
  })

  it('Recarregar aplica o update: updateSW(true)', async () => {
    renderApp()
    await waitFor(() => expect(captured.onNeedRefresh).toBeTruthy())
    act(() => captured.onNeedRefresh!())

    fireEvent.click(await screen.findByRole('button', { name: 'Recarregar' }))
    expect(updateSW).toHaveBeenCalledWith(true)
  })

  it('versão REAL do app no CONFIG (package.json via define)', async () => {
    renderApp()
    // v0.1.0 = version do app/package.json — injetada, não literal no código.
    // #285: agora com sufixo `+<git-sha>` (build distinguível no bug report);
    // casa o prefixo do semver, tolerando o SHA.
    expect(await screen.findByText(/^PLEITOST COMPANION\/\/OS · v0\.1\.0/)).toBeTruthy()
  })
})
