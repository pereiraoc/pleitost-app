// @vitest-environment jsdom
// Batch 2 — "morto pula a vez": o GM marca um combatente MORTO pelo 💀 (marca
// explícita em turnState.mortos, paridade CombatantState.morto do tracker do
// plugin); a linha fica acinzentada com 💀 ao lado do nome e o PRÓXIMO o pula.
// EV 0 só SUGERE (destaca o botão) — não marca sozinho.
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
import { readDisguiseSecret } from '../src/data/session-repo/disguise-secrets'
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

/** Linha do combatente no combate da sala (o pai do pai do nome é o card da
 *  linha, que contém o ❤️ numérico — filtra o card do bestiário). */
function linhaDoCombatente(nome: string): HTMLElement {
  const row = screen
    .getAllByText(nome)
    .map((e) => e.parentElement?.parentElement as HTMLElement | null)
    .find((r) => r != null && within(r).queryByText(/❤️ \d+\//) != null)
  expect(row).toBeTruthy()
  return row!
}

describe('morto pula a vez', () => {
  it('GM marca morto → linha acinzentada + 💀, e PRÓXIMO pula; EV 0 só destaca o botão', async () => {
    const repo = new InMemorySessionRepo()
    renderCliente(repo, { id: 'gm-1', nome: 'Mestre' })
    fireEvent.click(await screen.findByText('+ Criar'))
    await screen.findByText('⚔ COMBATE')

    await adicionarAIniciativa('Goblin Batedor')
    await waitFor(() => expect(screen.getAllByText(/Turno 1/).length).toBeGreaterThanOrEqual(1))
    await adicionarAIniciativa('Goblin Guerreiro')
    await waitFor(() =>
      expect(screen.getAllByText('Goblin Guerreiro').some((e) => e.closest('.npc-card') === null)).toBe(true),
    )
    const remoteId = (await repo.findSessionByCode(listSessions()[0].codigo))!.id
    const npcs = (await repo.findCharactersBySession(remoteId)).filter((c) => c.kind === 'npc')
    const idDe = (nome: string) =>
      npcs.find((c) => readDisguiseSecret(remoteId, c.id)?.summary.nome === nome)!.id
    const batedor = idDe('Goblin Batedor')
    const guerreiro = idDe('Goblin Guerreiro')
    const encId = (await repo.listEncountersBySession(remoteId)).find((e) => e.status === 'active')!.id
    const tsAtual = async () => (await repo.listEncountersBySession(remoteId)).find((e) => e.id === encId)!.turnState!
    expect((await tsAtual()).order).toEqual([batedor, guerreiro])

    // vida cheia: o 💀 da linha 1 não aparece (só no modo editar)
    expect(within(linhaDoCombatente('Goblin Guerreiro')).queryByLabelText('Marcar como morto')).toBeNull()
    // EV → 0: sugere a morte (botão destacado na linha), mas NÃO marca
    const caixa = within(linhaDoCombatente('Goblin Guerreiro')).getByLabelText('Ajuste de EV (±X)')
    fireEvent.change(caixa, { target: { value: '-999' } })
    fireEvent.keyDown(caixa, { key: 'Enter' })
    const botao = await waitFor(() => {
      const b = within(linhaDoCombatente('Goblin Guerreiro')).getByLabelText('Marcar como morto')
      expect(b.getAttribute('data-sugere')).toBe('true')
      return b
    })
    expect((await tsAtual()).mortos ?? []).toEqual([])

    fireEvent.click(botao)
    await waitFor(async () => expect((await tsAtual()).mortos).toEqual([guerreiro]))
    const row = linhaDoCombatente('Goblin Guerreiro')
    expect(row.closest('[data-combatente-id]')!.getAttribute('data-morto')).toBe('true')
    expect((row.closest('[data-combatente-id]') as HTMLElement).style.opacity).toBe('0.45')
    // GM: o 💀 ao lado do nome é o próprio botão, pressionado (desmarca)
    expect(within(row).getByLabelText('Desmarcar morto').getAttribute('aria-pressed')).toBe('true')

    // PRÓXIMO a partir do Batedor pula o Guerreiro morto → volta ao Batedor na rodada 2
    fireEvent.click(screen.getByTitle('Próximo turno'))
    await waitFor(async () => {
      const ts = await tsAtual()
      expect([ts.currentIndex, ts.round]).toEqual([0, 2])
    })
    // ANTERIOR desfaz (inverso com o mesmo conjunto)
    fireEvent.click(screen.getByTitle('Turno anterior'))
    await waitFor(async () => {
      const ts = await tsAtual()
      expect([ts.currentIndex, ts.round]).toEqual([0, 1])
    })

    // desmarcar volta a jogar
    fireEvent.click(within(linhaDoCombatente('Goblin Guerreiro')).getByLabelText('Desmarcar morto'))
    await waitFor(async () => expect((await tsAtual()).mortos).toEqual([]))
    fireEvent.click(screen.getByTitle('Próximo turno'))
    await waitFor(async () => {
      const ts = await tsAtual()
      expect([ts.currentIndex, ts.round]).toEqual([1, 1])
    })
  }, 40000)
})
