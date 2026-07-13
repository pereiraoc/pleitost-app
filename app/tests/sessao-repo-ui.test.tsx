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
    expect(screen.getAllByText('Jogadora Ana').length).toBeGreaterThan(0)

    // #187: a FICHA DO GRUPO da sessão montou sozinha (tabela nos DETALHES)
    fireEvent.click(screen.getByText('DETALHES DA SESSÃO'))
    await waitFor(() => expect(screen.getByText('// FICHA DO GRUPO DA SESSÃO')).toBeTruthy())
    expect(screen.getByText('7/12')).toBeTruthy() // vida atual/máx na tabela
  })
})

// ── #188: GM abre a ficha COMPLETA readonly do jogador ────────────────────
import { Route, Routes } from 'react-router-dom'
import { SessaoFichaPage } from '../src/components/sessao/SessaoFichaPage'
import { setLiveSession as setLive } from '../src/data/session-repo/live-session'
import { buildCharacterState, buildCharacterSummary, extractFmBlob } from '../src/data/session-repo/publish'
import { getLocalDoc } from '../src/data/local-entities'

describe('#188 ficha completa readonly (GM)', () => {
  it('abre as abas da ficha do fmBlob; digitar NÃO altera nada (choke point no-op)', async () => {
    const heroiId = createLocalEntity('Heroi', 'Aventureira Nia', {
      ...emptyHeroFrontmatter(),
      Classe: '[[Bardo]]',
      Vida: { Vitalidade: 12, Moral: 18 },
    })
    const doc = getLocalDoc(heroiId)!
    const fmBlob = extractFmBlob(doc.frontmatter as Record<string, unknown>)
    setLive({
      sessionId: 'sess_x',
      gmUserId: 'gm-1',
      members: [],
      encounters: [],
      characters: [
        {
          id: 'char_ro',
          sessionId: 'sess_x',
          memberId: 'p-1',
          kind: 'heroi',
          tutorCharacterId: null,
          characterPath: heroiId,
          visibility: 'visible',
          summary: buildCharacterSummary(doc),
          state: buildCharacterState(doc),
          fmBlob,
          updatedAt: new Date().toISOString(),
        },
      ],
    })
    render(
      <CatalogProvider catalog={catalog}>
        <SessionRepoProvider repo={new InMemorySessionRepo()} user={{ id: 'gm-1', nome: 'Mestre' }}>
          <DetailProvider>
            <MemoryRouter initialEntries={['/sessao-ficha/char_ro']}>
              <Routes>
                <Route path="/sessao-ficha/:charId" element={<SessaoFichaPage />} />
              </Routes>
            </MemoryRouter>
          </DetailProvider>
        </SessionRepoProvider>
      </CatalogProvider>,
    )
    // banner + perfil do fmBlob na tela
    expect(await screen.findByText('👁️ FICHA DE JOGADOR — SOMENTE LEITURA')).toBeTruthy()
    const nome = (await screen.findAllByDisplayValue('Aventureira Nia'))[0] as HTMLInputElement
    // READONLY de verdade: digitar não muda o valor (setters são no-op)
    fireEvent.change(nome, { target: { value: 'Hackeada' } })
    expect(nome.value).toBe('Aventureira Nia')
    // aba COMBATE renderiza do mesmo doc sintético
    fireEvent.click(screen.getByRole('button', { name: 'COMBATE' }))
    expect(await screen.findByText('VITALIDADE')).toBeTruthy()
    setLive(null)
  })
})

// ── #196: combate da sala — máscara, estimativa, turnos ───────────────────
describe('#196 iniciativa remota (encounters)', () => {
  it('GM inicia combate com roster → player vê nome MASCARADO + faixa; reveal mostra o nome; turnos avançam', async () => {
    const repo = new InMemorySessionRepo()
    // GM cria a sessão e um encounter PREPARADO com 2 goblins genéricos +
    // 1 monstro real do bestiário
    renderCliente(repo, { id: 'gm-1', nome: 'Mestre' })
    fireEvent.click(await screen.findByText('+ Criar nova sessão'))
    await screen.findByText('🌐 JOGADORES NA SESSÃO')
    const remoteId = (await repo.findSessionByCode(listSessions()[0].codigo))!.id
    await act(async () => {
      await repo.insertEncounter({
        sessionId: remoteId,
        sourceNotePath: 'Campanhas/Combates/Teste',
        name: 'Emboscada',
        roster: {
          entries: [{ sourcePath: 'Sistema/Criaturas/Bestiário/Goblin Batedor', label: 'Goblin Batedor', qty: 2 }],
        },
        difficulty: null,
      })
    })
    // GM vê o preparado e INICIA
    fireEvent.click(await screen.findByText('▶ INICIAR'))
    await waitFor(() => expect(screen.getByText(/Turno 1/)).toBeTruthy())
    // GM vê nome real + números + faixa
    expect(screen.getAllByText('Goblin Batedor').length).toBeGreaterThan(0)
    // PRÓXIMO avança e dá a volta → Turno 2 (2 NPCs na ordem)
    fireEvent.click(screen.getByText('PRÓXIMO ▶'))
    fireEvent.click(screen.getByText('PRÓXIMO ▶'))
    await waitFor(() => expect(screen.getByText(/Turno 2/)).toBeTruthy())
    cleanup()

    // ── PLAYER entra: nomes MASCARADOS pela Raça ("Goblin 1/2"), faixa sem números
    __resetSessionStoreForTests()
    renderCliente(repo, { id: 'p-1', nome: 'Ana' })
    fireEvent.change(await screen.findByPlaceholderText('Código da sessão'), {
      target: { value: (await repo.findSessionById(remoteId))!.code },
    })
    fireEvent.click(screen.getByText('Entrar →'))
    await waitFor(() => expect(screen.getByText(/⚔ COMBATE DA SESSÃO/)).toBeTruthy())
    expect(screen.queryByText('Goblin Batedor')).toBeNull() // nome real oculto
    // rótulo genérico numerado pela RAÇA do FM real ("Goblin (Pequeno) 1/2")
    expect(screen.getByText(/Goblin \(Pequeno\) 1/)).toBeTruthy()
    expect(screen.getByText(/Goblin \(Pequeno\) 2/)).toBeTruthy()
    // estimativa por faixa, sem números de vida do NPC
    expect(screen.getAllByText(/Impecável|Saudável|Ferido/).length).toBeGreaterThan(0)
    // player NÃO tem controles de GM
    expect(screen.queryByText('PRÓXIMO ▶')).toBeNull()
    cleanup()

    // ── GM revela o primeiro NPC → player passa a ver o nome real
    __resetSessionStoreForTests()
    renderCliente(repo, { id: 'gm-1', nome: 'Mestre' })
    fireEvent.change(await screen.findByPlaceholderText('Código da sessão'), {
      target: { value: (await repo.findSessionById(remoteId))!.code },
    })
    fireEvent.click(screen.getByText('Entrar →'))
    await waitFor(() => expect(screen.getAllByTitle('Revelar identidade aos players').length).toBeGreaterThan(0))
    fireEvent.click(screen.getAllByTitle('Revelar identidade aos players')[0])
    cleanup()
    __resetSessionStoreForTests()
    renderCliente(repo, { id: 'p-1', nome: 'Ana' })
    fireEvent.change(await screen.findByPlaceholderText('Código da sessão'), {
      target: { value: (await repo.findSessionById(remoteId))!.code },
    })
    fireEvent.click(screen.getByText('Entrar →'))
    await waitFor(() => expect(screen.getAllByText('Goblin Batedor').length).toBe(1)) // 1 revelado, 1 mascarado
  })
})
