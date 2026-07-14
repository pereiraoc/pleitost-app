// @vitest-environment jsdom
// #229 (b): "não consigo adicionar criaturas a iniciativa da sessao" — o
// fluxo existente exigia montar um COMBATE no Criador (#194) e iniciá-lo pela
// sala (#196); o mestre não achou. Caminho DIRETO: no card do BESTIÁRIO
// (Modo Mestre ON, sessão remota ativa) o menu ⋮ ganha "Adicionar à
// iniciativa" — com combate ativo o monstro entra NELE (insertCharacter kind
// 'npc' + append no turnState.order); sem combate ativo, um combate é criado
// com o monstro e INICIADO (mesmo código do CombateDaSala.iniciar, extraído
// pra encounter-actions.ts). O jogador vê o NPC mascarado, como no #196.
import { beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { DetailProvider } from '../src/data/detail-context'
import { SessionRepoProvider } from '../src/data/session-repo/provider'
import { InMemorySessionRepo } from '../src/data/session-repo/in-memory'
import { RightSidebar } from '../src/components/layout/RightSidebar'
import { NpcsPage } from '../src/components/creatures/CreaturesPages'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import { __resetLocalStoreForTests } from '../src/data/local-entities'
import { __resetSessionStoreForTests, listSessions } from '../src/data/session-store'
import { setLiveSession } from '../src/data/session-repo/live-session'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
const catalog = buildCatalog(manifest)

const GOBLIN_ID = 'Sistema/Criaturas/Bestiário/Goblin Batedor'
const goblin = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, `${GOBLIN_ID}.json`), 'utf8'),
) as VaultDoc
const goblinVit = Number((goblin.frontmatter as Record<string, any>).Vida.Vitalidade)

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
  // BESTIÁRIO e o caminho direto são do Modo Mestre (issue #35)
  window.localStorage.setItem('pleitost.settings.mestre', 'true')
})
afterEach(cleanup)

/** Cliente = página CRIATURAS + sidebar da SESSÃO no mesmo render (o layout
 *  real do app: a sala vive na sidebar enquanto o mestre navega no bestiário). */
function renderCliente(repo: InMemorySessionRepo, user: { id: string; nome: string }) {
  return render(
    <CatalogProvider catalog={catalog}>
      <SessionRepoProvider repo={repo} user={user}>
        <DetailProvider>
          <MemoryRouter initialEntries={['/npcs']}>
            <Routes>
              <Route path="/npcs" element={<NpcsPage />} />
            </Routes>
            <RightSidebar drawerOpen onCloseDrawer={() => {}} />
          </MemoryRouter>
        </DetailProvider>
      </SessionRepoProvider>
    </CatalogProvider>,
  )
}

/** Card do monstro na aba BESTIÁRIO (o CriadorCombate tem <option> com o
 *  mesmo texto — o card é o .npc-nome). */
async function cardDoMonstro(nome: string): Promise<HTMLElement> {
  const el = await waitFor(() => {
    const hit = screen.getAllByText(nome).find((e) => e.classList.contains('npc-nome'))
    expect(hit).toBeTruthy()
    return hit!
  })
  return el.closest('.npc-card') as HTMLElement
}

async function adicionarAIniciativa(nome: string) {
  fireEvent.click(screen.getByRole('button', { name: 'BESTIÁRIO' }))
  const card = await cardDoMonstro(nome)
  fireEvent.click(within(card).getByLabelText('Ações da criatura'))
  fireEvent.click(await screen.findByText('⚔️ Adicionar à iniciativa'))
}

