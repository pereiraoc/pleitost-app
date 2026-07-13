// @vitest-environment jsdom
// LISTA DE GRUPOS (#213) — req do usuário: os grupos puxados do Obsidian
// ficam no COMPÊNDIO como exemplos; a aba GRUPOS lista só os grupos DO
// USUÁRIO (locais, montados com os heróis dele) e a MESA da sessão ativa
// (o grupo "existe a partir da sessão", #203). Verificado NA TELA.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { HeroisPage } from '../src/components/creatures/CreaturesPages'
import { setLiveSession } from '../src/data/session-repo/live-session'
import type { SessionCharacter, SessionMember } from '../src/data/session-repo/contract'
import {
  createLocalEntity,
  __resetLocalStoreForTests,
} from '../src/data/local-entities'
import { __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
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
  setLiveSession(null)
})
afterEach(() => {
  cleanup()
  setLiveSession(null)
})

function renderGrupos() {
  const r = render(
    <CatalogProvider catalog={catalog}>
      <MemoryRouter initialEntries={['/herois']}>
        <Routes>
          <Route path="/herois" element={<HeroisPage />} />
        </Routes>
      </MemoryRouter>
    </CatalogProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'GRUPOS' }))
  return r
}

/** Personagem remoto mínimo pro GrupoDaSala (mesma forma do contract). */
function fakeChar(nome: string, vit: number, vitMax: number): SessionCharacter {
  return {
    id: `c-${nome}`,
    sessionId: 's1',
    memberId: `c-${nome}`,
    kind: 'hero',
    tutorCharacterId: null,
    characterPath: `local/${nome}.md`,
    visibility: 'party',
    summary: { nome, vitalidadeMax: vitMax, moralMax: 10, stats: { defesa: 15, movimento: 6 } },
    state: { recursosRestantes: { vitalidade: vit, moral: 10 } },
    fmBlob: {},
    updatedAt: '2026-01-01T00:00:00Z',
  } as unknown as SessionCharacter
}

const fakeMember = (id: string, nome: string, role: 'gm' | 'player' = 'player'): SessionMember =>
  ({ sessionId: 's1', userId: id, displayName: nome, role, joinedAt: '' }) as unknown as SessionMember

describe('lista de GRUPOS (#213)', () => {
  it('sem sessão: só grupos LOCAIS — nenhum grupo da vault na lista', () => {
    createLocalEntity('Grupo', 'Meu Grupo', { categoria: 'Grupo', subcategoria: 'Aventureiros' })
    renderGrupos()
    expect(screen.getByText('Meu Grupo')).toBeTruthy()
    // grupos reais da vault ficam no compêndio, fora daqui
    expect(screen.queryByText('Carlos, Dante, Mera, Pind, Thoren')).toBeNull()
    expect(screen.queryByText('Baitaca, Carlos, Drauzio')).toBeNull()
    expect(screen.queryByText('Grupo da Sessão')).toBeNull()
  })

  it('com sessão ativa: card da mesa aparece e abre a ficha do grupo da sessão', async () => {
    renderGrupos()
    act(() => {
      setLiveSession({
        sessionId: 's1',
        gmUserId: 'gm',
        characters: [fakeChar('Aline', 12, 20), fakeChar('Beto', 20, 20)],
        members: [
          fakeMember('gm', 'Mestre Zé', 'gm'),
          fakeMember('c-Aline', 'Jogadora Ana'),
          fakeMember('c-Beto', 'Jogador Bento'),
        ],
        encounters: [],
      })
    })
    const card = await screen.findByText('Grupo da Sessão')
    // #223: contagem certa — mestre à parte dos jogadores, personagens contados
    expect(screen.getByText('MESTRE + 2 jogadores · 2 personagens')).toBeTruthy()
    fireEvent.click(card)
    // ficha da mesa (#223): MESTRE, jogadores com seus personagens, tabela
    expect(await screen.findByText('// FICHA DO GRUPO DA SESSÃO')).toBeTruthy()
    expect(screen.getByText('Mestre Zé')).toBeTruthy()
    expect(screen.getByText('Jogadora Ana')).toBeTruthy()
    // Aline aparece no roster (personagem da jogadora) E na tabela de stats
    expect(screen.getAllByText('Aline').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('12/20')).toBeTruthy()
    // voltar retorna pra lista
    fireEvent.click(screen.getByText('← GRUPOS'))
    expect(await screen.findByText('Grupo da Sessão')).toBeTruthy()
  })
})
