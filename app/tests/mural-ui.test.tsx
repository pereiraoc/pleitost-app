// @vitest-environment jsdom
// MURAL DA SESSÃO — UI: a aba MURAL da sidebar de sessão lista as imagens do
// mural; só o MESTRE da sessão viva vê o × (tirar) e o botão 📌 MURAL nas
// figuras (FiguraStrip / Lightbox do VaultImage). Jogador só olha.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { InMemorySessionRepo } from '../src/data/session-repo/in-memory'
import { SessionRepoProvider } from '../src/data/session-repo/provider'
import { setLiveSession, getLiveSession, type LiveSession } from '../src/data/session-repo/live-session'
import { __setUserForTests } from '../src/data/session-repo/auth-state'
import { __resetSettingsForTests } from '../src/settings'
import { MuralPanel } from '../src/components/sessao/MuralPanel'
import { FiguraStrip } from '../src/components/compendium/aventura/FiguraStrip'
import { VaultImage } from '../src/components/compendium/VaultImage'
import type { MuralItem } from '../src/data/session-repo/contract'

vi.mock('../src/data/assets', () => ({
  useAssetIndex: () => ({}),
  resolveAsset: (_i: unknown, alvo: string) => (alvo.startsWith('pub-') ? { basename: alvo, copiedTo: `assets/${alvo}` } : null),
  assetUrl: (e: { copiedTo: string }) => `/vault-data/${e.copiedTo}`,
  thumbUrl: (e: { copiedTo: string }) => `/vault-data/${e.copiedTo}?thumb`,
}))
vi.mock('../src/data/arquivos-cifrados', () => ({
  useArquivoCifrado: (alvo: string) => ({ conhecido: alvo.startsWith('cif-'), url: alvo.startsWith('cif-') ? `blob:${alvo}` : null, pedir: () => {} }),
}))

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
})
beforeEach(() => {
  window.localStorage.clear()
  __resetSettingsForTests()
})
afterEach(() => {
  cleanup()
  setLiveSession(null)
  __setUserForTests(null)
})

const MURAL: MuralItem[] = [
  { id: 'a', target: 'pub-mapa.png', legenda: 'O mapa', em: '2026-10-04T10:00:00Z' },
  { id: 'b', target: 'cif-nico.png', url: 'https://x/mural/s/b.jpg', legenda: 'Nico', em: '2026-10-04T11:00:00Z' },
]

async function mesa(userId: string) {
  const repo = new InMemorySessionRepo()
  const sess = await repo.createSession({ name: 'Mesa', gmUserId: 'gm-1', code: 'MU2', state: { mural: MURAL } })
  const live: LiveSession = { sessionId: sess.id, state: { mural: MURAL }, gmUserId: 'gm-1', characters: [], members: [], encounters: [] }
  setLiveSession(live)
  __setUserForTests({ id: userId, nome: userId })
  return { repo, sessId: sess.id }
}

