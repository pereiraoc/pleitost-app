// @vitest-environment jsdom
// Report #375: "Não consigo deletar companheiros animais. Tinha esse bug
// antes nos heróis." — o menu "⋮" do card de CA/monstro local (NpcCard) tinha
// Exportar e Adicionar à iniciativa, mas NUNCA ganhou o item Deletar que o
// HeroCard tem desde #215. Mesmo padrão: confirmação in-app em 2 cliques,
// removeLocalEntity (grava tombstone → some da conta toda, #366).
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { NpcsPage } from '../src/components/creatures/CreaturesPages'
import {
  createLocalEntity,
  emptyCompanheiroFrontmatter,
  emptyMonstroFrontmatter,
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

function renderNpcs() {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={['/npcs']}>
        <Routes>
          <Route path="/npcs" element={<NpcsPage />} />
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

describe('#375 — deletar companheiro animal pelo menu ⋮', () => {
  it('CA local: dois cliques (arma + confirma) removem a entidade', async () => {
    createLocalEntity('CompanheiroAnimal', 'Rex Deletável', emptyCompanheiroFrontmatter('Rex Deletável'))
    renderNpcs()
    expect(await screen.findByText('Rex Deletável')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Ações do companheiro'))
    fireEvent.click(await screen.findByText(/Deletar companheiro/))
    // 1º clique só ARMA
    expect(screen.getByText(/Confirmar\? Remove da sua conta/)).toBeTruthy()
    expect(localEntitiesOfKind('CompanheiroAnimal')).toHaveLength(1)
    // 2º clique EXECUTA
    fireEvent.click(screen.getByText(/Confirmar\? Remove da sua conta/))
    await waitFor(() => expect(screen.queryByText('Rex Deletável')).toBeNull())
    expect(localEntitiesOfKind('CompanheiroAnimal')).toHaveLength(0)
  })

  it('monstro local também ganha Deletar (mesmo menu)', async () => {
    createLocalEntity('Monstro', 'Ogro Temporário', emptyMonstroFrontmatter())
    renderNpcs()
    expect(await screen.findByText('Ogro Temporário')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Ações da criatura'))
    fireEvent.click(await screen.findByText(/Deletar criatura/))
    fireEvent.click(screen.getByText(/Confirmar\? Remove da sua conta/))
    await waitFor(() => expect(localEntitiesOfKind('Monstro')).toHaveLength(0))
  })

  it('CA da VAULT (conhecido, read-only) NÃO ganha Deletar', async () => {
    renderNpcs()
    // Metis (vault) está na lista; card read-only não tem menu de ações
    // com Deletar — nem sequer o menu (sem podeExportar/podeIniciativa).
    await screen.findByText(/Metis, a Graxaim/)
    expect(screen.queryByText(/Deletar companheiro/)).toBeNull()
  })
})
