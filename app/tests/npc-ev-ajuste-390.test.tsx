// @vitest-environment jsdom
// #390 — "não há local para reduzir o EV das criaturas na iniciativa": o GM
// agora tem steppers (−5 −1 +1 +5) na linha do NPC do combate da sala, que
// gravam recursosRestantes.vitalidade via repo.updateCharacterState (clamp
// [0, max]). Jogador não vê os steppers (NPC pra ele é só a tag de estimativa).
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
  window.localStorage.setItem('pleitost.settings.mestre', 'true')
})
afterEach(cleanup)

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

describe('#390 — GM reduz o EV do NPC na iniciativa', () => {
  it('steppers −5/−1/+1/+5 gravam recursosRestantes.vitalidade com clamp [0, max]', async () => {
    const repo = new InMemorySessionRepo()
    renderCliente(repo, { id: 'gm-1', nome: 'Mestre' })
    fireEvent.click(await screen.findByText('+ Criar'))
    await screen.findByText('⚔ COMBATE')
    await adicionarAIniciativa('Goblin Batedor')
    await waitFor(() => expect(screen.getAllByText(/Turno 1/).length).toBeGreaterThanOrEqual(1))

    const remoteId = (await repo.findSessionByCode(listSessions()[0].codigo))!.id
    const npcId = (await repo.findCharactersBySession(remoteId)).find((c) => c.kind === 'npc')!.id

    // linha do NPC no combate da sala (GM vê ❤️ vit/max ao vivo)
    const vida = () => screen.getByText(new RegExp(`❤️ \\d+/${goblinVit}`))
    await waitFor(() => expect(vida()).toBeTruthy())
    const row = vida().closest('div[style]')!.parentElement!.parentElement as HTMLElement

    fireEvent.click(within(row).getByLabelText('−1 EV'))
    await waitFor(async () => {
      const npc = (await repo.findCharactersBySession(remoteId)).find((c) => c.id === npcId)!
      expect(npc.state.recursosRestantes.vitalidade).toBe(goblinVit - 1)
    })

    fireEvent.click(within(row).getByLabelText('−5 EV'))
    await waitFor(async () => {
      const npc = (await repo.findCharactersBySession(remoteId)).find((c) => c.id === npcId)!
      expect(npc.state.recursosRestantes.vitalidade).toBe(goblinVit - 6)
    })

    // clamp inferior: desce até 0 e não passa
    for (let i = 0; i < 30; i++) fireEvent.click(within(row).getByLabelText('−5 EV'))
    await waitFor(async () => {
      const npc = (await repo.findCharactersBySession(remoteId)).find((c) => c.id === npcId)!
      expect(npc.state.recursosRestantes.vitalidade).toBe(0)
    })

    // clamp superior: +5 repetido não passa do máximo
    for (let i = 0; i < 30; i++) fireEvent.click(within(row).getByLabelText('+5 EV'))
    await waitFor(async () => {
      const npc = (await repo.findCharactersBySession(remoteId)).find((c) => c.id === npcId)!
      expect(npc.state.recursosRestantes.vitalidade).toBe(goblinVit)
    })

    // a linha reflete ao vivo o valor gravado
    fireEvent.click(within(row).getByLabelText('+1 EV')) // já no max — segue clamped
    await waitFor(() => expect(screen.getByText(new RegExp(`❤️ ${goblinVit}/${goblinVit}`))).toBeTruthy())
  }, 40000)

  it('JOGADOR não vê steppers de EV no NPC (só a tag de estimativa)', async () => {
    const repo = new InMemorySessionRepo()
    renderCliente(repo, { id: 'gm-1', nome: 'Mestre' })
    fireEvent.click(await screen.findByText('+ Criar'))
    await screen.findByText('⚔ COMBATE')
    const codigo = listSessions()[0].codigo
    await adicionarAIniciativa('Goblin Batedor')
    await waitFor(() => expect(screen.getAllByText(/Turno 1/).length).toBeGreaterThanOrEqual(1))
    cleanup()

    __resetSessionStoreForTests()
    setLiveSession(null)
    renderCliente(repo, { id: 'p-1', nome: 'Ana' })
    fireEvent.change(await screen.findByPlaceholderText('Código da sessão'), { target: { value: codigo } })
    fireEvent.click(screen.getByText('Entrar →'))
    await waitFor(() => expect(screen.getByText('⚔ COMBATE')).toBeTruthy())
    expect(screen.queryByLabelText('−1 EV')).toBeNull()
    expect(screen.queryByLabelText('−5 EV')).toBeNull()
  }, 40000)
})
