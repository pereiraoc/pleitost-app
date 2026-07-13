// @vitest-environment jsdom
// #186 (Trilha S): sessão REMOTA de ponta a ponta com InMemorySessionRepo —
// dois "clientes" (renders com usuários fake distintos) na MESMA sala:
// GM cria pela tela → player entra por código → seleciona herói local e
// publica (summary/state/fmBlob) → o GM VÊ o jogador com a vida na tela →
// vida muda no player (write local Interativa.*) → GM vê o número mudar →
// clique no nome abre a ficha RESUMO remota nos DETALHES.
import { beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { DetailProvider } from '../src/data/detail-context'
import { SessionRepoProvider } from '../src/data/session-repo/provider'
import { InMemorySessionRepo } from '../src/data/session-repo/in-memory'
import { RightSidebar } from '../src/components/layout/RightSidebar'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import {
  __resetLocalStoreForTests,
  createLocalEntity,
  emptyHeroFrontmatter,
  setLocalEntityFm,
} from '../src/data/local-entities'
import { __resetSessionStoreForTests, listSessions } from '../src/data/session-store'
import { setLiveSession } from '../src/data/session-repo/live-session'
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
  __resetSessionStoreForTests()
  setLiveSession(null)
})
afterEach(cleanup)

function renderCliente(repo: InMemorySessionRepo, user: { id: string; nome: string }) {
  return render(
    <CatalogProvider catalog={catalog}>
      <SessionRepoProvider repo={repo} user={user}>
        <DetailProvider>
          <MemoryRouter>
            {/* a Sessão VIVE na face SESSÃO do painel direito (cenário real);
                o clique no resumo troca pra face DETALHES sozinho */}
            <RightSidebar drawerOpen onCloseDrawer={() => {}} />
          </MemoryRouter>
        </DetailProvider>
      </SessionRepoProvider>
    </CatalogProvider>,
  )
}

describe('#186 sessão remota (InMemory, 2 clientes)', () => {
  it('GM cria sem grupo → player entra por código, publica herói, vida flui, resumo abre', async () => {
    const repo = new InMemorySessionRepo()

    // ── cliente GM cria a sessão pela tela (sem grupo — req 8)
    renderCliente(repo, { id: 'gm-1', nome: 'Mestre Octavio' })
    fireEvent.click(await screen.findByText('+ Criar nova sessão'))
    await screen.findByText('⚔ ORDEM DE INICIATIVA')
    const codigo = listSessions()[0].codigo
    expect(listSessions()[0].remoteId).toBeTruthy()
    // sala remota visível pro GM
    expect(await screen.findByText('🌐 JOGADORES NA SESSÃO')).toBeTruthy()
    cleanup()

    // ── cliente PLAYER (outro user, mesmo repo = mesma sala)
    __resetSessionStoreForTests() // "outro navegador": lista local vazia
    const heroiId = createLocalEntity('Heroi', 'Aventureira Nia', {
      ...emptyHeroFrontmatter(),
      Classe: '[[Bardo]]',
      Vida: { Vitalidade: 12, Moral: 18 },
    })
    renderCliente(repo, { id: 'p-1', nome: 'Jogadora Ana' })
    fireEvent.change(await screen.findByPlaceholderText('Código da sessão'), { target: { value: codigo } })
    fireEvent.click(screen.getByText('Entrar →'))
    await screen.findByText('🌐 JOGADORES NA SESSÃO')

    // seleciona o herói local e entra na mesa (publica summary/state/fmBlob)
    const sel = (await screen.findByLabelText('Selecionar meu personagem')) as HTMLSelectElement
    fireEvent.change(sel, { target: { value: heroiId } })
    fireEvent.click(screen.getByText('Entrar na mesa →'))
    await waitFor(() => expect(screen.getByText('Aventureira Nia')).toBeTruthy())
    // vida na TELA (12/12 do FM local publicado)
    await waitFor(() => expect(screen.getByText(/❤️ 12\/12/)).toBeTruthy())

    // vida muda LOCAL (caminho REAL do herói local: setLocalEntityFm, como a
    // ficha faz via model.setVolatile) → sala recebe (updateCharacterState)
    await act(async () => {
      setLocalEntityFm(heroiId, 'Interativa.Recursos_Restantes.Vitalidade', 7)
    })
    await waitFor(() => expect(screen.getByText(/❤️ 7\/12/)).toBeTruthy())

    // clique no nome → ficha RESUMO remota nos DETALHES
    fireEvent.click(screen.getByRole('button', { name: 'Aventureira Nia' }))
    await waitFor(() => {
      expect(screen.getByText('// VIDA')).toBeTruthy()
      expect(screen.getByText(/❤️ 7\/12 · 💙 18\/18/)).toBeTruthy()
    })
    cleanup()

    // ── GM reabre e VÊ a jogadora com a vida atualizada
    __resetSessionStoreForTests()
    renderCliente(repo, { id: 'gm-1', nome: 'Mestre Octavio' })
    fireEvent.change(await screen.findByPlaceholderText('Código da sessão'), { target: { value: codigo } })
    fireEvent.click(screen.getByText('Entrar →'))
    await waitFor(() => expect(screen.getByText('Aventureira Nia')).toBeTruthy())
    expect(screen.getByText(/❤️ 7\/12/)).toBeTruthy()
    expect(screen.getByText('Jogadora Ana')).toBeTruthy()

    // #187: a FICHA DO GRUPO da sessão montou sozinha (tabela nos DETALHES)
    fireEvent.click(screen.getByText('DETALHES DA SESSÃO'))
    await waitFor(() => expect(screen.getByText('// FICHA DO GRUPO DA SESSÃO')).toBeTruthy())
    expect(screen.getByText('7/12')).toBeTruthy() // vida atual/máx na tabela
  })
})
