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

describe('gate do Modo Mestre nas abas COMBATE/AVENTURA', () => {
  it('Mestre OFF → abas desabilitadas (mesma convenção do BESTIÁRIO)', () => {
    renderCriaturas()
    expect((screen.getByRole('button', { name: 'COMBATE' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'AVENTURA' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'BESTIÁRIO' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('#195 Criador de Combate', () => {
  it('roster com monstros reais do bestiário → dificuldade ao vivo NA TELA', async () => {
    mestreOn()
    renderCriaturas()
    fireEvent.click(screen.getByRole('button', { name: 'COMBATE' }))

    // 3× Goblin Soldado (T1 Normal = 10 pts cada) vs níveis default 1,1,1,1
    // (4×10 = 40): 30/40 = 75% → FÁCIL (threshold inclusivo do classify)
    await addMonstro('Sistema/Criaturas/Bestiário/Goblin Soldado', '3')
    expect(screen.getByText('3× Goblin Soldado')).toBeTruthy()
    await waitFor(() => expect(screen.getByText('FÁCIL')).toBeTruthy())
    expect(screen.getByText('75%')).toBeTruthy()

    // + 1× Goblin Piromante (T1 = 10): 40/40 = 100% → DIFICIL
    await addMonstro('Sistema/Criaturas/Bestiário/Goblin Piromante', '1')
    await waitFor(() => expect(screen.getByText('DIFICIL')).toBeTruthy())
    expect(screen.getByText('100%')).toBeTruthy()

    // heróis nível 5 (4×27 = 108): 40/108 ≈ 37% → TRIVIAL de volta
    fireEvent.change(screen.getByLabelText('Níveis dos heróis'), { target: { value: '5 5 5 5' } })
    await waitFor(() => expect(screen.getByText('TRIVIAL')).toBeTruthy())

    // sem sessão remota: botão desabilitado + explicação na tela
    const enviar = screen.getByRole('button', { name: 'Adicionar à sessão' }) as HTMLButtonElement
    expect(enviar.disabled).toBe(true)
    expect(screen.getByText(/SEM SESSÃO REMOTA ATIVA/)).toBeTruthy()
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

    renderCriaturas(repo)
    fireEvent.click(screen.getByRole('button', { name: 'COMBATE' }))
    await addMonstro('Sistema/Criaturas/Bestiário/Goblin Soldado', '3')

    // níveis vindos da sessão remota (1 heroína nível 5 → 27 pts):
    // 30/27 ≈ 111% → LETAL
    fireEvent.click(screen.getByRole('button', { name: 'Usar heróis da sessão (1)' }))
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

describe('#194 Criador de Aventura', () => {
  it('nível do grupo → recompensa esperada; nota real → dificuldade por nível', async () => {
    mestreOn()
    renderCriaturas()
    fireEvent.click(screen.getByRole('button', { name: 'AVENTURA' }))

    // recompensa: nível 5 → 400 PO (ECONOMY_WEALTH_DATA via wealth.ts)
    fireEvent.change(screen.getByLabelText('Nível do grupo'), { target: { value: '5' } })
    expect(screen.getAllByText('400 PO').length).toBeGreaterThanOrEqual(2) // resumo + tabela
    expect(screen.getByText('+225 PO')).toBeTruthy() // Δ do 4→5

    // nota de aventura real da vault com bloco combat-marker
    const notas = (await screen.findByLabelText('Nota de aventura')) as HTMLSelectElement
    await waitFor(() =>
      expect(
        within(notas).getAllByRole('option').some((o) => o.textContent?.includes('Emboscada de Goblins')),
      ).toBe(true),
    )
    fireEvent.change(notas, {
      target: { value: 'Campanhas/Aventuras/Emboscada de Goblins (Exemplo Sync)' },
    })

    // roster parseado na tela (3× Soldado + 1× Piromante = 40 pts)
    expect(await screen.findByText('3× Goblin Soldado')).toBeTruthy()
    expect(screen.getByText('1× Goblin Piromante')).toBeTruthy()

    // tabela por nível: 40 pts → DIFICIL nos níveis 1-3, TRIVIAL nos 4-10
    // (thresholds do classify: 100%/90.9%/83.3% e depois ≤40%)
    const tabela = document.querySelector('[data-mestre-dificuldade]') as HTMLElement
    await waitFor(() => {
      expect(within(tabela).getAllByText('DIFICIL')).toHaveLength(3)
      expect(within(tabela).getAllByText('TRIVIAL')).toHaveLength(7)
    })
    // linha do nível selecionado (5) marcada
    const linhaNivel5 = within(tabela).getAllByRole('row').find((r) => r.getAttribute('aria-current'))
    expect(linhaNivel5?.textContent).toContain('T2')
  })
})
