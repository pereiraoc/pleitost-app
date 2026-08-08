// @vitest-environment jsdom
// Report #379 (round 2 — "continua não mostrando todo o histórico de caminho
// no grupo do Carlos"): a trilha COMPLETA (137 hexes) vivia no escopo POR
// SESSÃO da mesa (`sessao:mesa:<id>`), e a ficha do GRUPO DA VAULT lia outro
// armazenamento (groupState.<grupo>, com 1 hex) — fragmentação por design.
// A trilha é do GRUPO, não da sessão: quando a mesa tem um grupo PERSISTENTE
// (FM `grupo` dos personagens publicados — a MESMA ponte do #74/imagem), a
// exploração da mesa passa a LER/ESCREVER o groupState desse grupo. Assim a
// ficha do grupo do Carlos mostra a trilha toda, conectado OU desconectado.
// O escopo por sessão migra pro grupo (destino vazio); com dados nos dois, o
// sync #5 (remoto = fonte de verdade) converge no pull.
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
import {
  getGroupState,
  setGroupStateFull,
  __resetGroupStoreMemoryForTests,
} from '../src/data/group-store'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)

const GRUPO_CARLOS = 'Sistema/Criaturas/Grupos de Criaturas/Carlos, Dante, Mera, Pind, Thoren'

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

const TRILHA = {
  hexes: [
    { id: 'h1', col: 30, row: 20, kind: 'parada', label: 'Tumba Selada' },
    { id: 'h2', col: 31, row: 20, kind: 'caminho' },
  ],
} as never

/** Personagem publicado com FM `grupo` apontando pro grupo persistente. */
function charDoGrupo(grupo: string | null): SessionCharacter {
  return {
    id: 'c1',
    sessionId: 's1',
    memberId: 'm1',
    kind: 'heroi',
    tutorCharacterId: null,
    characterPath: 'local:Heroi:carlos-copia',
    visibility: 'party',
    summary: { nome: 'Carlos', family: 'Heroi' },
    state: {},
    fmBlob: grupo ? { grupo: [grupo] } : {},
    updatedAt: '2026-07-23T00:00:00.000Z',
  } as unknown as SessionCharacter
}

function liveMesa(sessionId: string, grupo: string | null): LiveSession {
  return {
    sessionId,
    state: null,
    gmUserId: null,
    characters: [charDoGrupo(grupo)],
    members: [],
    encounters: [],
  }
}

function renderView(repo: InMemorySessionRepo, groupId: string) {
  return render(
    <CatalogProvider catalog={catalog}>
      <SessionRepoProvider repo={repo}>
        <MemoryRouter>
          <GrupoView groupId={groupId} />
        </MemoryRouter>
      </SessionRepoProvider>
    </CatalogProvider>,
  )
}

