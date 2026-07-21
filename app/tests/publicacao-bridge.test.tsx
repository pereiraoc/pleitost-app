// @vitest-environment jsdom
// F1 do plano #347 — report 174e3531: "a Mera fez alterações na ficha dela…
// o resumo não mostra a ficha atualizada da mesa". Raiz: a PUBLICAÇÃO
// (usePublicacao) vivia na SessaoPage, que DESMONTA quando o usuário troca a
// sidebar direita pra DETALHES (justamente o gesto de abrir o resumo de um
// colega) — edições feitas nesse estado não publicavam nada. O fix move a
// publicação pro LiveSessionBridge (headless, monta sempre).
//
// Este teste renderiza SÓ o <LiveSessionBridge/> — NENHUMA SessaoPage — e
// prova que uma edição do herói (ouro) chega no backend via
// updateCharacterFmBlob. Antes do fix, isto era impossível.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { CatalogProvider } from '../src/data/CatalogContext'
import { SessionRepoProvider } from '../src/data/session-repo/provider'
import { InMemorySessionRepo } from '../src/data/session-repo/in-memory'
import { getLiveSession, setLiveSession } from '../src/data/session-repo/live-session'
import { LiveSessionBridge } from '../src/components/sessao/SessaoPage'
import { writeHeroEdit, __resetHeroStoreMemoryForTests } from '../src/data/hero-store'
import {
  __resetLocalStoreForTests,
  createLocalEntity,
  emptyHeroFrontmatter,
} from '../src/data/local-entities'
import {
  __resetSessionStoreForTests,
  createSession as createLocalSession,
  setActiveSessionCode,
  updateSession,
} from '../src/data/session-store'
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
})
afterEach(() => {
  cleanup()
  setLiveSession(null)
})

describe('F1 — publicação vive no LiveSessionBridge (sem SessaoPage)', () => {
  it('edição de ouro publica o fmBlob com a SessaoPage DESMONTADA', async () => {
    // backend compartilhado + sessão com o herói LOCAL do jogador p1
    const repo = new InMemorySessionRepo()
    const sess = await repo.createSession({ name: 'Mesa', gmUserId: 'gm', code: 'F1TEST' })
    await repo.insertMember({ sessionId: sess.id, userId: 'p1', role: 'player', displayName: 'Mera' })
    // createLocalEntity retorna o ID da entidade local ('local:Heroi:…')
    const heroId = createLocalEntity('Heroi', 'Mera Local', {
      ...emptyHeroFrontmatter(),
      Inventario: { Ouro: 10, Tesouros: [] },
    })
    const char = await repo.insertCharacter({
      sessionId: sess.id,
      memberId: 'p1',
      kind: 'heroi',
      tutorCharacterId: null,
      characterPath: heroId,
      visibility: 'visible',
      summary: { nome: 'Mera Local' } as never,
      state: { recursosRestantes: {}, condicoesAtivas: {}, efeitosAtivos: {}, invocacoesAtivas: {} } as never,
      fmBlob: { Inventario: { Ouro: 10, Tesouros: [] } },
    })
    // sessão ATIVA no dispositivo (o bridge segue active.remoteId)
    const local = createLocalSession('Mesa', null, 'gm')
    updateSession(local.codigo, { remoteId: sess.id })
    setActiveSessionCode(local.codigo)

    const spy = vi.spyOn(repo, 'updateCharacterFmBlob')

    // SÓ o bridge — nenhuma SessaoPage/SalaRemota na árvore.
    render(
      <CatalogProvider catalog={catalog}>
        <SessionRepoProvider repo={repo} user={{ id: 'p1', nome: 'Mera' }}>
          <MemoryRouter>
            <LiveSessionBridge />
          </MemoryRouter>
        </SessionRepoProvider>
      </CatalogProvider>,
    )
    // bridge alimenta o live e o publish inicial roda (meuChar resolvido)
    await waitFor(() => expect(getLiveSession()?.characters.length).toBe(1))
    await waitFor(() => expect(spy).toHaveBeenCalled())
    spy.mockClear()

    // A EDIÇÃO do report: ouro muda fora da aba sessão → tem que publicar.
    writeHeroEdit(heroId, 'fm', 'Inventario.Ouro', 999, { channel: 'user', origem: 'inventario' })
    await waitFor(() => expect(spy).toHaveBeenCalled())
    const publicado = spy.mock.calls.at(-1)![1] as Record<string, any>
    expect(publicado.Inventario?.Ouro).toBe(999)
    // e o backend guarda o valor (o que o GM/colega vai ler no resumo)
    const chars = await repo.findCharactersBySession(sess.id)
    expect((chars.find((c) => c.id === char.id)?.fmBlob as any)?.Inventario?.Ouro).toBe(999)
  })
})
