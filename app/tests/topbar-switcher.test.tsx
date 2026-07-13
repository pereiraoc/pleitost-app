// @vitest-environment jsdom
// SELETOR RÁPIDO DA TOPBAR (issue #34, refeito no #211): avatar do herói
// atual junto do apelido; o popover lista SÓ OS PERSONAGENS DO USUÁRIO
// (entidades locais — heróis criados/importados e companheiros animais), no
// mesmo universo da tela HERÓIS (#181). Os da vault são EXEMPLOS do compêndio
// e NÃO aparecem. Mecânica preservada: 3 itens visíveis (scroll pro resto),
// ordem tier desc + alfabético pt, item atual --on, navegação pra ficha.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { AppShell } from '../src/components/layout/AppShell'
import { FichaPage } from '../src/components/ficha/FichaPage'
import { heroPath } from '../src/paths'
import {
  createLocalEntity,
  emptyCompanheiroFrontmatter,
  emptyHeroFrontmatter,
  __resetLocalStoreForTests,
} from '../src/data/local-entities'
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

beforeEach(() => {
  window.localStorage.clear()
  __resetLocalStoreForTests()
  __resetHeroStoreMemoryForTests()
})
afterEach(cleanup)

/** Personagens DO USUÁRIO: níveis escolhidos pra ordenação ser observável —
 *  Rex (CA, nv 8 = T3) < Bruno/Zeca (nv 5 = T2, alfabético) < Ana (nv 2 = T1). */
function seedLocais() {
  const ana = createLocalEntity('Heroi', 'Ana', { ...emptyHeroFrontmatter(), Nível: 2 })
  createLocalEntity('Heroi', 'Zeca', { ...emptyHeroFrontmatter(), Nível: 5 })
  createLocalEntity('Heroi', 'Bruno', { ...emptyHeroFrontmatter(), Nível: 5 })
  createLocalEntity('CompanheiroAnimal', 'Rex', {
    ...emptyCompanheiroFrontmatter('Rex'),
    Nível: 8,
  })
  return { ana }
}

function renderApp(initial: string) {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={[initial]}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/heroi/*" element={<FichaPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

describe('seletor rápido: só personagens do usuário (#211)', () => {
  it('lista APENAS os locais — nenhum herói/CA da vault aparece', async () => {
    const { ana } = seedLocais()
    renderApp(heroPath(ana))
    fireEvent.click(await screen.findByTestId('topbar-avatar'))
    const list = screen.getByTestId('switcher-list')
    await waitFor(() => {
      expect(within(list).getAllByRole('button').length).toBe(4)
    })
    // exemplos da vault FORA do seletor (ficam no compêndio)
    expect(within(list).queryByRole('button', { name: /Carlos Facão/ })).toBeNull()
    expect(within(list).queryByRole('button', { name: /Adriann/ })).toBeNull()
    expect(within(list).queryByRole('button', { name: /Metis, a Graxaim/ })).toBeNull()
  })

  it('ordem das listas: tier desc + alfabético pt; 3 visíveis com scroll', async () => {
    const { ana } = seedLocais()
    renderApp(heroPath(ana))
    fireEvent.click(await screen.findByTestId('topbar-avatar'))
    const list = screen.getByTestId('switcher-list')
    expect(list.style.maxHeight).toBe('150px')
    expect(list.style.overflowY).toBe('auto')
    await waitFor(() => {
      const nomes = within(list)
        .getAllByRole('button')
        .map((b) => b.textContent)
      // sem retrato, o slot de iniciais contribui com a 1ª letra no texto
      expect(nomes).toEqual(['Rex', 'Bruno', 'Zeca', 'Ana'].map((n) => `${n[0]}${n}`))
    })
  })

  it('item atual destacado com --on; clicar noutro navega pra ficha dele', async () => {
    const { ana } = seedLocais()
    renderApp(heroPath(ana))
    fireEvent.click(await screen.findByTestId('topbar-avatar'))
    const list = screen.getByTestId('switcher-list')
    const anaRow = await within(list).findByRole('button', { name: /Ana/ })
    expect(anaRow.style.getPropertyValue('--on')).toBe('1')
    const rexRow = within(list).getByRole('button', { name: /Rex/ })
    expect(rexRow.style.getPropertyValue('--on')).toBe('0')
    // navegação: CA local abre a própria ficha (família CA, mesma rota /heroi)
    fireEvent.click(rexRow)
    expect((await screen.findAllByDisplayValue('Rex')).length).toBeGreaterThan(0)
    expect(screen.queryByTestId('switcher-list')).toBeNull()
  })

  it('sem personagens do usuário: popover abre vazio (nada da vault vaza)', async () => {
    // ficha aberta é da vault (rota direta ainda funciona), mas o seletor
    // continua listando só o que é do usuário — aqui, nada.
    renderApp(heroPath('Sistema/Criaturas/Heróis/Carlos Facão de Andradas'))
    fireEvent.click(await screen.findByTestId('topbar-avatar'))
    const list = screen.getByTestId('switcher-list')
    await waitFor(() => {
      expect(within(list).queryAllByRole('button').length).toBe(0)
    })
  })
})
