// @vitest-environment jsdom
// IMAGEM NAS PESSOAS (issue #200): o card da lista de PESSOAS mostra o retrato
// à esquerda — linha com Alvo (personagem existente) usa o retrato DO ALVO;
// pessoa avulsa usa a imagem que o jogador sobe no próprio form (ImgId →
// store de imagens, IndexedDB); sem imagem, o fallback padrão de iniciais.
// O form só oferece upload pra pessoa NOVA/avulsa (Alvo já tem retrato), e a
// edição permite remover a imagem.
//
// fake-indexeddb + stubs de object URL: mesmo arranjo do imagens.test.tsx
// (jsdom não implementa IndexedDB nem URL.createObjectURL).
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { DetailProvider } from '../src/data/detail-context'
import { AnotacoesTab } from '../src/components/ficha/AnotacoesTab'
import { saveEntityImage, __resetImagesStoreForTests } from '../src/data/images'
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
  // jsdom não implementa object URLs — stub determinístico (vide imagens.test).
  let seq = 0
  URL.createObjectURL = () => `blob:fake-${seq++}`
  URL.revokeObjectURL = () => undefined
})

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  __resetImagesStoreForTests()
  window.localStorage.clear()
  __resetLocalStoreForTests()
  __resetHeroStoreMemoryForTests()
})
afterEach(cleanup)

const fakePng = () =>
  new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'retrato.png', { type: 'image/png' })

const blobImg = (root: HTMLElement) => root.querySelector<HTMLImageElement>('img[src^="blob:"]')

function renderAnotacoes(heroId: string) {
  const doc = getLocalDoc(heroId)!
  return render(
    <CatalogProvider catalog={catalog}>
      <DetailProvider>
        <MemoryRouter>
          <AnotacoesTab doc={doc} />
        </MemoryRouter>
      </DetailProvider>
    </CatalogProvider>,
  )
}

async function abrirNovaPessoa(nome: string) {
  fireEvent.click(await screen.findByText('PESSOAS'))
  fireEvent.click(await screen.findByText('+ Nova Pessoa'))
  const dialog = await screen.findByRole('dialog', { name: 'Adicionar Pessoa' })
  fireEvent.change(within(dialog).getByLabelText('Nome'), { target: { value: nome } })
  return dialog
}

describe('imagem no card de PESSOAS (issue #200)', () => {
  it('upload de File no form da pessoa NOVA → card mostra a imagem (blob:) e ImgId persiste no FM', async () => {
    const id = createLocalEntity('Heroi', 'Meu Herói', emptyHeroFrontmatter())
    const { container } = renderAnotacoes(id)
    const dialog = await abrirNovaPessoa('Zeca do Bar')

    // sobe a imagem pelo campo IMAGEM do form → preview aparece no modal
    fireEvent.change(within(dialog).getByLabelText(/🖼 Imagem/), {
      target: { files: [fakePng()] },
    })
    await waitFor(() => expect(within(dialog).getByAltText('Imagem da pessoa')).toBeTruthy())

    fireEvent.click(within(dialog).getByText('Adicionar'))
    await waitFor(() => expect(screen.getByText('Zeca do Bar')).toBeTruthy())
    // card com o retrato blob: (imagem própria, resolvida via ImgId)
    await waitFor(() => expect(blobImg(container)).toBeTruthy())

    // a linha no FM carrega só a REFERÊNCIA (ImgId), nunca o blob
    const fm = getLocalDoc(id)!.frontmatter as Record<string, unknown>
    const pessoas = fm['Pessoas'] as Array<Record<string, unknown>>
    expect(typeof pessoas[0]['ImgId']).toBe('string')
  })

  it('pessoa com Alvo existente mostra o retrato DO ALVO; form de alvo não oferece upload', async () => {
    const id = createLocalEntity('Heroi', 'Meu Herói', emptyHeroFrontmatter())
    const alvoId = createLocalEntity('Heroi', 'Aliado da Foto', emptyHeroFrontmatter())
    // o alvo tem retrato próprio subido na ficha dele (store local-first)
    await saveEntityImage(alvoId, fakePng())

    const { container } = renderAnotacoes(id)
    fireEvent.click(await screen.findByText('PESSOAS'))
    fireEvent.click(await screen.findByText('+ Existente'))
    const sel = (await screen.findByLabelText('Personagem existente')) as HTMLSelectElement
    const opt = [...sel.options].find((o) => o.textContent === 'Aliado da Foto')!
    fireEvent.change(sel, { target: { value: opt.value } })
    fireEvent.click(screen.getByText('Continuar →'))

    // linha com Alvo usa o retrato do alvo — o form NÃO tem campo de imagem
    const dialog = await screen.findByRole('dialog', { name: 'Adicionar Pessoa' })
    expect(within(dialog).queryByText(/🖼 Imagem/)).toBeNull()
    fireEvent.click(within(dialog).getByText('Adicionar'))

    await waitFor(() => expect(screen.getByText('CONHECIDO')).toBeTruthy())
    await waitFor(() => expect(blobImg(container)).toBeTruthy())
  })

  it('pessoa sem imagem cai no fallback de iniciais', async () => {
    const id = createLocalEntity('Heroi', 'Meu Herói', emptyHeroFrontmatter())
    const { container } = renderAnotacoes(id)
    const dialog = await abrirNovaPessoa('Zeca do Bar')
    fireEvent.click(within(dialog).getByText('Adicionar'))

    await waitFor(() => expect(screen.getByText('Zeca do Bar')).toBeTruthy())
    // iniciais no slot do retrato (initials: "Zeca do Bar" → "ZB"), sem blob:
    expect(screen.getByText('ZB')).toBeTruthy()
    expect(blobImg(container)).toBeNull()
  })

  it('editar pessoa avulsa remove a imagem → card volta às iniciais', async () => {
    const id = createLocalEntity('Heroi', 'Meu Herói', emptyHeroFrontmatter())
    const { container } = renderAnotacoes(id)
    const dialog = await abrirNovaPessoa('Zeca do Bar')
    fireEvent.change(within(dialog).getByLabelText(/🖼 Imagem/), {
      target: { files: [fakePng()] },
    })
    fireEvent.click(within(dialog).getByText('Adicionar'))
    await waitFor(() => expect(blobImg(container)).toBeTruthy())

    // editar → preview da imagem salva + ✕ Remover
    fireEvent.click(screen.getByLabelText('Editar Zeca do Bar'))
    const edit = await screen.findByRole('dialog', { name: 'Adicionar Pessoa' })
    await waitFor(() => expect(within(edit).getByAltText('Imagem da pessoa')).toBeTruthy())
    fireEvent.click(within(edit).getByText('✕ Remover'))
    expect(within(edit).queryByAltText('Imagem da pessoa')).toBeNull()
    fireEvent.click(within(edit).getByText('Adicionar'))

    // card volta às iniciais; a referência sai do FM
    await waitFor(() => expect(blobImg(container)).toBeNull())
    expect(screen.getByText('ZB')).toBeTruthy()
    const fm = getLocalDoc(id)!.frontmatter as Record<string, unknown>
    const pessoas = fm['Pessoas'] as Array<Record<string, unknown>>
    expect(pessoas[0]['ImgId']).toBeUndefined()
  })
})
