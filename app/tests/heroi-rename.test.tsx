// @vitest-environment jsdom
// RENOMEAR HERÓI (#218) — req do usuário: "mudei nome do personagem mas não
// tá alterando o nome na lista de heróis, continua novo herói". O PERFIL
// grava FM `nome`; listas/seletores/exports leem o BASENAME da entidade —
// agora o setLocalEntityFm espelha `nome` no basename (regra do plugin:
// nome exibido = FM nome, senão basename).
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { HeroisPage } from '../src/components/creatures/CreaturesPages'
import { FichaPage } from '../src/components/ficha/FichaPage'
import { heroPath } from '../src/paths'
import {
  createLocalEntity,
  emptyHeroFrontmatter,
  getLocalEntity,
  setLocalEntityFm,
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

describe('renomear herói reflete na lista (#218)', () => {
  it('editar o NOME no PERFIL atualiza o card da lista de heróis', async () => {
    const id = createLocalEntity('Heroi', 'Novo Herói', emptyHeroFrontmatter())
    render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter initialEntries={[heroPath(id)]}>
          <Routes>
            <Route path="/heroi/*" element={<FichaPage />} />
            <Route path="/herois" element={<HeroisPage />} />
          </Routes>
        </MemoryRouter>
      </CatalogProvider>,
    )
    const input = await screen.findByLabelText('Nome')
    fireEvent.change(input, { target: { value: 'Dante Renomeado' } })
    // o store espelhou no basename (o que listas/seletores/exports leem)
    expect(getLocalEntity(id)?.basename).toBe('Dante Renomeado')
    // e NA TELA: a lista de heróis mostra o nome novo
    cleanup()
    render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter initialEntries={['/herois']}>
          <Routes>
            <Route path="/herois" element={<HeroisPage />} />
          </Routes>
        </MemoryRouter>
      </CatalogProvider>,
    )
    expect(await screen.findByText('Dante Renomeado')).toBeTruthy()
    expect(screen.queryByText('Novo Herói')).toBeNull()
  })

  it('nome vazio não apaga o basename (fallback preservado)', () => {
    const id = createLocalEntity('Heroi', 'Fulano', emptyHeroFrontmatter())
    setLocalEntityFm(id, 'nome', '')
    expect(getLocalEntity(id)?.basename).toBe('Fulano')
  })

  it('paths que não são o nome não mexem no basename', () => {
    const id = createLocalEntity('Heroi', 'Fulano', emptyHeroFrontmatter())
    setLocalEntityFm(id, 'Nível', 5)
    setLocalEntityFm(id, 'Biografia.Apelido', 'Fu')
    expect(getLocalEntity(id)?.basename).toBe('Fulano')
  })
})
