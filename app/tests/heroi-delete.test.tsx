// @vitest-environment jsdom
// DELETAR HERÓI (#215) — req do usuário: "não tô conseguindo remover um herói
// (lembrar que isso não remove ele da database)". O window.confirm é
// suprimido em PWA standalone (iOS) — a confirmação agora é IN-APP no próprio
// menu "⋮" (1º clique arma, 2º executa), e o copy deixa explícito que só a
// CÓPIA LOCAL sai; os exemplos da database (compêndio) nunca são afetados.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { HeroisPage } from '../src/components/creatures/CreaturesPages'
import {
  createLocalEntity,
  emptyHeroFrontmatter,
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

function FichaProbe() {
  const { id } = useParams()
  return <div>FICHA:{id}</div>
}

function renderHerois() {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={['/herois']}>
        <Routes>
          <Route path="/herois" element={<HeroisPage />} />
          <Route path="/heroi/:id" element={<FichaProbe />} />
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

describe('deletar herói pelo menu ⋮ (#215)', () => {
  it('dois cliques: arma a confirmação in-app e remove — sem window.confirm', async () => {
    createLocalEntity('Heroi', 'Zé Deletável', emptyHeroFrontmatter())
    renderHerois()
    expect(await screen.findByText('Zé Deletável')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Ações do herói'))
    // 1º clique ARMA: rótulo troca pra confirmação, nada é removido ainda
    fireEvent.click(screen.getByText(/Deletar herói/))
    expect(screen.getByText(/Confirmar\? Remove só a cópia local/)).toBeTruthy()
    expect(localEntitiesOfKind('Heroi')).toHaveLength(1)
    // 2º clique EXECUTA
    fireEvent.click(screen.getByText(/Confirmar\? Remove só a cópia local/))
    await waitFor(() => expect(screen.queryByText('Zé Deletável')).toBeNull())
    expect(localEntitiesOfKind('Heroi')).toHaveLength(0)
  })

  it('fechar o menu desarma: reabrir volta ao rótulo normal e nada foi removido', async () => {
    createLocalEntity('Heroi', 'Zé Cauteloso', emptyHeroFrontmatter())
    renderHerois()
    fireEvent.click(await screen.findByLabelText('Ações do herói'))
    fireEvent.click(screen.getByText(/Deletar herói/))
    expect(screen.getByText(/Confirmar\?/)).toBeTruthy()
    // clicar fora fecha (overlay) e DESARMA — o overlay é o irmão anterior do
    // menu no portal (selector genérico de position:fixed pegava o FAB)
    fireEvent.click(screen.getByRole('menu').previousElementSibling!)
    fireEvent.click(screen.getByLabelText('Ações do herói'))
    expect(screen.getByText(/Deletar herói/)).toBeTruthy()
    expect(screen.queryByText(/Confirmar\?/)).toBeNull()
    expect(localEntitiesOfKind('Heroi')).toHaveLength(1)
  })

  it('database intocada: deletar a cópia importada não tira o exemplo do compêndio', async () => {
    renderHerois()
    // importa o exemplo Adriann do compêndio (cópia local)
    fireEvent.click(await screen.findByText('📥 Importar Herói'))
    const dialog = screen.getByRole('dialog', { name: 'Importar Herói' })
    const exemplo = await within(dialog).findByRole('button', { name: /Adriann/ })
    await waitFor(() => expect((exemplo as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(exemplo)
    // onImported navega pra ficha da cópia — volta pra lista re-renderizando
    await screen.findByText(/^FICHA:local:Heroi:/)
    expect(localEntitiesOfKind('Heroi')).toHaveLength(1)
    cleanup()
    renderHerois()
    // deleta a cópia local em dois cliques
    fireEvent.click(await screen.findByLabelText('Ações do herói'))
    fireEvent.click(screen.getByText(/Deletar herói/))
    fireEvent.click(screen.getByText(/Confirmar\?/))
    await waitFor(() => expect(localEntitiesOfKind('Heroi')).toHaveLength(0))
    // o EXEMPLO segue na database: reabrir o importador mostra Adriann de novo
    fireEvent.click(screen.getByText('📥 Importar Herói'))
    const dialog2 = screen.getByRole('dialog', { name: 'Importar Herói' })
    expect(await within(dialog2).findByRole('button', { name: /Adriann/ })).toBeTruthy()
  })
})
