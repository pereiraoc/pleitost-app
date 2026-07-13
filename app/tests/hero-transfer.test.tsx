// @vitest-environment jsdom
// IMPORTAR/EXPORTAR HERÓI E COMPANHEIRO ANIMAL (#205) — req do usuário: os
// personagens/grupos puxados do Obsidian ficam no compêndio como EXEMPLOS;
// botão "Importar Herói" (e de CA) ao lado do criar importa de ARQUIVO
// (formato exportado pelo menu "⋮" da lista) ou direto do compêndio.
// Tudo verificado NA TELA: FAB → modal → lista de exemplos → ficha aberta.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { HeroisPage, NpcsPage } from '../src/components/creatures/CreaturesPages'
import {
  createLocalEntity,
  emptyCompanheiroFrontmatter,
  localEntitiesOfKind,
  __resetLocalStoreForTests,
} from '../src/data/local-entities'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import { parsePortable, serializePortable, toPortable } from '../src/data/hero-transfer'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
const catalog = buildCatalog(manifest)

const adriann = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'Sistema/Criaturas/Heróis/Adriann.json'), 'utf8'),
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
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  // restoreAllMocks NÃO desfaz stubGlobal — sem isto o stub de URL vazava
  // pros testes seguintes do arquivo
  vi.unstubAllGlobals()
})

/** Sonda da rota da ficha — o import navega pra ficha do id novo. */
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

/** Sobe um arquivo no input do modal (files é readonly no jsdom). */
function uploadArquivo(conteudo: string, nome = 'heroi.pleitost.json') {
  const input = screen.getByLabelText('Arquivo do personagem') as HTMLInputElement
  const file = new File([conteudo], nome, { type: 'application/json' })
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  fireEvent.change(input)
}

/** Intercepta o download do menu ⋮: guarda o Blob e lê via FileReader (o
 *  Blob do jsdom não tem .text()). O stub PRESERVA o construtor de URL
 *  (classe que estende a real): `{...URL}` virava objeto plano e qualquer
 *  `new URL(...)` posterior — ex.: o client Supabase que o NpcCard assina
 *  pro caminho direto de iniciativa (#229) — explodia. */
function capturarDownload() {
  let blob: Blob | undefined
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
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  const texto = () =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result ?? ''))
      reader.onerror = () => reject(reader.error)
      reader.readAsText(blob!)
    })
  return { click, texto, temBlob: () => blob !== undefined }
}

