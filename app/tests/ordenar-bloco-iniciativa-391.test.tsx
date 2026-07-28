// @vitest-environment jsdom
// #391 — "não é possível ordenar as iniciativas dentro de um grupo (rápido,
// lento, etc…)": o modo ✎ EDITAR INICIATIVA (#324, só GM) arrastava ENTRE os
// blocos de velocidade mas não reordenava DENTRO do mesmo bloco. Agora cada
// linha ganha ↑/↓ ("Subir na ordem"/"Descer na ordem") que trocam o combatente
// com o vizinho DO MESMO BLOCO (mesma velocidade + lado) em turnState.order,
// persistindo pelo mesmo updateEncounterTurnState do drag. ↑ no primeiro e ↓
// no último do bloco ficam desabilitados.
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

describe('#391 — reordenar DENTRO do bloco no modo editar iniciativa', () => {
  it('↓ no primeiro de dois NPCs do mesmo bloco inverte a ordem em turnState.order', async () => {
    const repo = new InMemorySessionRepo()
    renderCliente(repo, { id: 'gm-1', nome: 'Mestre' })
    fireEvent.click(await screen.findByText('+ Criar'))
    await screen.findByText('⚔ COMBATE')

    // dois monstros → MESMO bloco (velocidade padrão lento, lado inimigo)
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
    const orderAtual = async () =>
      (await repo.listEncountersBySession(remoteId)).find((e) => e.id === encId)!.turnState!.order
    expect(await orderAtual()).toEqual([batedor, guerreiro])

    // fora do modo editar: sem ↑/↓
    expect(screen.queryByLabelText('Subir na ordem')).toBeNull()
    fireEvent.click(screen.getByText('✎ EDITAR INICIATIVA'))

    // primeiro do bloco: ↑ desabilitado; último: ↓ desabilitado
    const rowBatedor = linhaDoCombatente('Goblin Batedor')
    const rowGuerreiro = linhaDoCombatente('Goblin Guerreiro')
    expect((within(rowBatedor).getByLabelText('Subir na ordem') as HTMLButtonElement).disabled).toBe(true)
    expect((within(rowGuerreiro).getByLabelText('Descer na ordem') as HTMLButtonElement).disabled).toBe(true)

    // ↓ no primeiro troca com o vizinho do MESMO bloco e persiste no repo
    fireEvent.click(within(rowBatedor).getByLabelText('Descer na ordem'))
    await waitFor(async () => expect(await orderAtual()).toEqual([guerreiro, batedor]))

    // a UI reflete: agora o Batedor é o último → ↓ dele desabilita, ↑ habilita
    await waitFor(() => {
      const row = linhaDoCombatente('Goblin Batedor')
      expect((within(row).getByLabelText('Descer na ordem') as HTMLButtonElement).disabled).toBe(true)
      expect((within(row).getByLabelText('Subir na ordem') as HTMLButtonElement).disabled).toBe(false)
    })

    // ↑ desfaz (inverso exato)
    fireEvent.click(within(linhaDoCombatente('Goblin Batedor')).getByLabelText('Subir na ordem'))
    await waitFor(async () => expect(await orderAtual()).toEqual([batedor, guerreiro]))
  }, 40000)

  it('↑/↓ não atravessam blocos: NPC sozinho no bloco fica com ambos desabilitados', async () => {
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
    fireEvent.click(screen.getByText('✎ EDITAR INICIATIVA'))

    // move o Guerreiro pro bloco RÁPIDO (cycle de velocidade: lento → superLento?
    // não — inimigo cicla super→rapido→lento; um clique sai de lento pra super).
    const rowGuerreiro = linhaDoCombatente('Goblin Guerreiro')
    fireEvent.click(within(rowGuerreiro).getByTitle(/Velocidade: Lento/))
    await waitFor(() => {
      // cada um sozinho no seu bloco → nenhum vizinho → tudo desabilitado
      for (const nome of ['Goblin Batedor', 'Goblin Guerreiro']) {
        const row = linhaDoCombatente(nome)
        expect((within(row).getByLabelText('Subir na ordem') as HTMLButtonElement).disabled).toBe(true)
        expect((within(row).getByLabelText('Descer na ordem') as HTMLButtonElement).disabled).toBe(true)
      }
    })
  }, 40000)
})
