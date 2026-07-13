// @vitest-environment jsdom
// CRIAÇÃO RÁPIDA DE MONSTROS NO BESTIÁRIO (#185, req 6) — modo mestre: além
// do "+ Adicionar Criatura" (monstro em branco, #47), o FAB "Criar do
// Bestiário" abre o menu rápido com os monstros REAIS da vault (badge TIER);
// um clique cria a cópia LOCAL editável e abre a ficha. Mesmo fluxo/formato
// do importar do compêndio (#205) — a família Monstro já é portátil.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { NpcsPage } from '../src/components/creatures/CreaturesPages'
import { parsePortable } from '../src/data/hero-transfer'
import {
  localEntitiesOfKind,
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

const goblin = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'Sistema/Criaturas/Bestiário/Goblin Batedor.json'), 'utf8'),
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
  // o Bestiário (e a criação nele) é mestre-gated (issue #35)
  window.localStorage.setItem('pleitost.settings.mestre', 'true')
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals() // stubGlobal (URL) não é coberto pelo restoreAllMocks
})

function FichaProbe() {
  const { id } = useParams()
  return <div>FICHA:{id}</div>
}

function renderNpcs() {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={['/npcs']}>
        <Routes>
          <Route path="/npcs" element={<NpcsPage />} />
          <Route path="/heroi/:id" element={<FichaProbe />} />
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

async function abrirBestiario() {
  renderNpcs()
  fireEvent.click(screen.getByRole('button', { name: 'BESTIÁRIO' }))
  fireEvent.click(await screen.findByText('📥 Criar do Bestiário'))
  return screen.getByRole('dialog', { name: 'Importar Monstro' })
}

describe('criação rápida de monstros no Bestiário (#185)', () => {
  it('menu lista os monstros reais da vault com badge TIER', async () => {
    const dialog = await abrirBestiario()
    const item = await within(dialog).findByRole('button', { name: /Goblin Batedor/ })
    await waitFor(() => expect((item as HTMLButtonElement).disabled).toBe(false))
    // badge TIER do FM real (monstro não tem Nível)
    expect(item.textContent).toContain(`TIER ${goblin.frontmatter['Tier']}`)
  })

  it('um clique cria a cópia LOCAL editável e abre a ficha', async () => {
    const dialog = await abrirBestiario()
    const item = await within(dialog).findByRole('button', { name: /Goblin Batedor/ })
    await waitFor(() => expect((item as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(item)
    await screen.findByText(/^FICHA:local:Monstro:/)
    const copia = localEntitiesOfKind('Monstro')[0]
    expect(copia.basename).toBe('Goblin Batedor')
    expect(copia.frontmatter['Tier']).toBe(goblin.frontmatter['Tier'])
    expect(copia.frontmatter['Raça']).toBe(goblin.frontmatter['Raça'])
  })

  it('sem Modo Mestre o FAB não existe (gate do bestiário, issue #35)', async () => {
    window.localStorage.setItem('pleitost.settings.mestre', 'false')
    renderNpcs()
    expect(screen.queryByText('📥 Criar do Bestiário')).toBeNull()
  })

  it('monstro local exporta pelo menu ⋮ (formato portátil do #205)', async () => {
    // cria a cópia via menu rápido e volta pra lista
    const dialog = await abrirBestiario()
    const item = await within(dialog).findByRole('button', { name: /Goblin Batedor/ })
    await waitFor(() => expect((item as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(item)
    await screen.findByText(/^FICHA:local:Monstro:/)
    cleanup()

    let blob: Blob | undefined
    // stub preservando o construtor de URL (vide capturarDownload do
    // hero-transfer.test.tsx — `{...URL}` quebrava `new URL(...)` posterior)
    class StubURL extends URL {}
    vi.stubGlobal(
      'URL',
      Object.assign(StubURL, {
        createObjectURL: vi.fn((b: Blob) => {
          blob = b
          return 'blob:mock'
        }),
        revokeObjectURL: vi.fn(),
      }),
    )
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    renderNpcs()
    fireEvent.click(screen.getByRole('button', { name: 'BESTIÁRIO' }))
    fireEvent.click(await screen.findByLabelText('Ações da criatura'))
    fireEvent.click(screen.getByText('📤 Exportar criatura'))
    expect(blob).toBeTruthy()
    const texto = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result ?? ''))
      reader.onerror = () => reject(reader.error)
      reader.readAsText(blob!)
    })
    const portable = parsePortable(texto)
    expect(portable.kind).toBe('Monstro')
    expect(portable.basename).toBe('Goblin Batedor')
  })
})