describe('#229 (b): adicionar monstro do bestiário à iniciativa da sessão', () => {
  it('sem combate ativo: cria um combate com o monstro e INICIA (Turno 1, NPC na ordem)', async () => {
    const repo = new InMemorySessionRepo()
    renderCliente(repo, { id: 'gm-1', nome: 'Mestre' })
    fireEvent.click(await screen.findByText('+ Criar nova sessão'))
    await screen.findByText('⚔ COMBATE') // #238: GM vê o painel de controle sempre

    await adicionarAIniciativa('Goblin Batedor')

    // combate da sala ATIVO com o NPC na ordem (GM vê nome real + números);
    // "Turno 1" também existe na iniciativa local — basta 2+ ocorrências
    await waitFor(() => expect(screen.getByText('⚔ COMBATE')).toBeTruthy())
    await waitFor(() => expect(screen.getAllByText(/Turno 1/).length).toBeGreaterThanOrEqual(1))
    expect(
      screen.getAllByText('Goblin Batedor').some((e) => e.closest('.npc-card') === null),
    ).toBe(true)
    expect(screen.getByText(new RegExp(`❤️ ${goblinVit}/${goblinVit}`))).toBeTruthy()

    // estado remoto: encounter ativo + NPC com summary/state do doc REAL
    const remoteId = (await repo.findSessionByCode(listSessions()[0].codigo))!.id
    const encs = await repo.listEncountersBySession(remoteId)
    const ativo = encs.find((e) => e.status === 'active')!
    expect(ativo).toBeTruthy()
    const chars = await repo.findCharactersBySession(remoteId)
    const npc = chars.find((c) => c.kind === 'npc')!
    expect(npc.summary.nome).toBe('Goblin Batedor')
    expect(npc.summary.vitalidadeMax).toBe(goblinVit)
    expect(npc.state.recursosRestantes.vitalidade).toBe(goblinVit)
    expect(ativo.turnState?.order).toContain(npc.id)
  })

  it('com combate ativo: o monstro entra NELE e vai pro fim da ordem; o jogador o vê MASCARADO', async () => {
    const repo = new InMemorySessionRepo()
    renderCliente(repo, { id: 'gm-1', nome: 'Mestre' })
    fireEvent.click(await screen.findByText('+ Criar nova sessão'))
    await screen.findByText('⚔ COMBATE') // #238: GM vê o painel de controle sempre
    const codigo = listSessions()[0].codigo

    // primeiro monstro cria+inicia o combate…
    await adicionarAIniciativa('Goblin Batedor')
    await waitFor(() => expect(screen.getByText('⚔ COMBATE')).toBeTruthy())
    // …o segundo entra no MESMO combate ativo (append na ordem)
    await adicionarAIniciativa('Goblin Guerreiro')
    await waitFor(() =>
      expect(screen.getAllByText('Goblin Guerreiro').some((e) => e.closest('.npc-card') === null)).toBe(true),
    )

    const remoteId = (await repo.findSessionByCode(codigo))!.id
    const encs = await repo.listEncountersBySession(remoteId)
    expect(encs.filter((e) => e.status === 'active').length).toBe(1)
    const ativo = encs.find((e) => e.status === 'active')!
    const chars = await repo.findCharactersBySession(remoteId)
    const npcs = chars.filter((c) => c.kind === 'npc')
    expect(npcs.length).toBe(2)
    // append: o segundo NPC é o último da ordem
    const segundo = npcs.find((c) => c.summary.nome === 'Goblin Guerreiro')!
    expect(ativo.turnState?.order.at(-1)).toBe(segundo.id)
    cleanup()

    // ── JOGADOR entra na sala: NPCs não-revelados aparecem MASCARADOS pela
    // Raça, sem números de vida (semântica do #196 intacta)
    __resetSessionStoreForTests()
    setLiveSession(null)
    renderCliente(repo, { id: 'p-1', nome: 'Ana' })
    fireEvent.change(await screen.findByPlaceholderText('Código da sessão'), { target: { value: codigo } })
    fireEvent.click(screen.getByText('Entrar →'))
    await waitFor(() => expect(screen.getByText('⚔ COMBATE')).toBeTruthy())
    // nomes reais ocultos DENTRO do combate da sala (a página CRIATURAS do
    // próprio jogador segue listando o bestiário — não conta)
    const combate = screen.getByText('⚔ COMBATE').parentElement!
      .parentElement as HTMLElement
    expect(within(combate).queryByText('Goblin Batedor')).toBeNull()
    expect(within(combate).queryByText('Goblin Guerreiro')).toBeNull()
    expect(within(combate).getByText(/Goblin \(Pequeno\) 1/)).toBeTruthy()
    expect(within(combate).getByText(/Goblin \(Pequeno\) 2/)).toBeTruthy()
  })

  it('sem sessão remota ativa o menu ⋮ do monstro da vault não oferece iniciativa', async () => {
    render(
      <CatalogProvider catalog={catalog}>
        <SessionRepoProvider repo={null} user={null}>
          <DetailProvider>
            <MemoryRouter initialEntries={['/npcs']}>
              <Routes>
                <Route path="/npcs" element={<NpcsPage />} />
              </Routes>
            </MemoryRouter>
          </DetailProvider>
        </SessionRepoProvider>
      </CatalogProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'BESTIÁRIO' }))
    const card = await cardDoMonstro('Goblin Batedor')
    // sem sala: monstro da vault segue sem menu (nada de item morto)
    expect(within(card).queryByLabelText('Ações da criatura')).toBeNull()
    expect(screen.queryByText('⚔️ Adicionar à iniciativa')).toBeNull()
  })
})
