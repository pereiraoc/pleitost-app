// @vitest-environment jsdom
// CHIP DE EM CLICÁVEL (issue #230 — "EM não clicavel"): o chip de Energia
// Mágica da topbar (aba COMBATE) era um <span> estático em chipsFor — a vida
// ao lado abre um painel dropdown de ajuste (VidaChip), o EM não abria nada.
// Agora o EM é um botão no MESMO padrão do de vida: clicar abre o painel de
// ajuste (rows −10/−5/−1/+1/+5/+10) que grava o volátil
// Interativa.Recursos_Restantes.EM (+ EM_Secundaria quando houver), com
// clamp em [0, max].
//
// ORÁCULO (padrão de topbar-em.test.tsx): Carlos REAL (Bardo/Trovador,
// EM 4/4 cheio) — o teste clica no chip, ajusta e assere o valor no DOM.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveVaultFile } from './fixtures/frozen-heroes'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { AppShell } from '../src/components/layout/AppShell'
import { FichaPage } from '../src/components/ficha/FichaPage'
import { heroPath } from '../src/paths'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import {
  createLocalEntity,
  emptyHeroFrontmatter,
  __resetLocalStoreForTests,
} from '../src/data/local-entities'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
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
    const url = String(input)
    const rel = decodeURIComponent(url.replace(/^\/vault-data\//, ''))
    const file = resolveVaultFile(vaultDataDir, rel)
    const ok = fs.existsSync(file)
    return {
      ok,
      status: ok ? 200 : 404,
      json: async () => JSON.parse(fs.readFileSync(file, 'utf8')),
    }
  }) as typeof fetch
})

beforeEach(() => {
  window.localStorage.clear()
  __resetLocalStoreForTests()
  __resetHeroStoreMemoryForTests()
})
afterEach(cleanup)

function renderCombate() {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={[heroPath(CARLOS_ID, 'combate')]}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/heroi/*" element={<FichaPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

const chipTxt = () => screen.getByTestId('topbar-em-chip').textContent ?? ''

describe('chip de EM da topbar é clicável e ajusta o valor (issue #230)', () => {
  it('clicar no chip abre o painel de ajuste com a row ENERGIA MÁGICA', async () => {
    renderCombate()
    const chip = await screen.findByTestId('topbar-em-chip')
    expect(chip.tagName).toBe('BUTTON')
    expect(chip.textContent).toContain('4/4')
    fireEvent.click(chip)
    const pop = await screen.findByTestId('em-adjust-pop')
    expect(within(pop).getByText('ENERGIA MÁGICA')).toBeTruthy()
    expect(within(pop).getByText('4 / 4')).toBeTruthy()
    // Carlos não tem magias secundárias (EM Secundária max 0) → sem a row.
    expect(within(pop).queryByText('ENERGIA MÁGICA SECUNDÁRIA')).toBeNull()
  })

  it('−/+ mudam o EM no DOM (chip e row), com clamp em [0, max]', async () => {
    renderCombate()
    fireEvent.click(await screen.findByTestId('topbar-em-chip'))
    const pop = await screen.findByTestId('em-adjust-pop')

    // já cheio: +1 não passa do máximo
    fireEvent.click(within(pop).getByText('+1'))
    await waitFor(() => expect(chipTxt()).toContain('4/4'))

    fireEvent.click(within(pop).getByText('−1'))
    await waitFor(() => expect(chipTxt()).toContain('3/4'))
    expect(within(pop).getByText('3 / 4')).toBeTruthy()

    fireEvent.click(within(pop).getByText('−5')) // clamp no 0
    await waitFor(() => expect(chipTxt()).toContain('0/4'))

    fireEvent.click(within(pop).getByText('+10')) // clamp no max
    await waitFor(() => expect(chipTxt()).toContain('4/4'))
  })
})

describe('#377 — EM 0/0 não aparece na topbar', () => {
  it('herói sem energia mágica (EM máx 0): chip AUSENTE na aba combate', async () => {
    // herói local em branco: família tem caps.magias, mas sem classe
    // conjuradora o EM máx derivado é 0 — o chip "0/0" só poluía.
    const id = createLocalEntity('Heroi', 'Guerreiro Seco', emptyHeroFrontmatter())
    render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter initialEntries={[heroPath(id, 'combate')]}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/heroi/*" element={<FichaPage />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </CatalogProvider>,
    )
    // a topbar do combate montou (o chip de vida está lá)…
    await screen.findByTitle('Vida')
    // …mas o de EM não (Carlos 4/4 dos testes acima é o trap reverso).
    expect(screen.queryByTestId('topbar-em-chip')).toBeNull()
  }, 30000)
})
