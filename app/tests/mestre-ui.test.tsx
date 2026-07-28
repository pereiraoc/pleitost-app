// @vitest-environment jsdom
// Trilha C do plano-mestre (#194/#195) — os Criadores do Modo Mestre NA TELA
// real (página CRIATURAS, abas COMBATE/AVENTURA mestre-gated), sobre dados
// REAIS do vault-data (fetch stubado lê os JSONs do disco):
//   #195 — montar roster com monstro real do bestiário → dificuldade AO VIVO
//          lida da tela; "Adicionar à sessão" chama insertEncounter num
//          InMemorySessionRepo injetado com sessão fake ativa;
//   #194 — nível do grupo → recompensa esperada na tela; nota de aventura
//          real (bloco combat-marker) → tabela de dificuldade por nível.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { SessionRepoProvider } from '../src/data/session-repo/provider'
import { InMemorySessionRepo } from '../src/data/session-repo/in-memory'
import { setLiveSession } from '../src/data/session-repo/live-session'
import type { SessionCharacter } from '../src/data/session-repo/contract'
import { NpcsPage } from '../src/components/creatures/CreaturesPages'
import { CriadorCombate } from '../src/components/mestre/CriadorCombate'
import { DetailProvider } from '../src/data/detail-context'
import { __resetLocalStoreForTests } from '../src/data/local-entities'
import { __resetSettingsForTests } from '../src/settings'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

// jsdom deste setup não traz localStorage — mesmo stub dos testes existentes
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
  // serve /vault-data/** do disco, como o dev server faz
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
  __resetSettingsForTests()
  setLiveSession(null)
})
afterEach(() => {
  cleanup()
  setLiveSession(null)
})

function mestreOn() {
  window.localStorage.setItem('pleitost.settings.mestre', 'true')
  __resetSettingsForTests()
}

function renderCriaturas(repo: InMemorySessionRepo | null = null) {
  return render(
    <CatalogProvider catalog={catalog}>
      <SessionRepoProvider repo={repo} user={repo ? { id: 'gm-1', nome: 'Mestre' } : null}>
        <MemoryRouter>
          <NpcsPage />
        </MemoryRouter>
      </SessionRepoProvider>
    </CatalogProvider>,
  )
}

/** #397: o Criador de Combate saiu de Criaturas para o compêndio. Os testes
 *  do #195 renderizam o componente direto (com Detalhes p/ o botão Resumo). */
function renderCriador(repo: InMemorySessionRepo | null = null) {
  return render(
    <CatalogProvider catalog={catalog}>
      <SessionRepoProvider repo={repo} user={repo ? { id: 'gm-1', nome: 'Mestre' } : null}>
        <DetailProvider>
          <MemoryRouter>
            <CriadorCombate />
          </MemoryRouter>
        </DetailProvider>
      </SessionRepoProvider>
    </CatalogProvider>,
  )
}

/** Sessão viva com N heróis de um nível (níveis vêm da sessão, não de input). */
function fakeLive(sessionId: string, levels: number[]) {
  setLiveSession({
    sessionId,
    characters: levels.map((nivel, i) => ({
      id: `h${i}`,
      kind: 'heroi',
      summary: { nome: `Herói ${i + 1}`, family: 'Heroi', nivel },
    })),
    members: [],
  } as never)
}

/** Adiciona um monstro do bestiário pelo fluxo real da tela. */
async function addMonstro(id: string, qty: string) {
  const sel = (await screen.findByLabelText('Monstro do bestiário')) as HTMLSelectElement
  fireEvent.change(sel, { target: { value: id } })
  fireEvent.change(screen.getByLabelText('Quantidade'), { target: { value: qty } })
  const btn = screen.getByRole('button', { name: '+ Adicionar' }) as HTMLButtonElement
  // o botão habilita quando os docs do bestiário (FM Tier/Modificador) chegam
  await waitFor(() => expect(btn.disabled).toBe(false))
  fireEvent.click(btn)
}

describe('gate do Modo Mestre em Criaturas', () => {
  it('Mestre OFF → BESTIÁRIO desabilitado; COMBATE/AVENTURA não existem mais aqui', () => {
    renderCriaturas()
    expect((screen.getByRole('button', { name: 'BESTIÁRIO' }) as HTMLButtonElement).disabled).toBe(true)
    // #396/#397: os Criadores saíram de Criaturas para o compêndio
    expect(screen.queryByRole('button', { name: 'COMBATE' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'AVENTURA' })).toBeNull()
  })
})

