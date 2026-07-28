// @vitest-environment jsdom
// #388 — "Moral não tá aparecendo o número da moral na sessão iniciativa quando
// tem combate": a linha do combatente mostrava só `❤️ vit/max` numérico (a
// VidaBarRemota TEM o segmento azul de moral, mas sem número). Agora a linha
// imprime também `💙 moral/max` (mesmo mono do ❤️, padrão do '💙 MOR' do
// GrupoDaSala/LinhaPersonagem) — SÓ pra quem TEM moral: família Monstro não tem
// (caps moral=false, bestiario-f5) → summary.moralMax 0/undefined → sem 💙.
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

/** Linha do combatente no combate da sala a partir do NOME (o nome é o
 *  <button> "Ver resumo" da linha 1; o pai do pai é o card da linha — que
 *  contém a linha 2 com o ❤️ numérico; o nome também aparece no botão FICHA
 *  DO GRUPO e no card do bestiário, por isso o filtro pelo ❤️). */
function linhaDoCombatente(nome: string): HTMLElement {
  const row = screen
    .getAllByText(nome)
    .map((e) => e.parentElement?.parentElement as HTMLElement | null)
    .find((r) => r != null && within(r).queryByText(/❤️ \d+\//) != null)
  expect(row).toBeTruthy()
  return row!
}

describe('#388 — número da moral na iniciativa da sessão com combate', () => {
  it('herói em combate mostra 💙 moral/max ao lado do ❤️; Monstro (sem moral) não', async () => {
    const repo = new InMemorySessionRepo()
    renderCliente(repo, { id: 'gm-1', nome: 'Mestre' })
    fireEvent.click(await screen.findByText('+ Criar'))
    await screen.findByText('⚔ COMBATE')
    const remoteId = (await repo.findSessionByCode(listSessions()[0].codigo))!.id

    // herói do jogador na mesa (moral 7 de 12 no state vivo)
    await repo.insertCharacter({
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
        vitalidadeMax: 24,
        moralMax: 12,
        stats: { defesa: 12, vigor: 11, evasao: 11, impeto: 11, movimento: 5, percepcao: 1, intuicao: 1 },
      },
      state: {
        recursosRestantes: { vitalidade: 18, moral: 7, em: 0, moralTemp: 0 },
        condicoesAtivas: {},
        efeitosAtivos: {},
        invocacoesAtivas: {},
      },
      fmBlob: {},
    })

    // GM inicia o combate ad-hoc — o herói entra na ordem
    fireEvent.click(await screen.findByTitle('Iniciar Combate'))
    await waitFor(() => expect(screen.getAllByText(/Turno 1/).length).toBeGreaterThanOrEqual(1))

    // linha do herói: vida E moral numéricas, lado a lado
    const heroi = linhaDoCombatente('Aline')
    expect(within(heroi).getByText('❤️ 18/24')).toBeTruthy()
    expect(within(heroi).getByText('💙 7/12')).toBeTruthy()

    // Monstro no MESMO combate: família sem moral (caps moral=false,
    // bestiario-f5) → summary.moralMax 0/undefined → NENHUM 💙 na linha
    await adicionarAIniciativa('Goblin Batedor')
    await waitFor(() =>
      expect(screen.getAllByText('Goblin Batedor').some((e) => e.closest('.npc-card') === null)).toBe(true),
    )
    const goblin = linhaDoCombatente('Goblin Batedor')
    expect(within(goblin).getByText(/❤️ \d+\/\d+/)).toBeTruthy()
    expect(within(goblin).queryByText(/💙/)).toBeNull()
  }, 40000)

  it('moral REFLETE o state vivo: updateCharacterState muda o número na linha', async () => {
    const repo = new InMemorySessionRepo()
    renderCliente(repo, { id: 'gm-1', nome: 'Mestre' })
    fireEvent.click(await screen.findByText('+ Criar'))
    await screen.findByText('⚔ COMBATE')
    const remoteId = (await repo.findSessionByCode(listSessions()[0].codigo))!.id
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
        vitalidadeMax: 24,
        moralMax: 12,
        stats: { defesa: 12, vigor: 11, evasao: 11, impeto: 11, movimento: 5, percepcao: 1, intuicao: 1 },
      },
      state: {
        recursosRestantes: { vitalidade: 18, moral: 7, em: 0, moralTemp: 0 },
        condicoesAtivas: {},
        efeitosAtivos: {},
        invocacoesAtivas: {},
      },
      fmBlob: {},
    })
    fireEvent.click(await screen.findByTitle('Iniciar Combate'))
    await waitFor(() => expect(screen.getByText('💙 7/12')).toBeTruthy())

    await repo.updateCharacterState(char.id, {
      recursosRestantes: { vitalidade: 18, moral: 3, em: 0, moralTemp: 0 },
    })
    await waitFor(() => expect(screen.getByText('💙 3/12')).toBeTruthy())
  }, 40000)
})
