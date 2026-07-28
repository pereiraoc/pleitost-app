// @vitest-environment jsdom
// #392 — "Pontos de vida não estão atualizando na aba lateral de grupo": a aba
// GRUPO da ficha (CHAR_TABS da sidebar lateral) abre o GrupoView da MESA, cujo
// painel "VIDA, DEFESAS, SENTIDOS E MOVIMENTO" (PanelVida) lia `Vida.Vitalidade`
// e `Vida.Moral` do FM — o MÁXIMO estático — e nunca o corrente vivo
// (`Interativa.Recursos_Restantes`, que o synthDocFromCharacter preenche do
// state.recursosRestantes da sessão). Resultado: dano/cura na mesa nunca
// mudavam a coluna VIT/MOR. Agora as colunas mostram o CORRENTE com a mesma
// semântica do useVidaLocal/iniciativa: ausente = cheio (fallback no máximo).
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
import { HeroisPage } from '../src/components/creatures/CreaturesPages'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import { __resetLocalStoreForTests } from '../src/data/local-entities'
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
  window.localStorage.setItem('pleitost.settings.mestre', 'true')
})
afterEach(cleanup)

/** Cliente = página HERÓIS (a aba GRUPOS abre o GrupoView da mesa — o MESMO
 *  componente da aba lateral GRUPO da ficha do herói) + sidebar da SESSÃO
 *  no mesmo render, como no harness da iniciativa. */
function renderCliente(repo: InMemorySessionRepo, user: { id: string; nome: string }) {
  return render(
    <CatalogProvider catalog={catalog}>
      <SessionRepoProvider repo={repo} user={user}>
        <DetailProvider>
          <MemoryRouter initialEntries={['/herois']}>
            <Routes>
              <Route path="/herois" element={<HeroisPage />} />
            </Routes>
            <RightSidebar drawerOpen onCloseDrawer={() => {}} />
          </MemoryRouter>
        </DetailProvider>
      </SessionRepoProvider>
    </CatalogProvider>,
  )
}

describe('#392 — VIDA da ficha de grupo da mesa reflete o state vivo', () => {
  it('coluna VIT/MOR mostra o corrente (recursosRestantes) e atualiza no updateCharacterState', async () => {
    const repo = new InMemorySessionRepo()
    renderCliente(repo, { id: 'gm-1', nome: 'Mestre' })
    fireEvent.click(await screen.findByText('+ Criar'))
    await screen.findByText('⚔ COMBATE') // sessão criada e sala viva na sidebar
    const remoteId = (await repo.findSessionByCode(listSessions()[0].codigo))!.id

    // herói publicado na mesa: máx 20/10, CORRENTE 12/5 no state vivo
    const char = await repo.insertCharacter({
      sessionId: remoteId,
      memberId: 'p-1',
      kind: 'heroi',
      tutorCharacterId: null,
      characterPath: 'local:Heroi:aline',
      visibility: 'visible',
      summary: {
        nome: 'Aline',
        family: 'Heroi',
        nivel: 3,
        atributos: { FOR: 1, AGI: 1, INT: 0, PRE: 0 },
        vitalidadeMax: 20,
        moralMax: 10,
        stats: { defesa: 12, vigor: 11, evasao: 11, impeto: 11, movimento: 5, percepcao: 1, intuicao: 1 },
      },
      state: {
        recursosRestantes: { vitalidade: 12, moral: 5, em: 0, moralTemp: 0 },
        condicoesAtivas: {},
        efeitosAtivos: {},
        invocacoesAtivas: {},
      },
      fmBlob: {},
    })

    // GRUPOS → card da mesa ("Aline") → GrupoView da mesa
    fireEvent.click(screen.getByRole('button', { name: 'GRUPOS' }))
    fireEvent.click(await screen.findByText('Aline', { selector: '.hero-nome' }))
    const painel = (await screen.findByText('// VIDA, DEFESAS, SENTIDOS E MOVIMENTO'))
      .parentElement as HTMLElement

    // célula VIT = corrente 12 (não o máximo 20); MOR = corrente 5 (não 10)
    await waitFor(() => {
      expect(within(painel).getAllByText('12').length).toBeGreaterThanOrEqual(1)
      expect(within(painel).getAllByText('5').length).toBeGreaterThanOrEqual(1)
      expect(within(painel).queryByText('20')).toBeNull()
    })

    // dano na mesa (mesmo caminho da iniciativa/publicação) → o painel segue
    await repo.updateCharacterState(char.id, {
      recursosRestantes: { vitalidade: 7, moral: 2, em: 0, moralTemp: 0 },
    })
    await waitFor(() => {
      expect(within(painel).getAllByText('7').length).toBeGreaterThanOrEqual(1)
      expect(within(painel).getAllByText('2').length).toBeGreaterThanOrEqual(1)
      expect(within(painel).queryByText('12')).toBeNull()
    })
  }, 40000)

  it('sem Interativa no doc (grupo da vault): segue mostrando o máximo (ausente = cheio)', async () => {
    const repo = new InMemorySessionRepo()
    renderCliente(repo, { id: 'gm-1', nome: 'Mestre' })
    fireEvent.click(await screen.findByText('+ Criar'))
    await screen.findByText('⚔ COMBATE') // sessão criada e sala viva na sidebar
    const remoteId = (await repo.findSessionByCode(listSessions()[0].codigo))!.id
    // state SEM vitalidade/moral definidos (ausente = recurso cheio, semântica
    // do useVidaLocal) — o painel cai no máximo do FM, como antes do fix
    await repo.insertCharacter({
      sessionId: remoteId,
      memberId: 'p-1',
      kind: 'heroi',
      tutorCharacterId: null,
      characterPath: 'local:Heroi:beto',
      visibility: 'visible',
      summary: {
        nome: 'Beto',
        family: 'Heroi',
        nivel: 2,
        atributos: { FOR: 1, AGI: 1, INT: 0, PRE: 0 },
        vitalidadeMax: 18,
        moralMax: 9,
        stats: { defesa: 12, vigor: 11, evasao: 11, impeto: 11, movimento: 5, percepcao: 1, intuicao: 1 },
      },
      state: {
        recursosRestantes: undefined as never,
        condicoesAtivas: {},
        efeitosAtivos: {},
        invocacoesAtivas: {},
      },
      fmBlob: {},
    })
    fireEvent.click(screen.getByRole('button', { name: 'GRUPOS' }))
    fireEvent.click(await screen.findByText('Beto', { selector: '.hero-nome' }))
    const painel = (await screen.findByText('// VIDA, DEFESAS, SENTIDOS E MOVIMENTO'))
      .parentElement as HTMLElement
    await waitFor(() => {
      expect(within(painel).getAllByText('18').length).toBeGreaterThanOrEqual(1)
      expect(within(painel).getAllByText('9').length).toBeGreaterThanOrEqual(1)
    })
  }, 40000)
})
