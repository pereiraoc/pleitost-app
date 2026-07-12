// @vitest-environment jsdom
// IMAGEM LOCAL (issue #197): o jogador SOBE um retrato pro herói/companheiro/
// grupo criado no app — vai pro IndexedDB (`pleitost-images`, key = entityId)
// e tem PRECEDÊNCIA sobre a hierarquia da vault na hora de renderizar. Este
// teste cobre o fluxo real na tela: upload pelo botão "🖼 Imagem" da ficha →
// retrato vira blob URL; sobrevive a remontagem (persistência além do estado
// do componente = o "reload" possível em jsdom); remover volta ao fallback.
// Entidade da VAULT (read-only) NUNCA mostra o botão de upload.
//
// fake-indexeddb: caminho padrão pra IndexedDB em jsdom (que não implementa);
// um IDBFactory NOVO por teste + __resetImagesStoreForTests isolam os casos.
// URL.createObjectURL também não existe em jsdom — stub determinístico.
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { PerfilTab } from '../src/components/ficha/PerfilTab'
import { GrupoView } from '../src/grupo/GrupoView'
import { __resetImagesStoreForTests } from '../src/data/images'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import {
  createLocalEntity,
  emptyCompanheiroFrontmatter,
  emptyGroupFrontmatter,
  emptyHeroFrontmatter,
  getLocalDoc,
  __resetLocalStoreForTests,
} from '../src/data/local-entities'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

// Herói REAL da vault pro caso negativo (vault não tem upload).
const DEODORO_ID = 'Sistema/Criaturas/Heróis/Ex-Tenente Deodoro Fontesseca'
const deodoro = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, `${DEODORO_ID}.json`), 'utf8'),
) as VaultDoc

/** Shim de localStorage (mesmo do animista-local-e2e): o jsdom daqui não expõe
 *  window.localStorage e o store local de entidades escreve nele. */
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
  // jsdom não implementa object URLs — stub determinístico (o hook só precisa
  // de uma string blob: estável por chamada + revoke sem crash).
  let seq = 0
  URL.createObjectURL = () => `blob:fake-${seq++}`
  URL.revokeObjectURL = () => undefined
})

beforeEach(() => {
  // IndexedDB ZERADO por caso (factory novo) + conexão cacheada derrubada.
  globalThis.indexedDB = new IDBFactory()
  __resetImagesStoreForTests()
  window.localStorage.clear()
  __resetLocalStoreForTests()
  __resetHeroStoreMemoryForTests()
})
afterEach(cleanup)

/** PNG mínimo fake — o store guarda o blob como veio do input, sem validar
 *  conteúdo, então bastam a assinatura e o MIME. */
const fakePng = () =>
  new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'retrato.png', { type: 'image/png' })

const blobImg = (container: HTMLElement) =>
  container.querySelector<HTMLImageElement>('img[src^="blob:"]')

const renderPerfil = (doc: VaultDoc) =>
  render(
    <CatalogProvider catalog={catalog}>
      <PerfilTab doc={doc} />
    </CatalogProvider>,
  )

describe('retrato local (issue #197) — herói/CA na ficha', () => {
  it('upload no herói LOCAL → retrato blob:; persiste à remontagem; remover volta ao fallback', async () => {
    const id = createLocalEntity('Heroi', 'Aventureira da Foto', emptyHeroFrontmatter())
    const first = renderPerfil(getLocalDoc(id)!)

    // Sem imagem subida: retrato é o fallback (nenhum blob:), e não há "remover".
    expect(blobImg(first.container)).toBeNull()
    expect(screen.queryByText('✕ Remover')).toBeNull()

    // "Sobe" a imagem pelo input escondido do botão 🖼 Imagem.
    fireEvent.change(screen.getByLabelText(/🖼 Imagem/), { target: { files: [fakePng()] } })
    await waitFor(() => expect(blobImg(first.container)).toBeTruthy())
    expect(screen.getByText('✕ Remover')).toBeTruthy()

    // Persistência (IndexedDB, não estado do componente): remonta a ficha do
    // zero — o "reload" possível em jsdom — e o retrato continua lá.
    cleanup()
    const second = renderPerfil(getLocalDoc(id)!)
    await waitFor(() => expect(blobImg(second.container)).toBeTruthy())

    // Remover → retrato volta ao fallback e o botão de remover some.
    fireEvent.click(screen.getByText('✕ Remover'))
    await waitFor(() => expect(blobImg(second.container)).toBeNull())
    expect(screen.queryByText('✕ Remover')).toBeNull()
  })

  it('companheiro animal LOCAL tem o mesmo upload (mesma ficha de Perfil)', async () => {
    const id = createLocalEntity(
      'CompanheiroAnimal',
      'Falcão da Foto',
      emptyCompanheiroFrontmatter('Falcão da Foto'),
    )
    const { container } = renderPerfil(getLocalDoc(id)!)
    fireEvent.change(screen.getByLabelText(/🖼 Imagem/), { target: { files: [fakePng()] } })
    await waitFor(() => expect(blobImg(container)).toBeTruthy())
  })

  it('herói da VAULT (read-only) NÃO mostra o botão de upload', async () => {
    renderPerfil(deodoro)
    // Espera a ficha assentar (nome real na tela) antes do negativo.
    expect((await screen.findAllByDisplayValue(deodoro.basename)).length).toBeGreaterThan(0)
    expect(screen.queryByText(/🖼 Imagem/)).toBeNull()
  })
})

describe('retrato local (issue #197) — grupo', () => {
  it('upload no grupo LOCAL → imagem blob: no slot do header (fallback ⚔️ antes)', async () => {
    const gid = createLocalEntity('Grupo', 'Bando da Foto', emptyGroupFrontmatter())
    const { container } = render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter>
          <GrupoView groupId={gid} />
        </MemoryRouter>
      </CatalogProvider>,
    )
    // Grupo local recém-criado: slot do header no fallback ⚔️ do design.
    expect(screen.getByText('⚔️')).toBeTruthy()
    expect(blobImg(container)).toBeNull()

    fireEvent.change(screen.getByLabelText(/🖼 Imagem/), { target: { files: [fakePng()] } })
    await waitFor(() => expect(blobImg(container)).toBeTruthy())
    expect(screen.queryByText('⚔️')).toBeNull()
  })

  it('grupo da VAULT não mostra o botão de upload', async () => {
    const GROUP_ID = 'Sistema/Criaturas/Grupos de Criaturas/Adriann, Carlos, Kenji, Zuko'
    render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter>
          <GrupoView groupId={GROUP_ID} />
        </MemoryRouter>
      </CatalogProvider>,
    )
    expect(await screen.findByText(/integrantes/)).toBeTruthy()
    expect(screen.queryByText(/🖼 Imagem/)).toBeNull()
  })
})
