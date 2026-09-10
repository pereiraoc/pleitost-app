// @vitest-environment jsdom
// A TRAVA de `Inteligência X` na ficha (decisão 2026-09-10: trava, não
// penalidade): com INT abaixo do exigido a linha de ataque não mostra acerto,
// dano nem AdO — mostra o motivo. Com INT suficiente, a arma volta a ser arma.
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
import {
  __resetLocalStoreForTests,
  createLocalEntity,
  emptyHeroFrontmatter,
  setLocalEntityFm,
} from '../src/data/local-entities'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const temDataset = fs.existsSync(
  path.join(vaultDataDir, 'Sistema/Equipamento/Armas/Armas Arcanônicas/Pistola Arcanônica.json'),
)

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

describe.skipIf(!temDataset)('Pistola Arcanônica na ficha', () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
  ) as IndexManifest
  const catalog = buildCatalog(manifest)

  beforeAll(() => {
    if (!window.localStorage) {
      Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true })
    }
    globalThis.fetch = (async (input: unknown) => {
      const rel = decodeURIComponent(String(input).replace(/^\/vault-data\//, ''))
      const file = path.join(vaultDataDir, rel)
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

  function heroiComPistola(int: number, opts?: { agi?: number; forca?: number; atributoFm?: string }) {
    const id = createLocalEntity('Heroi', `Pistoleiro INT ${int}`, emptyHeroFrontmatter())
    setLocalEntityFm(id, 'Atributos.INT', int)
    if (opts?.agi !== undefined) setLocalEntityFm(id, 'Atributos.AGI', opts.agi)
    if (opts?.forca !== undefined) setLocalEntityFm(id, 'Atributos.FOR', opts.forca)
    setLocalEntityFm(id, 'Inventario.Armas.Lista', [
      {
        Nome: '[[Pistola Arcanônica]]',
        Atributo: opts?.atributoFm ?? 'AGI',
        Bonus_Item: 0,
        Bonus_Especial: 0,
        Fonte: 'Manual',
      },
    ])
    render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter initialEntries={[heroPath(id, 'combate')]}>
          <Routes>
            <Route path="/heroi/*" element={<FichaPage />} />
          </Routes>
        </MemoryRouter>
      </CatalogProvider>,
    )
  }

  it('INT 0: a linha diz que a arma exige INT 1 e não mostra dano', async () => {
    heroiComPistola(0)
    expect(await screen.findByText(/EXIGE INT 1/, undefined, { timeout: 20000 })).toBeTruthy()
    expect(screen.queryByText(/⚔️ 1d6/)).toBeNull()
  }, 30000)

  it('INT 1: a arma funciona (dano na linha, sem aviso de trava)', async () => {
    heroiComPistola(1)
    await waitFor(() => expect(screen.getByText(/⚔️ \d+d6/)).toBeTruthy(), { timeout: 20000 })
    expect(screen.queryByText(/EXIGE INT/)).toBeNull()
  }, 30000)
  it('acerta com AGI mesmo se o FM da arma disser FOR (regra da arma de fogo)', async () => {
    // FOR 4 / AGI 3 e a linha do FM gravada como FOR: quem vale é a AGI.
    heroiComPistola(1, { agi: 3, forca: 4, atributoFm: 'FOR' })
    await waitFor(() => expect(screen.getByText(/⚔️ \d+d6/)).toBeTruthy(), { timeout: 20000 })
    const linha = screen.getByText(/⚔️ \d+d6/).closest('div')!.parentElement!
    expect(linha.textContent).toContain('+3')
    expect(linha.textContent).not.toContain('+4')
  }, 30000)
})
