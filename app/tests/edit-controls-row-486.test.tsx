// @vitest-environment jsdom
// #486 follow-up — o botão 📕 de liberar a ficha EXISTIA mas renderizava fora
// da área visível: a linha 1 do combatente (retrato+nome+controles) estourava
// os 340px do painel direito e o clipPath do card cortava os últimos botões.
// Os controles de edição (velocidade/↑↓/🙈/❓/📕) agora vivem numa linha
// PRÓPRIA com flexWrap — este teste trava essa estrutura.
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
import { __resetSessionStoreForTests } from '../src/data/session-store'
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
  window.localStorage.setItem('pleitost.settings.mestre', 'true')
})
afterEach(cleanup)

describe('#486 — 📕 visível: controles de edição em linha própria', () => {
  it('liberar/❓/🙈 ficam numa linha com flexWrap, separada do nome', async () => {
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
    fireEvent.click(screen.getByText('✎ EDITAR INICIATIVA'))

    const liberar = await screen.findByTitle('Liberar a ficha resumo aos jogadores')
    expect((liberar as HTMLButtonElement).disabled).toBe(false)
    // a linha dos controles quebra (flexWrap) — nunca estoura o painel de 340px
    const linha = liberar.parentElement as HTMLElement
    expect(linha.style.flexWrap).toBe('wrap')
    // ❓ e 🙈 moram na MESMA linha; o NOME do combatente mora em outra
    expect(within(linha).getByTitle('Revelar identidade aos players')).toBeTruthy()
    expect(within(linha).getByTitle('Esconder dos jogadores')).toBeTruthy()
    expect(within(linha).queryByText('Goblin Batedor')).toBeNull()
  }, 40000)
})