describe('#195/#397 Criador de Combate (agora no compêndio)', () => {
  it('roster com monstros reais → dificuldade pra mesa ativa (níveis vêm da sessão)', async () => {
    mestreOn()
    // #397: sem input manual — 4 heróis nível 1 na sessão (4×10 = 40 pts)
    fakeLive('s1', [1, 1, 1, 1])
    renderCriador()

    // 3× Goblin Soldado (T1 Normal = 10 pts cada = 30): 30/40 = 75% → FÁCIL
    await addMonstro('Sistema/Criaturas/Bestiário/Goblin Soldado', '3')
    expect(screen.getByText('3× Goblin Soldado')).toBeTruthy()
    await waitFor(() => expect(screen.getByText('FÁCIL')).toBeTruthy())
    expect(screen.getByText(/75%/)).toBeTruthy()

    // + 1× Goblin Piromante (T1 = 10): 40/40 = 100% → DIFICIL
    await addMonstro('Sistema/Criaturas/Bestiário/Goblin Piromante', '1')
    await waitFor(() => expect(screen.getByText('DIFICIL')).toBeTruthy())

    // #397: NÃO há mais input "Níveis dos heróis"
    expect(screen.queryByLabelText('Níveis dos heróis')).toBeNull()
    // #397: as barrinhas por nível aparecem (dificuldade genérica)
    expect(document.querySelector('.gm-enc-levelbar')).toBeTruthy()
  })

  it('#397: botão 🔍 Resumo abre a ficha resumo do monstro nos Detalhes', async () => {
    mestreOn()
    fakeLive('s1', [1])
    renderCriador()
    const sel = (await screen.findByLabelText('Monstro do bestiário')) as HTMLSelectElement
    fireEvent.change(sel, { target: { value: 'Sistema/Criaturas/Bestiário/Goblin Soldado' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ver ficha resumo do monstro' }))
    // o painel de Detalhes abre com o resumo do monstro (nome na tela)
    await waitFor(() => expect(screen.getAllByText(/Goblin Soldado/).length).toBeGreaterThan(0))
  })

  it('com sessão fake ativa: insertEncounter persiste roster + dificuldade + heroSnapshot', async () => {
    mestreOn()
    const repo = new InMemorySessionRepo()
    const sess = await repo.createSession({ name: 'Mesa', gmUserId: 'gm-1', code: 'ABC123' })
    const heroina = {
      id: 'char-1',
      sessionId: sess.id,
      memberId: 'p-1',
      kind: 'heroi',
      tutorCharacterId: null,
      characterPath: 'local/nia',
      visibility: 'visible',
      summary: { nome: 'Nia', family: 'Heroi', nivel: 5 },
      state: {},
      fmBlob: {},
      updatedAt: '',
    } as unknown as SessionCharacter
    setLiveSession({ sessionId: sess.id, characters: [heroina], members: [] })

    renderCriador(repo)
    await addMonstro('Sistema/Criaturas/Bestiário/Goblin Soldado', '3')

    // níveis vindos DIRETO da sessão (1 heroína nível 5 → 27 pts):
    // 30/27 ≈ 111% → LETAL, sem clicar em nada
    await waitFor(() => expect(screen.getByText('LETAL')).toBeTruthy())

    fireEvent.change(screen.getByLabelText('Nome do combate'), { target: { value: 'Emboscada' } })
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar à sessão' }))

    // encounter chegou no repo injetado (mesma sala da sessão fake)
    await waitFor(() => expect(repo.encounters.size).toBe(1))
    const enc = [...repo.encounters.values()][0]
    expect(enc.sessionId).toBe(sess.id)
    expect(enc.name).toBe('Emboscada')
    expect(enc.status).toBe('prepared')
    expect(enc.roster.entries).toEqual([
      {
        sourcePath: 'Sistema/Criaturas/Bestiário/Goblin Soldado.md',
        label: 'Goblin Soldado',
        qty: 3,
      },
    ])
    expect(enc.difficulty).toMatchObject({
      label: 'LETAL',
      monsterTotal: 30,
      playerTotal: 27,
      heroSnapshot: [{ nome: 'Nia', nivel: 5 }],
    })
    // feedback na tela
    expect(await screen.findByText('Combate "Emboscada" adicionado à sessão.')).toBeTruthy()
  })
})

// #396/#397: os Criadores (Aventura + Combate) foram REMOVIDOS de Criaturas —
// a autoria vive no compêndio (Campanhas/Aventuras e Campanhas/Combates).
describe('#396/#397 — abas AVENTURA e COMBATE removidas de Criaturas', () => {
  it('Modo Mestre ON: não há botão AVENTURA nem COMBATE na página CRIATURAS', () => {
    mestreOn()
    renderCriaturas()
    expect(screen.queryByRole('button', { name: 'AVENTURA' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'COMBATE' })).toBeNull()
    // BESTIÁRIO segue como aba mestre-gated
    expect(screen.getByRole('button', { name: 'BESTIÁRIO' })).toBeTruthy()
  })
})