describe('aba MURAL', () => {
  it('jogador vê a lista (mais nova primeiro), sem × e sem 📌', async () => {
    const { repo } = await mesa('p1')
    render(
      <SessionRepoProvider repo={repo}>
        <MuralPanel />
      </SessionRepoProvider>,
    )
    const itens = document.querySelectorAll('[data-mural-item]')
    expect(itens).toHaveLength(2)
    expect(itens[0]!.getAttribute('data-mural-item')).toBe('b')
    expect(screen.getByText('Nico')).toBeTruthy()
    expect(screen.getByText('O mapa')).toBeTruthy()
    // a cifrada aparece pela url do storage, não pelo alvo
    expect((itens[0]!.querySelector('img') as HTMLImageElement).src).toBe('https://x/mural/s/b.jpg')
    expect(screen.queryByRole('button', { name: /Tirar do mural/ })).toBeNull()
    expect(screen.queryByText(/📌 MURAL/)).toBeNull()
  })

  it('mestre vê × e tirar remove do servidor', async () => {
    const { repo, sessId } = await mesa('gm-1')
    render(
      <SessionRepoProvider repo={repo}>
        <MuralPanel />
      </SessionRepoProvider>,
    )
    const xs = screen.getAllByRole('button', { name: /Tirar do mural/ })
    expect(xs).toHaveLength(2)
    await act(async () => {
      fireEvent.click(xs[0]!)
    })
    await waitFor(async () => expect((await repo.findSessionById(sessId))!.state.mural!.map((m) => m.id)).toEqual(['a']))
    expect(repo.muralRemovidos).toEqual(['https://x/mural/s/b.jpg'])
    expect(getLiveSession()!.state!.mural!.map((m) => m.id)).toEqual(['a'])
  })

  it('mural vazio: jogador e mestre têm a mensagem certa', async () => {
    const repo = new InMemorySessionRepo()
    const sess = await repo.createSession({ name: 'Mesa', gmUserId: 'gm-1', code: 'MU3' })
    setLiveSession({ sessionId: sess.id, state: {}, gmUserId: 'gm-1', characters: [], members: [], encounters: [] })
    __setUserForTests({ id: 'p1', nome: 'p1' })
    const { unmount } = render(
      <SessionRepoProvider repo={repo}>
        <MuralPanel />
      </SessionRepoProvider>,
    )
    expect(screen.getByText(/mural está vazio/i)).toBeTruthy()
    expect(screen.queryByText(/use 📌 MURAL/)).toBeNull()
    unmount()
    act(() => __setUserForTests({ id: 'gm-1', nome: 'gm' }))
    render(
      <SessionRepoProvider repo={repo}>
        <MuralPanel />
      </SessionRepoProvider>,
    )
    expect(screen.getByText(/use 📌 MURAL/)).toBeTruthy()
  })
})

describe('botão 📌 MURAL', () => {
  const FIGS = [
    { target: 'pub-porto.png', legenda: 'O porto' },
    { target: 'pub-mapa.png', legenda: 'O mapa' },
  ]

  it('só o mestre da sessão viva vê nas figuras', async () => {
    const { repo } = await mesa('p1')
    const { unmount } = render(
      <SessionRepoProvider repo={repo}>
        <FiguraStrip figuras={FIGS} />
      </SessionRepoProvider>,
    )
    expect(screen.queryByText(/📌 MURAL/)).toBeNull()
    unmount()
    act(() => __setUserForTests({ id: 'gm-1', nome: 'gm' }))
    render(
      <SessionRepoProvider repo={repo}>
        <FiguraStrip figuras={FIGS} />
      </SessionRepoProvider>,
    )
    // pub-mapa já está no mural → ✓; pub-porto pode entrar
    expect(screen.getByRole('button', { name: /📌 MURAL/ })).toBeTruthy()
    const ja = screen.getByRole('button', { name: /NO MURAL/ }) as HTMLButtonElement
    expect(ja.disabled).toBe(true)
  })

  it('fora de sessão nem o mestre vê', () => {
    __setUserForTests({ id: 'gm-1', nome: 'gm' })
    render(<FiguraStrip figuras={FIGS} />)
    expect(screen.queryByText(/MURAL/)).toBeNull()
  })

  it('mestre põe a figura pública no mural (só o alvo, sem upload)', async () => {
    const { repo, sessId } = await mesa('gm-1')
    render(
      <SessionRepoProvider repo={repo}>
        <FiguraStrip figuras={FIGS} />
      </SessionRepoProvider>,
    )
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /📌 MURAL/ }))
    })
    await waitFor(async () => {
      const mural = (await repo.findSessionById(sessId))!.state.mural!
      expect(mural.find((m) => m.target === 'pub-porto.png')).toMatchObject({ legenda: 'O porto' })
    })
    expect(repo.muralUploads).toHaveLength(0)
    await waitFor(() => expect(screen.getAllByRole('button', { name: /NO MURAL/ })).toHaveLength(2))
  })

  it('no Lightbox do VaultImage o botão aparece pro mestre e clicar nele não fecha', async () => {
    const { repo, sessId } = await mesa('gm-1')
    render(
      <SessionRepoProvider repo={repo}>
        <VaultImage target="pub-porto.png" zoom />
      </SessionRepoProvider>,
    )
    fireEvent.click(document.querySelector('img')!)
    expect(document.querySelector('[data-lightbox]')).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /📌 MURAL/ }))
    })
    expect(document.querySelector('[data-lightbox]')).toBeTruthy()
    await waitFor(async () => expect((await repo.findSessionById(sessId))!.state.mural!.some((m) => m.target === 'pub-porto.png')).toBe(true))
  })
})
