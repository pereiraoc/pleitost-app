// @vitest-environment jsdom
// Anotações PESSOAS (#178/#179) + agregação em Criaturas/Pessoas (#183 req 5)
// + ficha RESUMO nos DETALHES (#180): lista pessoal POR personagem no FM dele,
// nova pessoa e personagem EXISTENTE (com Alvo → resumo), membros de grupo
// automáticos, e as entradas visíveis em Criaturas/Pessoas.
import { beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { DetailProvider } from '../src/data/detail-context'
import { AnotacoesTab } from '../src/components/ficha/AnotacoesTab'
import { NpcsPage } from '../src/components/creatures/CreaturesPages'
import { RightSidebar } from '../src/components/layout/RightSidebar'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import {
  __resetLocalStoreForTests,
  createLocalEntity,
  emptyHeroFrontmatter,
  getLocalDoc,
} from '../src/data/local-entities'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
const catalog = buildCatalog(manifest)

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

function renderAnotacoes(heroId: string) {
  const doc = getLocalDoc(heroId)!
  return render(
    <CatalogProvider catalog={catalog}>
      <DetailProvider>
        <MemoryRouter>
          <AnotacoesTab doc={doc} />
          <RightSidebar drawerOpen onCloseDrawer={() => {}} />
        </MemoryRouter>
      </DetailProvider>
    </CatalogProvider>,
  )
}

describe('Anotações PESSOAS (#178/#179) + resumo (#180)', () => {
  it('nova pessoa: entra na lista pessoal (FM do herói) com os campos', async () => {
    const id = createLocalEntity('Heroi', 'Meu Herói', emptyHeroFrontmatter())
    renderAnotacoes(id)
    fireEvent.click(await screen.findByText('PESSOAS'))
    fireEvent.click(await screen.findByText('+ Nova Pessoa'))
    const dialog = await screen.findByRole('dialog', { name: 'Adicionar Pessoa' })
    fireEvent.change(within(dialog).getByLabelText('Nome'), { target: { value: 'Zeca do Bar' } })
    fireEvent.change(within(dialog).getByLabelText('Organização'), { target: { value: 'Taverna' } })
    fireEvent.click(within(dialog).getByText(/Adicionar|Salvar|Criar/))
    await waitFor(() => expect(screen.getByText('Zeca do Bar')).toBeTruthy())
    // persistiu no FM do herói (lista PESSOAL — req 1)
    const fm = getLocalDoc(id)!.frontmatter as Record<string, unknown>
    const pessoas = fm['Pessoas'] as Array<Record<string, string>>
    expect(pessoas.length).toBe(1)
    expect(pessoas[0]['Nome']).toBe('Zeca do Bar')
    expect(pessoas[0]['Organização']).toBe('Taverna')
  })

  it('existente: picker escolhe herói do usuário; clique no nome abre a ficha RESUMO nos detalhes', async () => {
    const id = createLocalEntity('Heroi', 'Meu Herói', emptyHeroFrontmatter())
    createLocalEntity('Heroi', 'Aliado Conhecido', { ...emptyHeroFrontmatter(), Classe: '[[Bardo]]' })
    renderAnotacoes(id)
    fireEvent.click(await screen.findByText('PESSOAS'))
    fireEvent.click(await screen.findByText('+ Existente'))
    const sel = (await screen.findByLabelText('Personagem existente')) as HTMLSelectElement
    const opt = [...sel.options].find((o) => o.textContent === 'Aliado Conhecido')!
    fireEvent.change(sel, { target: { value: opt.value } })
    fireEvent.click(screen.getByText('Continuar →'))
    // campos pessoais com Nome travado
    const dialog = await screen.findByRole('dialog', { name: 'Adicionar Pessoa' })
    const nomeInput = within(dialog).getByDisplayValue('Aliado Conhecido') as HTMLInputElement
    expect(nomeInput.disabled).toBe(true)
    fireEvent.click(within(dialog).getByText(/Adicionar|Salvar|Criar/))
    // card com badge CONHECIDO; clicar no nome abre o RESUMO na sidebar
    await waitFor(() => expect(screen.getByText('CONHECIDO')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Aliado Conhecido' }))
    await waitFor(() => {
      expect(screen.getByText('// VIDA')).toBeTruthy()
      expect(screen.getByText('// DEFESAS · SENTIDOS · MOVIMENTO')).toBeTruthy()
    })
  })

  it('Criaturas/Pessoas agrega as pessoas das anotações dos heróis do usuário', async () => {
    const id = createLocalEntity('Heroi', 'Meu Herói', emptyHeroFrontmatter())
    renderAnotacoes(id)
    fireEvent.click(await screen.findByText('PESSOAS'))
    fireEvent.click(await screen.findByText('+ Nova Pessoa'))
    const dialog = await screen.findByRole('dialog', { name: 'Adicionar Pessoa' })
    fireEvent.change(within(dialog).getByLabelText('Nome'), { target: { value: 'Zeca do Bar' } })
    fireEvent.click(within(dialog).getByText(/Adicionar|Salvar|Criar/))
    cleanup()
    render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter>
          <Routes>
            <Route path="/" element={<NpcsPage />} />
          </Routes>
        </MemoryRouter>
      </CatalogProvider>,
    )
    // card agregado com o herói de origem
    expect(await screen.findByText('Zeca do Bar')).toBeTruthy()
    expect(screen.getByText(/conhecido de Meu Herói/)).toBeTruthy()
  })
})