describe('importar herói (#205)', () => {
  it('FAB Importar abre o modal com os EXEMPLOS do compêndio; importar copia e abre a ficha', async () => {
    renderHerois()
    fireEvent.click(await screen.findByText('📥 Importar Herói'))
    const dialog = screen.getByRole('dialog', { name: 'Importar Herói' })
    expect(within(dialog).getByText('// EXEMPLOS DO COMPÊNDIO')).toBeTruthy()
    const exemplo = await within(dialog).findByRole('button', { name: /Adriann/ })
    await waitFor(() => expect((exemplo as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(exemplo)
    const probe = await screen.findByText(/^FICHA:local:Heroi:/)
    expect(probe).toBeTruthy()
    // cópia local carrega o FM do exemplo (vault intocável — é uma CÓPIA)
    const copia = localEntitiesOfKind('Heroi')[0]
    expect(copia.basename).toBe('Adriann')
    expect(copia.frontmatter['Classe']).toBe(adriann.frontmatter['Classe'])
    expect(copia.frontmatter['Nível']).toBe(adriann.frontmatter['Nível'])
    // metadados de publicação do Obsidian não entram na cópia
    expect(copia.frontmatter['dg-publish']).toBeUndefined()
  })

  it('exportar pelo menu ⋮ baixa o .pleitost.json; importar o arquivo restaura (round-trip)', async () => {
    const id = createLocalEntity('Heroi', 'Zé Portátil', {
      Categoria: '[[Aventureiro|Aventureiro]]',
      subcategoria: 'Heroi',
      Classe: '[[Mago|Mago]]',
      'Nível': 3,
    })
    const download = capturarDownload()

    renderHerois()
    fireEvent.click(await screen.findByLabelText('Ações do herói'))
    fireEvent.click(screen.getByText('📤 Exportar herói'))
    expect(download.click).toHaveBeenCalled()
    expect(download.temBlob()).toBe(true)
    const baixado = await download.texto()
    const portable = parsePortable(baixado)
    expect(portable.kind).toBe('Heroi')
    expect(portable.basename).toBe('Zé Portátil')
    expect(portable.frontmatter['Nível']).toBe(3)

    // round-trip: apaga o original e importa o arquivo de volta pela tela
    window.localStorage.clear()
    __resetLocalStoreForTests()
    cleanup()
    renderHerois()
    fireEvent.click(await screen.findByText('📥 Importar Herói'))
    uploadArquivo(baixado)
    await screen.findByText(/^FICHA:local:Heroi:/)
    const restaurado = localEntitiesOfKind('Heroi')[0]
    expect(restaurado.id).not.toBe(id)
    expect(restaurado.basename).toBe('Zé Portátil')
    expect(restaurado.frontmatter['Classe']).toBe('[[Mago|Mago]]')
  })

  it('arquivo inválido mostra o erro na tela (sem criar nada)', async () => {
    renderHerois()
    fireEvent.click(await screen.findByText('📥 Importar Herói'))
    uploadArquivo('isso não é json de personagem')
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByText(/Arquivo inválido/)).toBeTruthy()
    expect(localEntitiesOfKind('Heroi')).toHaveLength(0)
  })
})

describe('importar/exportar companheiro animal (#205)', () => {
  it('aba COMPANHEIROS: FAB Importar lista os exemplos da vault e importa cópia local', async () => {
    renderNpcs()
    fireEvent.click(screen.getByRole('button', { name: 'COMPANHEIROS ANIMAIS' }))
    fireEvent.click(await screen.findByText('📥 Importar Companheiro'))
    const dialog = screen.getByRole('dialog', { name: 'Importar Companheiro Animal' })
    const metis = await within(dialog).findByRole('button', { name: /Metis, a Graxaim/ })
    await waitFor(() => expect((metis as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(metis)
    await screen.findByText(/^FICHA:local:CompanheiroAnimal:/)
    const copia = localEntitiesOfKind('CompanheiroAnimal')[0]
    expect(copia.basename).toBe('Metis, a Graxaim')
  })

  it('arquivo de HERÓI no modal de CA é recusado com mensagem de família', async () => {
    const heroi = serializePortable(
      toPortable({
        id: 'local:Heroi:x',
        kind: 'Heroi',
        type: 'Criatura',
        subtype: 'Heroi',
        basename: 'Errado',
        frontmatter: {},
        session: {},
        extras: {},
      }),
    )
    renderNpcs()
    fireEvent.click(screen.getByRole('button', { name: 'COMPANHEIROS ANIMAIS' }))
    fireEvent.click(await screen.findByText('📥 Importar Companheiro'))
    uploadArquivo(heroi, 'errado.pleitost.json')
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByText(/é de Heroi/)).toBeTruthy()
    expect(localEntitiesOfKind('CompanheiroAnimal')).toHaveLength(0)
  })

  it('CA local exporta pelo menu ⋮ do card', async () => {
    createLocalEntity('CompanheiroAnimal', 'Bidu', emptyCompanheiroFrontmatter('Bidu'))
    const download = capturarDownload()
    renderNpcs()
    fireEvent.click(screen.getByRole('button', { name: 'COMPANHEIROS ANIMAIS' }))
    fireEvent.click(await screen.findByLabelText('Ações do companheiro'))
    fireEvent.click(screen.getByText('📤 Exportar companheiro'))
    expect(download.temBlob()).toBe(true)
    const portable = parsePortable(await download.texto())
    expect(portable.kind).toBe('CompanheiroAnimal')
    expect(portable.basename).toBe('Bidu')
  })
})
