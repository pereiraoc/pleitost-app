// @vitest-environment jsdom
// Pedido do usuário (follow-up do #379 r2): "se estiver desconectado da mesa,
// eu não possa editar o caminho, justamente pra não causar problema de casos
// sem mesa dar conflito". A trilha agora vive no groupState do grupo
// persistente e é sincronizada com o session state (remoto = fonte de
// verdade) — edição offline seria sobrescrita no pull. Contrato novo:
// EDIÇÃO DO CAMINHO SÓ NA MESA CONECTADA; a ficha de grupo (vault/local,
// fora da sessão) mostra o caminho SOMENTE LEITURA (sem adicionar parada/
// caminho, sem arrastar, sem remover, sem editar rótulo/data).
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { SessionRepoProvider } from '../src/data/session-repo/provider'
import { InMemorySessionRepo } from '../src/data/session-repo/in-memory'
import { setLiveSession, MESA_GRUPO_ID } from '../src/data/session-repo/live-session'
import type { LiveSession } from '../src/data/session-repo/live-session'
import type { SessionCharacter } from '../src/data/session-repo/contract'
import { GrupoView } from '../src/grupo/GrupoView'
import { setGroupStateFull, __resetGroupStoreMemoryForTests } from '../src/data/group-store'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

const GRUPO_CARLOS = 'Sistema/Criaturas/Grupos de Criaturas/Carlos, Dante, Mera, Pind, Thoren'
const TRILHA = {
  hexes: [
    { id: 'h1', col: 30, row: 20, kind: 'parada', label: 'Tumba Selada' },
    { id: 'h2', col: 31, row: 20, kind: 'caminho' },
  ],
} as never

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
  __resetGroupStoreMemoryForTests()
  setLiveSession(null)
})
afterEach(() => {
  cleanup()
  setLiveSession(null)
})

function liveMesa(sessionId: string): LiveSession {
  const char = {
    id: 'c1',
    sessionId,
    memberId: 'm1',
    kind: 'heroi',
    tutorCharacterId: null,
    characterPath: 'local:Heroi:carlos-copia',
    visibility: 'party',
    summary: { nome: 'Carlos', family: 'Heroi' },
    state: {},
    fmBlob: { grupo: ['[[Carlos, Dante, Mera, Pind, Thoren]]'] },
    updatedAt: '2026-07-23T00:00:00.000Z',
  } as unknown as SessionCharacter
  return { sessionId, state: null, gmUserId: null, characters: [char], members: [], encounters: [] }
}

function renderView(groupId: string) {
  return render(
    <CatalogProvider catalog={catalog}>
      <SessionRepoProvider repo={new InMemorySessionRepo()}>
        <MemoryRouter>
          <GrupoView groupId={groupId} />
        </MemoryRouter>
      </SessionRepoProvider>
    </CatalogProvider>,
  )
}

describe('caminho SOMENTE LEITURA fora da mesa conectada', () => {
  it('grupo da vault DESCONECTADO: sem adicionar/arrastar/remover — só leitura', async () => {
    setGroupStateFull(GRUPO_CARLOS, TRILHA)
    const { container } = renderView(GRUPO_CARLOS)
    // a trilha APARECE (leitura preservada)…
    expect(await screen.findByText(/Tumba Selada/)).toBeTruthy()
    // …mas NENHUMA afordância de edição:
    expect(screen.queryByText(/\+ Adicionar Parada/)).toBeNull()
    expect(screen.queryByText(/\+ Adicionar Caminho/)).toBeNull()
    expect(container.querySelector('[data-drag-handle]')).toBeNull()
    // hint de leitura no lugar dos botões
    expect(screen.getByText(/SOMENTE LEITURA/)).toBeTruthy()
  }, 30000)

  it('MESA CONECTADA: edição liberada (botões presentes — trap reverso)', async () => {
    setGroupStateFull(GRUPO_CARLOS, TRILHA)
    setLiveSession(liveMesa('s1'))
    renderView(MESA_GRUPO_ID)
    await waitFor(() => {
      expect(screen.getByText(/\+ Adicionar Parada/)).toBeTruthy()
      expect(screen.getByText(/\+ Adicionar Caminho/)).toBeTruthy()
    })
    expect(screen.queryByText(/SOMENTE LEITURA/)).toBeNull()
  }, 30000)
})
