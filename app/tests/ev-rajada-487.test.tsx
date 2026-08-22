// @vitest-environment jsdom
// #487 — editar vida de inimigo tinha delay chato: cada clique esperava o
// round-trip pro número mexer, e rajada de cliques disparava um write por tap.
// Agora: display OTIMISTA (o alvo pendente aparece na hora), writes coalescem
// num só ~350ms após o último clique, e uma caixinha ±X ao lado dos steppers
// aplica -X/+X no Enter.
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
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

describe('#487 — edição de vida rápida e caixinha ±X', () => {
  it('rajada: display na hora, UM write coalescido; ±X aplica no Enter', async () => {
    const repo = new InMemorySessionRepo()
    render(
      <CatalogProvider catalog={catalog}>
        <SessionRepoProvider repo={repo} user={{ id: 'gm-1', nome: 'Mestre' }}>
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
    fireEvent.click(await screen.findByText('+ Criar'))
    await screen.findByText('⚔ COMBATE')
    fireEvent.click(screen.getByRole('button', { name: 'BESTIÁRIO' }))
    const hit = await waitFor(() => {
      const el = screen.getAllByText('Goblin Batedor').find((e) => e.classList.contains('npc-nome'))
      expect(el).toBeTruthy()
      return el!
    })
    fireEvent.click(within(hit.closest('.npc-card') as HTMLElement).getByLabelText('Ações da criatura'))
    fireEvent.click(await screen.findByText('⚔️ Adicionar à iniciativa'))
    await waitFor(() => expect(screen.getAllByText(/Turno 1/).length).toBeGreaterThanOrEqual(1))
    const remoteId = (await repo.findSessionByCode(listSessions()[0].codigo))!.id
    const npcId = (await repo.findCharactersBySession(remoteId)).find((c) => c.kind === 'npc')!.id

    const vida = () => screen.getByText(new RegExp(`❤️ \\d+/${goblinVit}`))
    await waitFor(() => expect(vida()).toBeTruthy())
    const row = vida().closest('div[style]')!.parentElement!.parentElement as HTMLElement

    const spy = vi.spyOn(repo, 'updateCharacterState')
    // rajada de 3 taps: número mexe NA HORA, sem nenhum write ainda
    fireEvent.click(within(row).getByLabelText('−1 EV'))
    fireEvent.click(within(row).getByLabelText('−1 EV'))
    fireEvent.click(within(row).getByLabelText('−1 EV'))
    expect(screen.getByText(new RegExp(`❤️ ${goblinVit - 3}/${goblinVit}`))).toBeTruthy()
    expect(spy).not.toHaveBeenCalled()
    // ~350ms depois: UM write só, com o alvo final
    await waitFor(async () => {
      const npc = (await repo.findCharactersBySession(remoteId)).find((c) => c.id === npcId)!
      expect(npc.state.recursosRestantes.vitalidade).toBe(goblinVit - 3)
    })
    expect(spy).toHaveBeenCalledTimes(1)

    // caixinha ±X: "-7" + Enter aplica na hora e persiste coalescido
    const box = within(row).getByLabelText('Ajuste de EV (±X)')
    fireEvent.change(box, { target: { value: '-7' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(screen.getByText(new RegExp(`❤️ ${goblinVit - 10}/${goblinVit}`))).toBeTruthy()
    expect((box as HTMLInputElement).value).toBe('')
    await waitFor(async () => {
      const npc = (await repo.findCharactersBySession(remoteId)).find((c) => c.id === npcId)!
      expect(npc.state.recursosRestantes.vitalidade).toBe(goblinVit - 10)
    })
  }, 40000)
})
