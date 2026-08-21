// @vitest-environment jsdom
// Reports 2026-08-21 (#474/#475): na lista de HERÓIS o menu ⋯ ganha
//  • "Abrir Resumo" — ficha resumo no painel de detalhes (#475);
//  • "⚔️ Adicionar à iniciativa" (mestre em sessão) — o herói entra no combate
//    como INIMIGO (kind npc), mesmo fluxo do bestiário (#229/#474);
// e o "+ COMBATENTE" da sessão leva pro BESTIÁRIO (não mais pra aba default
// Pessoas do /npcs).
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { AppShell } from '../src/components/layout/AppShell'
import { HeroisPage, NpcsPage } from '../src/components/creatures/CreaturesPages'
import { RightSidebar } from '../src/components/layout/RightSidebar'
import { DetailProvider } from '../src/data/detail-context'
import {
  createLocalEntity,
  emptyHeroFrontmatter,
  __resetLocalStoreForTests,
} from '../src/data/local-entities'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import { __resetSessionStoreForTests } from '../src/data/session-store'
import { InMemorySessionRepo } from '../src/data/session-repo/in-memory'
import { SessionRepoProvider } from '../src/data/session-repo/provider'
import { setLiveSession, type LiveSession } from '../src/data/session-repo/live-session'
import { __resetSettingsForTests } from '../src/settings'
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
  __resetSessionStoreForTests()
  __resetSettingsForTests()
  setLiveSession(null)
})
afterEach(() => {
  cleanup()
  setLiveSession(null)
})

async function liveDe(repo: InMemorySessionRepo, sessionId: string): Promise<LiveSession> {
  return {
    sessionId,
    gmUserId: 'gm',
    state: null,
    characters: await repo.findCharactersBySession(sessionId),
    members: [],
    encounters: await repo.listEncountersBySession(sessionId),
  }
}

describe('#475 — ⋯ do herói: Abrir Resumo nos detalhes', () => {
  it('menu tem "Abrir Resumo" e clicar abre o resumo no painel direito', async () => {
    createLocalEntity('Heroi', 'Zé Resumível', emptyHeroFrontmatter())
    render(
      <CatalogProvider catalog={catalog}>
        <MemoryRouter initialEntries={['/herois']}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/herois" element={<HeroisPage />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </CatalogProvider>,
    )
    fireEvent.click(await screen.findByLabelText('Ações do herói'))
    fireEvent.click(await screen.findByText('📑 Abrir Resumo'))
    // resumo montou nos DETALHES: o nome aparece também no painel direito
    // (herói local recém-criado não tem seções preenchidas pra assertar)
    await waitFor(() => expect(screen.getAllByText('Zé Resumível').length).toBeGreaterThan(1))
  })
})

describe('#474 — herói entra na iniciativa como inimigo (mestre em sessão)', () => {
  it('mestre + sessão ativa: ⋯ tem "⚔️ Adicionar à iniciativa" e cria combate com NPC', async () => {
    window.localStorage.setItem('pleitost.settings.mestre', 'true')
    __resetSettingsForTests()
    createLocalEntity('Heroi', 'Vilão Reformado', emptyHeroFrontmatter())
    const repo = new InMemorySessionRepo()
    const sess = await repo.createSession({ name: 'Mesa', gmUserId: 'gm-1', code: 'H474' })
    setLiveSession(await liveDe(repo, sess.id))
    render(
      <CatalogProvider catalog={catalog}>
        <SessionRepoProvider repo={repo} user={{ id: 'gm-1', nome: 'Mestre' }}>
          <MemoryRouter initialEntries={['/herois']}>
            <Routes>
              <Route path="/herois" element={<HeroisPage />} />
            </Routes>
          </MemoryRouter>
        </SessionRepoProvider>
      </CatalogProvider>,
    )
    fireEvent.click(await screen.findByLabelText('Ações do herói'))
    fireEvent.click(await screen.findByText('⚔️ Adicionar à iniciativa'))
    // o herói vira combatente INIMIGO (kind npc) num combate ativo
    await waitFor(async () => {
      const chars = await repo.findCharactersBySession(sess.id)
      expect(chars.some((c) => c.kind === 'npc')).toBe(true)
    })
    const encs = await repo.listEncountersBySession(sess.id)
    expect(encs.some((e) => e.status === 'active')).toBe(true)
  })

  it('sem sessão ativa o menu do herói NÃO oferece iniciativa', async () => {
    window.localStorage.setItem('pleitost.settings.mestre', 'true')
    __resetSettingsForTests()
    createLocalEntity('Heroi', 'Zé Pacífico', emptyHeroFrontmatter())
    render(
      <CatalogProvider catalog={catalog}>
        <DetailProvider>
          <MemoryRouter initialEntries={['/herois']}>
            <Routes>
              <Route path="/herois" element={<HeroisPage />} />
            </Routes>
          </MemoryRouter>
        </DetailProvider>
      </CatalogProvider>,
    )
    fireEvent.click(await screen.findByLabelText('Ações do herói'))
    await screen.findByText('📑 Abrir Resumo')
    expect(screen.queryByText('⚔️ Adicionar à iniciativa')).toBeNull()
  })
})

function LocProbe() {
  const loc = useLocation()
  return <div>PROBE:{`${loc.pathname}${loc.search}`}</div>
}

describe('#474 — "+ COMBATENTE" leva pro BESTIÁRIO', () => {
  it('chip navega pra /npcs?tab=bestiario (não a aba default Pessoas)', async () => {
    window.localStorage.setItem('pleitost.settings.mestre', 'true')
    __resetSettingsForTests()
    const repo = new InMemorySessionRepo()
    render(
      <CatalogProvider catalog={catalog}>
        <SessionRepoProvider repo={repo} user={{ id: 'gm-1', nome: 'Mestre' }}>
          <DetailProvider>
            <MemoryRouter initialEntries={['/npcs']}>
              <LocProbe />
              <Routes>
                <Route path="/npcs" element={<NpcsPage />} />
              </Routes>
              <RightSidebar drawerOpen onCloseDrawer={() => {}} />
            </MemoryRouter>
          </DetailProvider>
        </SessionRepoProvider>
      </CatalogProvider>,
    )
    // GM cria a sala e sobe um combate ATIVO pelo caminho do bestiário (#229)
    fireEvent.click(await screen.findByText('+ Criar'))
    await screen.findByText('⚔ COMBATE')
    fireEvent.click(screen.getByRole('button', { name: 'BESTIÁRIO' }))
    const hit = await waitFor(() => {
      const el = screen
        .getAllByText('Goblin Batedor')
        .find((e) => e.classList.contains('npc-nome'))
      expect(el).toBeTruthy()
      return el!
    })
    const card = hit.closest('.npc-card') as HTMLElement
    fireEvent.click(within(card).getByLabelText('Ações da criatura'))
    fireEvent.click(await screen.findByText('⚔️ Adicionar à iniciativa'))
    const chip = await screen.findByText('+ COMBATENTE')
    fireEvent.click(chip)
    await waitFor(() => expect(screen.getByText('PROBE:/npcs?tab=bestiario')).toBeTruthy())
  })
})
