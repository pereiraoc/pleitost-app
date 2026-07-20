// @vitest-environment jsdom
// #333 — INVENTÁRIO COMPARTILHADO da mesa (PanelInventario): o Mestre e os
// jogadores colocam itens num pool sincronizado no state da sessão; o jogador
// PUXA um item pra ficha dele (transferência: sai do grupo). Artefatos só o
// Mestre coloca. Verificado sobre o InMemorySessionRepo (mesmo transporte dos
// outros testes de sessão) + vault-data real.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { SessionRepoProvider } from '../src/data/session-repo/provider'
import { InMemorySessionRepo } from '../src/data/session-repo/in-memory'
import { setLiveSession } from '../src/data/session-repo/live-session'
import { PanelInventario } from '../src/grupo/PanelInventario'
import { __resetSettingsForTests } from '../src/settings'
import {
  __resetLocalStoreForTests,
  createLocalEntity,
  emptyHeroFrontmatter,
  getLocalDoc,
} from '../src/data/local-entities'
import type { IndexManifest, SessionCharacter } from '../src/data/types'
import type { LiveSession } from '../src/data/session-repo/live-session'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
const catalog = buildCatalog(manifest)

const ARTEFATO = manifest.docs.find((d) => d.id.startsWith('Sistema/Equipamento/Tesouros/Artefatos/'))!
// um tesouro comum (não-artefato) pra o caminho de adicionar/puxar
const TESOURO = manifest.docs.find(
  (d) =>
    d.id.startsWith('Sistema/Equipamento/Tesouros/') &&
    d.subtype === 'Tesouro' &&
    !d.id.startsWith('Sistema/Equipamento/Tesouros/Consumíveis/') &&
    !d.id.startsWith('Sistema/Equipamento/Tesouros/Imbuições e Qualidade/') &&
    !d.id.startsWith('Sistema/Equipamento/Tesouros/Artefatos/'),
)!
// equipamento "outro" (perícia/ataque/defesa) pro configurador
const EQUIP = manifest.docs.find(
  (d) => d.id.startsWith('Sistema/Equipamento/Tesouros/Equipamentos/') && d.subtype === 'Tesouro',
)!

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
  __resetSettingsForTests()
  __resetLocalStoreForTests()
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

function heroi(memberId: string, characterPath: string): SessionCharacter {
  return {
    id: `char-${memberId}`,
    sessionId: 's',
    memberId,
    kind: 'heroi',
    tutorCharacterId: null,
    characterPath,
    visibility: 'visible',
    summary: {
      nome: 'Herói',
      family: 'Heroi',
      nivel: 3,
      atributos: { FOR: 0, AGI: 0, INT: 0, PRE: 0 },
      vitalidadeMax: 10,
      stats: { defesa: 0, vigor: 0, evasao: 0, impeto: 0, movimento: 0, percepcao: 0, intuicao: 0 },
    },
    state: { recursosRestantes: { vitalidade: 10, moral: 0, em: 0, moralTemp: 0 }, condicoesAtivas: {}, efeitosAtivos: {}, invocacoesAtivas: {} },
    fmBlob: {},
    updatedAt: '',
    encounterId: null,
  }
}

function setLive(sessionId: string, over: Partial<LiveSession>) {
  setLiveSession({
    sessionId,
    state: null,
    gmUserId: 'gm-1',
    characters: [],
    members: [{ sessionId, userId: 'gm-1', role: 'gm', displayName: 'Mestre', joinedAt: '' }],
    encounters: [],
    ...over,
  })
}

function renderPanel(repo: InMemorySessionRepo, user: { id: string; nome: string }) {
  return render(
    <CatalogProvider catalog={catalog}>
      <SessionRepoProvider repo={repo} user={user}>
        <MemoryRouter>
          <PanelInventario groupId="mesa" />
        </MemoryRouter>
      </SessionRepoProvider>
    </CatalogProvider>,
  )
}