describe('#379 r2 — trilha da mesa vive no GRUPO PERSISTENTE', () => {
  it('#435: trilha do GRUPO migra pra SESSÃO na 1ª abertura (não vaza)', async () => {
    const repo = new InMemorySessionRepo()
    const sess = await repo.createSession({ name: 'Mesa', gmUserId: 'gm', code: 'GP1' })
    // trilha existente no GRUPO da vault (o armazenamento do #379)
    setGroupStateFull(GRUPO_CARLOS, TRILHA)
    setLiveSession(liveMesa(sess.id, '[[Carlos, Dante, Mera, Pind, Thoren]]'))
    renderView(repo, MESA_GRUPO_ID)
    // a trilha agora vive na SESSÃO desta mesa…
    await waitFor(() => {
      expect(getGroupState(`${MESA_GRUPO_ID}:${sess.id}`).hexes).toHaveLength(2)
    })
    // …e o GRUPO foi esvaziado (migração, não cópia) → outra sessão do mesmo
    // grupo NÃO recebe o histórico (fim do vazamento entre sessões)
    expect(getGroupState(GRUPO_CARLOS).hexes).toHaveLength(0)
  }, 30000)

  it('#435 anti-vazamento: 2 sessões com os MESMOS heróis NÃO compartilham a trilha', async () => {
    const repo = new InMemorySessionRepo()
    const sA = await repo.createSession({ name: 'Mesa A', gmUserId: 'gm', code: 'GPA' })
    const sB = await repo.createSession({ name: 'Mesa B', gmUserId: 'gm', code: 'GPB' })
    // a sessão A tem uma trilha própria
    setGroupStateFull(`${MESA_GRUPO_ID}:${sA.id}`, TRILHA)
    // abrir a sessão B (mesmos heróis do grupo Carlos) NÃO puxa a trilha da A
    setLiveSession(liveMesa(sB.id, '[[Carlos, Dante, Mera, Pind, Thoren]]'))
    renderView(repo, MESA_GRUPO_ID)
    await screen.findAllByText(/EXPLORAÇÃO/i)
    await new Promise((r) => setTimeout(r, 120))
    // B tem a SUA trilha (vazia); A intacta — cada sessão a sua
    expect(getGroupState(`${MESA_GRUPO_ID}:${sB.id}`).hexes).toHaveLength(0)
    expect(getGroupState(`${MESA_GRUPO_ID}:${sA.id}`).hexes).toHaveLength(2)
  }, 30000)

  it('DESCONECTADO, a ficha do grupo do Carlos mostra a trilha completa', async () => {
    // estado após a migração acima: trilha no groupState do grupo da vault
    setGroupStateFull(GRUPO_CARLOS, TRILHA)
    const repo = new InMemorySessionRepo()
    renderView(repo, GRUPO_CARLOS) // sem sessão viva
    expect(await screen.findByText(/Tumba Selada/)).toBeTruthy()
  }, 30000)

  it('caso real: sessão com 1 hex velho + remoto com a trilha → pull converge (na SESSÃO)', async () => {
    const repo = new InMemorySessionRepo()
    const sess = await repo.createSession({ name: 'Mesa', gmUserId: 'gm', code: 'GP2' })
    // a SESSÃO com trilha VELHA (1 parada) local
    setGroupStateFull(`${MESA_GRUPO_ID}:${sess.id}`, {
      hexes: [{ id: 'old', col: 1, row: 1, kind: 'parada' }],
    } as never)
    // remoto da sessão tem a trilha CONSOLIDADA com carimbo mais novo (LWW real)
    const carimboNovo = new Date(Date.now() + 60_000).toISOString()
    setLiveSession({
      ...liveMesa(sess.id, '[[Carlos, Dante, Mera, Pind, Thoren]]'),
      state: { exploracao: { ...(TRILHA as object), updatedAt: carimboNovo } } as LiveSession['state'],
    })
    renderView(repo, MESA_GRUPO_ID)
    await waitFor(() => {
      const hexes = getGroupState(`${MESA_GRUPO_ID}:${sess.id}`).hexes as { id: string }[]
      expect(hexes.map((h) => h.id)).toEqual(['h1', 'h2'])
    })
  }, 30000)

  it('mesa SEM grupo persistente segue no escopo por sessão (trap reverso)', async () => {
    const repo = new InMemorySessionRepo()
    const sess = await repo.createSession({ name: 'Mesa', gmUserId: 'gm', code: 'GP3' })
    setGroupStateFull(`${MESA_GRUPO_ID}:${sess.id}`, TRILHA)
    setLiveSession(liveMesa(sess.id, null))
    renderView(repo, MESA_GRUPO_ID)
    // nada migra pra grupo nenhum; o escopo por sessão continua o dono
    await screen.findAllByText(/EXPLORAÇÃO/i)
    expect(getGroupState(`${MESA_GRUPO_ID}:${sess.id}`).hexes).toHaveLength(2)
    expect(getGroupState(GRUPO_CARLOS).hexes).toHaveLength(0)
  }, 30000)
})
