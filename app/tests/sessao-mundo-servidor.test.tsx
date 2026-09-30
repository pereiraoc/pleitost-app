// @vitest-environment jsdom
// #573 — o MUNDO da sessão vive também no servidor (state.mundo): criar
// carimba; o espelho de outro aparelho adota; e o GM etiqueta uma sessão
// legada (sem mundo no servidor) com o mundo do registro local dele, pra os
// outros aparelhos pararem de mostrá-la como fantasia.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { SessionRepoProvider } from '../src/data/session-repo/provider'
import { InMemorySessionRepo } from '../src/data/session-repo/in-memory'
import { setLiveSession } from '../src/data/session-repo/live-session'
import { LiveSessionBridge } from '../src/components/sessao/SessaoPage'
import { __resetSessionStoreForTests, espelharSessaoRemota, getSession, joinSessionByCode, updateSession } from '../src/data/session-store'
import { __resetThemeForTests } from '../src/theme'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const manifest = JSON.parse(fs.readFileSync(path.join(path.dirname(appDir), 'vault-data', 'index.json'), 'utf8')) as IndexManifest
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
  if (!window.localStorage) Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true })
})
beforeEach(() => {
  window.localStorage.clear()
  __resetThemeForTests()
  __resetSessionStoreForTests()
  setLiveSession(null)
})
afterEach(() => {
  cleanup()
  setLiveSession(null)
})

const bridge = (repo: InMemorySessionRepo, userId: string) =>
  render(
    <CatalogProvider catalog={catalog}>
      <SessionRepoProvider repo={repo} user={{ id: userId, nome: 'GM' }}>
        <MemoryRouter>
          <LiveSessionBridge />
        </MemoryRouter>
      </SessionRepoProvider>
    </CatalogProvider>,
  )

describe('#573 — mundo da sessão no servidor', () => {
  it('createSession aceita state (mundo) e o espelho de outro aparelho adota esse mundo', async () => {
    const repo = new InMemorySessionRepo()
    const sess = await repo.createSession({ name: 'POA', gmUserId: 'gm', code: 'DAMPGU', state: { mundo: 'cyberpunk' } })
    expect((await repo.findSessionById(sess.id))?.state.mundo).toBe('cyberpunk')
    await repo.insertMember({ sessionId: sess.id, userId: 'gm', role: 'gm', displayName: 'GM' })
    // outro aparelho (sem registro local) lista as sessões do usuário
    bridge(repo, 'gm')
    await waitFor(() => expect(getSession('DAMPGU')).toBeTruthy())
    expect(getSession('DAMPGU')?.world).toBe('cyberpunk')
  })
  it('sessão LEGADA sem mundo no servidor: o GM etiqueta com o mundo do registro local dele', async () => {
    const repo = new InMemorySessionRepo()
    const sess = await repo.createSession({ name: 'POA antiga', gmUserId: 'gm', code: 'LEGPOA' })
    await repo.insertMember({ sessionId: sess.id, userId: 'gm', role: 'gm', displayName: 'GM' })
    // no aparelho do GM a mesa foi criada no mundo POA (registro local com world)
    const local = joinSessionByCode('LEGPOA')
    updateSession(local.codigo, { remoteId: sess.id, world: 'cyberpunk' })
    bridge(repo, 'gm')
    await waitFor(async () => expect((await repo.findSessionById(sess.id))?.state.mundo).toBe('cyberpunk'))
  })
  it('jogador (não GM) NÃO etiqueta o servidor; e o espelho local sem mundo adota o do servidor', async () => {
    const repo = new InMemorySessionRepo()
    const sess = await repo.createSession({ name: 'Mesa', gmUserId: 'gm', code: 'JOGADR', state: { mundo: 'cyberpunk' } })
    await repo.insertMember({ sessionId: sess.id, userId: 'p1', role: 'player', displayName: 'Ana' })
    // registro local LEGADO (espelho antigo, sem mundo)
    const local = espelharSessaoRemota('JOGADR')!
    updateSession(local.codigo, { remoteId: sess.id })
    expect(getSession('JOGADR')?.world).toBeUndefined()
    bridge(repo, 'p1')
    await waitFor(() => expect(getSession('JOGADR')?.world).toBe('cyberpunk'))
    expect((await repo.findSessionById(sess.id))?.state.mundo).toBe('cyberpunk')
  })
})
