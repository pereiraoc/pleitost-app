// @vitest-environment jsdom
// #86: seleção PERSISTIDA — na tela de seleção (HERÓIS), com um personagem
// selecionado, a topbar e as abas de personagem continuam ATIVAS (não ficam
// "não clicáveis") e o card do selecionado é destacado.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { AppShell } from '../src/components/layout/AppShell'
import { HeroisPage } from '../src/components/creatures/CreaturesPages'
import { FichaPage } from '../src/components/ficha/FichaPage'
import {
  __resetSelectedCreatureForTests,
  setSelectedCreature,
} from '../src/data/selected-creature-store'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
const catalog = buildCatalog(manifest)
const CARLOS_ID = 'Sistema/Criaturas/Heróis/Carlos Facão de Andradas'

beforeAll(() => {
  globalThis.fetch = (async (input: unknown) => {
    const url = String(input)
    const rel = decodeURIComponent(url.replace(/^\/vault-data\//, ''))
    const file = path.join(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) }
  }) as typeof fetch
})
beforeEach(() => {
  window.localStorage?.clear()
  __resetSelectedCreatureForTests()
})
afterEach(() => {
  cleanup()
  __resetSelectedCreatureForTests()
})

function renderAt(at: string) {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={[at]}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/herois" element={<HeroisPage />} />
            <Route path="/heroi/*" element={<FichaPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

/** botões das CHAR_TABS = 1º nav-group da sidebar. */
function charTabButtons(container: HTMLElement): HTMLButtonElement[] {
  const group = container.querySelector('.sidebar .nav-group') as HTMLElement
  return [...group.querySelectorAll('button.nav-item')] as HTMLButtonElement[]
}

describe('#86 seleção persistida na tela de seleção', () => {
  it('COM herói selecionado: topbar aparece, abas de personagem CLICÁVEIS, card destacado', async () => {
    setSelectedCreature(CARLOS_ID)
    const { container } = renderAt('/herois')

    // topbar da ficha renderiza mesmo FORA da ficha (herói selecionado)
    expect(await screen.findByTestId('topbar-avatar')).toBeTruthy()

    // as abas de personagem são <button> clicáveis (não NavButton disabled)
    const tabs = charTabButtons(container)
    expect(tabs.length).toBeGreaterThan(0)
    expect(tabs.every((b) => !b.disabled)).toBe(true)

    // o card do Carlos aparece destacado
    await waitFor(() => {
      const sel = container.querySelector('.hero-card.selected') as HTMLElement
      expect(sel).toBeTruthy()
      expect(within(sel).getByText(/Carlos/)).toBeTruthy()
    })
  })

  it('SEM seleção: as abas de personagem ficam DESABILITADAS (comportamento antigo)', async () => {
    const { container } = renderAt('/herois')
    await screen.findAllByText(/Carlos/) // espera a lista carregar
    const tabs = charTabButtons(container)
    expect(tabs.length).toBeGreaterThan(0)
    expect(tabs.every((b) => b.disabled)).toBe(true)
    // sem herói selecionado, a topbar da ficha não renderiza
    expect(screen.queryByTestId('topbar-avatar')).toBeNull()
  })
})
