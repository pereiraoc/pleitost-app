// @vitest-environment jsdom
// COMBATE/ATAQUES (issue #77): cada ataque de arma mostra a IMAGEM DA ARMA
// (weaponImageUrl) com a imbuição/propriedade PEQUENA sobreposta no canto
// inferior direito — mesmo padrão do selo de obra-prima da armadura (#65,
// overlay absoluto). Integração sobre o herói REAL da vault (Carlos Facão de
// Andradas): Punhal Experiente com Imbuição Relampejante. Expectativas
// recomputadas AQUI a partir dos JSONs, independentes do código da ficha.
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

const CARLOS_ID = 'Sistema/Criaturas/Heróis/Carlos Facão de Andradas'
const carlos = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, `${CARLOS_ID}.json`), 'utf8'),
) as VaultDoc
const fm = carlos.frontmatter as Record<string, any>
const armaFm = fm.Inventario.Armas.Lista[0] // Punhal, Experiente, Imbuição Relampejante
const armaBase = /\[\[([^\]|]+)/.exec(String(armaFm.Nome))![1].trim() // Punhal

/** vitest 4 + jsdom sem webstorage do Node — polyfill fiel só no teste. */
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
  __resetHeroStoreMemoryForTests()
})
afterEach(cleanup)

function renderCombate() {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={[heroPath(CARLOS_ID, 'combate')]}>
        <Routes>
          <Route path="/heroi/*" element={<FichaPage />} />
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

/** <span> com backgroundImage (decodificado) contendo `needle`. */
function bgSpan(container: HTMLElement, needle: string): HTMLElement | undefined {
  return [...container.querySelectorAll<HTMLElement>('span')].find(
    (s) => s.style.backgroundImage && decodeURIComponent(s.style.backgroundImage).includes(needle),
  )
}

describe('#77: ATAQUES mostram a imagem da arma + imbuição no canto', () => {
  it('imagem da arma (Figura/Armas/Punhal.png) com a imbuição sobreposta (Relampejante Experiente)', async () => {
    // fixtures reais: Punhal Experiente com Imbuição Relampejante
    expect(String(armaFm.Categoria)).toBe('[[Experiente]]')
    expect(String(armaFm.Propriedade)).toContain('Imbuição Relampejante')
    const figPath = `Recursos e Mídia/Imagens/Cartas/Figura/Armas/${armaBase}.png`
    const assets = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'assets.json'), 'utf8'))
    expect(assets.assets.some((a: any) => a.path === figPath)).toBe(true)

    const { container } = renderCombate()
    await screen.findByText(/Punhal Relampejante/)
    await waitFor(() => {
      // IMAGEM DA ARMA no ataque (weaponImageUrl → Figura/Armas)
      expect(bgSpan(container, `Figura/Armas/${armaBase}.png`)).toBeTruthy()
      // imbuição PEQUENA sobreposta no canto (overlay absoluto, padrão #65)
      const overlay = container.querySelector<HTMLElement>('[aria-label="Propriedade"]')
      expect(overlay, 'overlay da imbuição no ataque').toBeTruthy()
      expect(decodeURIComponent(overlay!.style.backgroundImage)).toContain(
        'Imbuições e Têmperas/Imbuição Relampejante Experiente.png',
      )
      expect(overlay!.style.position).toBe('absolute')
    })
  })
})
