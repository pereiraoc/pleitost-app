// @vitest-environment jsdom
// #561 — herói NASCIDO NO APP não via a Inspiração do Bardo do grupo: ele entra
// no grupo pelo override de integrantes do grupo (setGroupMember → `add`), não
// pelo FM `grupo`, e a descoberta de aliados só olhava o FM. Samuel Altima
// (local) + Carlos Facão de Andradas (vault, Bardo com Inspiração em Acoes.Lista).
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
  groupBaseMemberIds,
  groupIdsWithMember,
  setGroupMember,
} from '../src/data/local-entities'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)
const GRUPO_ID = 'Sistema/Criaturas/Grupos de Criaturas/Carlos, Dante, Mera, Pind, Thoren'

function makeStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k) => (data.has(k) ? data.get(k)! : null),
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
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
  __resetHeroStoreMemoryForTests()
  __resetLocalStoreForTests()
})
afterEach(cleanup)

function samuel(): string {
  return createLocalEntity('Heroi', 'Samuel Altima', {
    ...emptyHeroFrontmatter(),
    nome: 'Samuel Altima',
    Classe: '[[Guerreiro]]',
    Sintonia: '[[Traço Elemental do Fogo]]',
  })
}

function renderCombate(heroId: string) {
  return render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={[heroPath(heroId, 'combate')]}>
        <Routes>
          <Route path="/heroi/*" element={<FichaPage />} />
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

describe('#561 — aliados por integrantes do grupo (herói local sem FM grupo)', () => {
  it('groupIdsWithMember: o grupo cujo override `add` tem o herói', () => {
    const id = samuel()
    expect(groupIdsWithMember(id)).toEqual([])
    setGroupMember(GRUPO_ID, id, true, groupBaseMemberIds(catalog, GRUPO_ID))
    expect(groupIdsWithMember(id)).toEqual([GRUPO_ID])
    setGroupMember(GRUPO_ID, id, false, groupBaseMemberIds(catalog, GRUPO_ID))
    expect(groupIdsWithMember(id)).toEqual([])
  })

  it('Samuel (local, no grupo do Carlos via integrantes) vê "Inspiração (de Carlos Facão de Andradas)" nos EFEITOS', async () => {
    const id = samuel()
    setGroupMember(GRUPO_ID, id, true, groupBaseMemberIds(catalog, GRUPO_ID))
    renderCombate(id)
    fireEvent.click(await screen.findByText('EFEITOS', undefined, { timeout: 15000 }))
    expect(
      await screen.findByText('Inspiração (de Carlos Facão de Andradas)', undefined, { timeout: 15000 }),
    ).toBeTruthy()
  }, 40000)

  it('sem entrar no grupo, nada do Carlos aparece', async () => {
    const id = samuel()
    renderCombate(id)
    fireEvent.click(await screen.findByText('EFEITOS', undefined, { timeout: 15000 }))
    await new Promise((r) => setTimeout(r, 1500))
    expect(screen.queryByText('Inspiração (de Carlos Facão de Andradas)')).toBeNull()
  }, 40000)
})