describe('#333/#336 inventário do grupo', () => {
  it('adicionar EQUIPAMENTO pelo configurador entra no state (kind tesouro)', async () => {
    const repo = new InMemorySessionRepo()
    const sess = await repo.createSession({ name: 'Mesa', gmUserId: 'gm-1', code: 'INV001' })
    setLive(sess.id, {})
    renderPanel(repo, { id: 'gm-1', nome: 'Mestre' })

    // tipo Equipamento → sub Outro → escolhe o item → Adicionar
    fireEvent.click(await screen.findByRole('button', { name: /Equipamento/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Outro' }))
    const sel = (await screen.findByLabelText('Equipamento')) as HTMLSelectElement
    await waitFor(() => expect(sel.options.length).toBeGreaterThan(1))
    fireEvent.change(sel, { target: { value: EQUIP.id } })
    fireEvent.click(screen.getByRole('button', { name: /\+ Adicionar/ }))

    await waitFor(async () => {
      const s = (await repo.findSessionById(sess.id))!.state.inventarioGrupo ?? {}
      const vals = Object.values(s)
      expect(vals.length).toBe(1)
      const v = vals[0] as Record<string, unknown>
      expect(v.kind).toBe('tesouro')
      expect(v.docId).toBe(EQUIP.id)
      expect(v.addedBy).toBe('gm-1')
    })
  })

  it('adicionar OURO entra no state (kind ouro + quantidade + valor)', async () => {
    const repo = new InMemorySessionRepo()
    const sess = await repo.createSession({ name: 'Mesa', gmUserId: 'gm-1', code: 'INV004' })
    setLive(sess.id, {})
    renderPanel(repo, { id: 'gm-1', nome: 'Mestre' })

    fireEvent.click(await screen.findByRole('button', { name: /Ouro/ }))
    fireEvent.change(screen.getByLabelText('Quantidade de ouro'), { target: { value: '75' } })
    fireEvent.click(screen.getByRole('button', { name: /\+ Adicionar/ }))

    await waitFor(async () => {
      const s = (await repo.findSessionById(sess.id))!.state.inventarioGrupo ?? {}
      const v = Object.values(s)[0] as Record<string, unknown>
      expect(v.kind).toBe('ouro')
      expect(v.qtd).toBe(75)
      expect(v.valorPO).toBe(75)
    })
  })

  it('Artefato só aparece no seletor de Equipamento pro Mestre', async () => {
    const repo = new InMemorySessionRepo()
    const sess = await repo.createSession({ name: 'Mesa', gmUserId: 'gm-1', code: 'INV002' })
    setLive(sess.id, {})
    // jogador comum (sem Modo Mestre): sem Artefato no seletor
    const { unmount } = renderPanel(repo, { id: 'p-1', nome: 'Ana' })
    fireEvent.click(await screen.findByRole('button', { name: /Equipamento/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Outro' }))
    const selJog = (await screen.findByLabelText('Equipamento')) as HTMLSelectElement
    await waitFor(() => expect(selJog.options.length).toBeGreaterThan(1))
    expect([...selJog.options].some((o) => o.value === ARTEFATO.id)).toBe(false)
    unmount()

    // Mestre: Artefato disponível no "Outro"
    mestreOn()
    renderPanel(repo, { id: 'gm-1', nome: 'Mestre' })
    fireEvent.click(await screen.findByRole('button', { name: /Equipamento/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Outro' }))
    const selGm = (await screen.findByLabelText('Equipamento')) as HTMLSelectElement
    await waitFor(() => expect([...selGm.options].some((o) => o.value === ARTEFATO.id)).toBe(true))
  })

  it('puxar TRANSFERE: some do grupo e entra na ficha (local) do jogador', async () => {
    const repo = new InMemorySessionRepo()
    const sess = await repo.createSession({ name: 'Mesa', gmUserId: 'gm-1', code: 'INV003' })
    // herói LOCAL do jogador p-1
    const heroiId = createLocalEntity('Heroi', 'Nia', { ...emptyHeroFrontmatter() })
    // item já no pool
    await repo.updateSessionState(sess.id, {
      inventarioGrupo: {
        k1: { docId: TESOURO.id, nome: TESOURO.basename ?? TESOURO.id, tier: 'A', addedBy: 'gm-1', addedAt: '2026-01-01T00:00:00Z' },
      },
    })
    const remote = (await repo.findSessionById(sess.id))!
    setLive(sess.id, {
      state: remote.state,
      characters: [heroi('p-1', heroiId)],
      members: [
        { sessionId: sess.id, userId: 'gm-1', role: 'gm', displayName: 'Mestre', joinedAt: '' },
        { sessionId: sess.id, userId: 'p-1', role: 'player', displayName: 'Ana', joinedAt: '' },
      ],
    })
    renderPanel(repo, { id: 'p-1', nome: 'Ana' })

    fireEvent.click(await screen.findByRole('button', { name: /Puxar/ }))

    // entrou na ficha local do herói (Inventario.Tesouros com alias Adepto)
    await waitFor(() => {
      const tes = (getLocalDoc(heroiId)?.frontmatter?.['Inventario'] as Record<string, unknown>)?.['Tesouros'] as unknown[]
      expect(Array.isArray(tes) && tes.length === 1).toBe(true)
      expect(String(tes[0])).toContain(TESOURO.basename ?? TESOURO.id)
    })
    // saiu do grupo (transferência)
    await waitFor(async () => {
      const s = (await repo.findSessionById(sess.id))!.state.inventarioGrupo ?? {}
      expect(Object.keys(s).length).toBe(0)
    })
  })
})
