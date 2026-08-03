// @vitest-environment jsdom
// Report #413 ("Não consigo editar pessoas criadas em criaturas"): a Pessoa
// LOCAL criada pelo "+ Adicionar Pessoa" de Criaturas/Pessoas abria como DOC
// read-only (KIND_INFO ficha:'doc') e o card não tinha menu — sem como editar
// (nem deletar) os campos do #45. O PessoaForm sempre foi edit-ready
// (initial/ImgId com semântica de edição — o painel de anotações edita com
// ele); faltava o ponto de entrada: menu ⋯ do card com ✎ Editar (reabre o
// form pré-preenchido; salvar regrava o FM local e renomeia via `nome`→
// basename, #218) e 🗑 Deletar (tombstone, paridade com CA/Monstro #375).
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { NpcsPage } from '../src/components/creatures/CreaturesPages'
import {
  __resetLocalStoreForTests,
  createLocalEntity,
  getLocalEntity,
  pessoaFrontmatter,
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
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<NpcsPage />} />
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
}

function makePessoa(): string {
  return createLocalEntity(
    'Pessoa',
    'Fulana Teste',
    pessoaFrontmatter({
      Relação: 'Neutro',
      Organização: 'Guilda dos Remos',
      Posição: 'Chefe',
      Detalhes: 'Sempre no cais.',
    }),
  )
}

describe('#413 — editar/deletar Pessoa local em Criaturas/Pessoas', () => {
  it('menu ⋯ → ✎ Editar reabre o form preenchido; salvar regrava FM e renomeia', async () => {
    const id = makePessoa()
    renderNpcs()
    await screen.findByText('Fulana Teste')
    fireEvent.click(screen.getByRole('button', { name: 'Ações da pessoa' }))
    fireEvent.click(screen.getByText(/Editar pessoa/))
    const dialog = await screen.findByRole('dialog', { name: 'Adicionar Pessoa' })
    // Report do usuário (round 2): o modal renderizado DENTRO do card fica
    // recortado pelo clip-path do .npc-card (e preso ao transform do track) —
    // "aparece só por cima do mini espaço da criatura". Tem que ir de PORTAL
    // pro body, como o CardDotsMenu deste mesmo arquivo.
    expect(dialog.closest('.npc-card')).toBeNull()
    // pré-preenchido com os campos atuais
    expect((within(dialog).getByLabelText('Nome') as HTMLInputElement).value).toBe('Fulana Teste')
    expect((within(dialog).getByLabelText('Organização') as HTMLInputElement).value).toBe(
      'Guilda dos Remos',
    )
    fireEvent.change(within(dialog).getByLabelText('Nome'), {
      target: { value: 'Fulana Renomeada' },
    })
    fireEvent.change(within(dialog).getByLabelText('Organização'), {
      target: { value: 'Taverna do Porto' },
    })
    fireEvent.click(within(dialog).getByText(/Adicionar|Salvar|Criar/))
    const rec = getLocalEntity(id)!
    expect(rec.basename).toBe('Fulana Renomeada') // #218: nome espelha o basename
    expect(rec.frontmatter['Organização']).toBe('Taverna do Porto')
    expect(rec.frontmatter['Detalhes']).toBe('Sempre no cais.') // intocado
    // o card reflete o rename
    expect(await screen.findByText('Fulana Renomeada')).toBeTruthy()
  })

  it('menu ⋯ → 🗑 Deletar (com confirmação) remove a pessoa', async () => {
    const id = makePessoa()
    renderNpcs()
    await screen.findByText('Fulana Teste')
    fireEvent.click(screen.getByRole('button', { name: 'Ações da pessoa' }))
    fireEvent.click(screen.getByText(/Deletar pessoa/))
    fireEvent.click(screen.getByText(/Confirmar\?/))
    expect(getLocalEntity(id)).toBeUndefined()
    expect(screen.queryByText('Fulana Teste')).toBeNull()
  })
})
