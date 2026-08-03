// @vitest-environment jsdom
// Reports #405 + #409 (criação de bestiário no app):
//   #405 "tá com nível aí invés dos tiers" — a ficha do Monstro local mostrava
//   o card NÍVEL (stepper 1-10 sobre FM Nível, que Monstro nem tem) e o chip
//   da topbar "NVL". O plugin (perfil-card.ts:146-231) mostra TIER 0-3 com
//   steppers clampados — meta.tier → FM Tier.
//   #409 Monstro sem classe mostrava "Aventureiro" na biografia — pra criatura
//   o rótulo pedido é "Criatura".
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { FichaPage } from '../src/components/ficha/FichaPage'
import { AppShell } from '../src/components/layout/AppShell'
import {
  __resetLocalStoreForTests,
  createLocalEntity,
  emptyHeroFrontmatter,
  emptyMonstroFrontmatter,
  getLocalDoc,
} from '../src/data/local-entities'
import { applyFmEdits, getHeroEdits, __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import { heroPath } from '../src/paths'
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

function makeMonstro(): string {
  return createLocalEntity('Monstro', 'Lagarto Teste', emptyMonstroFrontmatter())
}

function renderFicha(id: string, tab?: string) {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={[heroPath(id, tab)]}>
        <Routes>
          <Route path="/heroi/*" element={<FichaPage />} />
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

function mergedFm(id: string): Record<string, unknown> {
  const base = getLocalDoc(id)!
  return applyFmEdits(base.frontmatter as Record<string, unknown>, getHeroEdits(id).fm)
}

describe('#405 — Monstro progride por TIER, não por Nível', () => {
  it('card de classe mostra TIER (não NÍVEL) e o stepper ▲ grava FM Tier clampado em 3', async () => {
    const id = makeMonstro()
    renderFicha(id, 'habilidades')
    await screen.findByText('TIER')
    expect(screen.queryByText('NÍVEL')).toBeNull()
    const up = screen.getByRole('button', { name: '▲' })
    fireEvent.click(up)
    await waitFor(() => expect(mergedFm(id)['Tier']).toBe(1))
    fireEvent.click(up)
    fireEvent.click(up)
    await waitFor(() => expect(mergedFm(id)['Tier']).toBe(3))
    fireEvent.click(up) // clamp: nunca passa de 3
    await waitFor(() => expect(mergedFm(id)['Tier']).toBe(3))
    // e nunca tocou o FM Nível (Monstro não tem)
    expect(mergedFm(id)).not.toHaveProperty('Nível')
  })

  it('stepper ▼ clampa em 0', async () => {
    const id = makeMonstro()
    renderFicha(id, 'habilidades')
    await screen.findByText('TIER')
    fireEvent.click(screen.getByRole('button', { name: '▼' }))
    await waitFor(() => expect(mergedFm(id)['Tier'] ?? 0).toBe(0))
  })

  it('chip da topbar mostra "TIER 0" (não NVL)', async () => {
    const id = makeMonstro()
    // A topbar vive no AppShell (não no FichaPage) — monta o shell inteiro.
    render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter initialEntries={[heroPath(id, 'habilidades')]}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/heroi/*" element={<FichaPage />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </CatalogProvider>,
    )
    await waitFor(() => expect(screen.getByText(/^TIER 0$/)).toBeTruthy())
    expect(screen.queryByText(/^NVL/)).toBeNull()
  })

  it('trap reverso: HERÓI segue com NÍVEL e chip NVL', async () => {
    const id = createLocalEntity('Heroi', 'Heroi Teste', emptyHeroFrontmatter())
    renderFicha(id, 'habilidades')
    await screen.findByText('NÍVEL')
    expect(screen.queryByText('TIER')).toBeNull()
  })
})

describe('#409 — Monstro sem classe mostra "Criatura" na biografia', () => {
  it('banner de classe do perfil cai em "Criatura" (não "Aventureiro")', async () => {
    const id = makeMonstro()
    renderFicha(id, 'perfil')
    expect(await screen.findByText('Criatura')).toBeTruthy()
    expect(screen.queryByText('Aventureiro')).toBeNull()
  })

  it('trap reverso: HERÓI sem classe segue "Aventureiro"', async () => {
    const id = createLocalEntity('Heroi', 'Heroi Teste', emptyHeroFrontmatter())
    renderFicha(id, 'perfil')
    expect(await screen.findByText('Aventureiro')).toBeTruthy()
  })
})
