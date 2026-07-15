// @vitest-environment jsdom
// #258 — o botão de CRIAR/IMPORTAR herói fica ancorado à borda ESQUERDA do
// painel DIREITO; quando esse painel está colapsado/off-canvas (telas
// estreitas), o botão volta ao CANTO da tela. A posição responsiva mora na
// classe `.create-fab` (app.css) — aqui garantimos (a) que o FAB usa essa
// classe e é `position:fixed`, e (b) que o CSS de fato recua o FAB pra
// esquerda do painel direito na coluna fixa (>=1100px).
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { HeroisPage } from '../src/components/creatures/CreaturesPages'
import {
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

function renderHerois() {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={['/herois']}>
        <Routes>
          <Route path="/herois" element={<HeroisPage />} />
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

describe('FAB criar/importar herói (#258)', () => {
  it('criar e importar usam a classe .create-fab e são position:fixed', () => {
    renderHerois()
    const criar = screen.getByRole('button', { name: /Criar Herói/ })
    const importar = screen.getByRole('button', { name: /Importar Herói/ })
    expect(criar.classList.contains('create-fab')).toBe(true)
    expect(importar.classList.contains('create-fab')).toBe(true)
    // importar é a variante secundária (outline)
    expect(importar.classList.contains('secondary')).toBe(true)
    // empilhamento: importar fica ACIMA do criar (bottom maior) — o único
    // posicionamento que fica inline; o resto (fixed/right responsivo) é CSS
    expect(parseInt(importar.style.bottom, 10)).toBeGreaterThan(parseInt(criar.style.bottom, 10))
  })

  it('CSS ancora o FAB no canto por padrão e o recua pra esquerda do painel direito na coluna fixa', () => {
    const css = fs.readFileSync(path.join(appDir, 'src/styles/app.css'), 'utf8')
    // bloco base: fixed + no canto (right:26px)
    expect(css).toMatch(/\.create-fab\s*\{[^}]*position:\s*fixed/)
    expect(css).toMatch(/\.create-fab\s*\{[^}]*right:\s*26px/)
    // na coluna fixa (>=1100px), recua pra ficar À ESQUERDA do painel de 320px:
    // o override do FAB (right:346px) precisa estar DENTRO de um @media 1100px
    const fabOverride = css.match(
      /@media \(min-width: 1100px\)\s*\{[^@]*?\.create-fab\s*\{[^}]*right:\s*346px[^}]*\}/,
    )
    expect(fabOverride).toBeTruthy()
  })
})
