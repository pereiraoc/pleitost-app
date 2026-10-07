// @vitest-environment jsdom
// MEIO DO TRECHO na MESA CONECTADA (report 2026-10-06: "não tô conseguindo de
// forma alguma mudar o método de viagem"): a trilha só é editável na sessão
// viva, então o caminho real do user é escolher → push (setExploracao) →
// realtime devolve o state (jsonb REORDENA as chaves) → efeito de sync do
// GrupoView compara/puxa. O meio escolhido tem que sobreviver ao ciclo,
// inclusive a um snapshot VELHO que chega depois da escolha.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
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
import { GrupoView } from '../src/grupo/GrupoView'
import { getGroupState, setGroupStateFull, __resetGroupStoreMemoryForTests } from '../src/data/group-store'
import { setActiveContexto } from '../src/data/reskin'
import { __resetSettingsForTests } from '../src/settings'
import type { ContextoDef } from '../src/data/context-def'
import type { IndexManifest } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
const baseCatalog = buildCatalog(manifest)

const DEF: ContextoDef = {
  id: 'fantasia',
  nome: 'Fantasia',
  fonte: 'Contexto Fantasia.md',
  moeda: { simbolo: 'PO', nome: 'Peças de Ouro' },
  atlas: { raiz: 'Atlas', mapa: null },
  pericias: {},
  reskin: { notas: {}, notasFuturas: {}, termos: {}, excecoes: [] },
  disponibilidade: { padrao: 'disponivel', indisponiveis: [], restritos: {} },
  base: { sempreDisponiveis: [] },
  viagem: {
    padrao: 'normal',
    terrenos: [
      { chave: 'normal', nome: 'Gramado', custo: 1, cor: '#7fb069' },
      { chave: 'dificil', nome: 'Difícil', custo: 2, cor: '#2f6b3a' },
      { chave: 'muito_dificil', nome: 'Montanha', custo: 3, cor: '#8a6a4a' },
      { chave: 'mar', nome: 'Mar', custo: 3, cor: '#4a90c2', agua: true, custoPorMeio: { Barco: 1 } },
    ],
    rotas: [
      { chave: 'estrada', nome: 'Estrada', cor: '#c9a36b', bonus: 1, meios: ['Cavalo', 'Caravana'] },
      { chave: 'rota_maritima', nome: 'Rota marítima', cor: '#ffffff', bonus: 1, meios: ['Barco'] },
    ],
    meios: [
      { nome: 'A pé', icone: '🚶', padrao: true, hexPorDia: 2, em: ['normal', 'dificil', 'muito_dificil'], costa: true },
      { nome: 'Cavalo', icone: '🐎', hexPorDia: 3, em: ['normal', 'dificil'] },
      {
        nome: 'Caravana',
        icone: '🐪',
        padrao: true,
        hexPorDia: 4,
        em: ['normal', 'dificil', 'muito_dificil'],
        soEmRota: 'estrada',
        antigos: ['Carruagem'],
      },
      { nome: 'Barco', icone: '⛵', padrao: true, hexPorDia: 5, em: ['mar'], costa: true, antigos: ['Navio'] },
    ],
    terreno: 'Terreno do Mundo Livre',
  },
} as ContextoDef

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
  if (!window.PointerEvent) {
    Object.defineProperty(window, 'PointerEvent', { value: window.MouseEvent, configurable: true })
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
  __resetGroupStoreMemoryForTests()
  setLiveSession(null)
})
afterEach(() => {
  cleanup()
  setLiveSession(null)
  setActiveContexto(null)
})

/** jsonb do Postgres: chaves ordenadas por (tamanho, bytes) — o que o
 *  realtime devolve depois do RPC. */
function comoJsonb(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(comoJsonb)
  if (v && typeof v === 'object') {
    const ks = Object.keys(v).sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0))
    return Object.fromEntries(ks.map((k) => [k, comoJsonb((v as Record<string, unknown>)[k])]))
  }
  return v
}

const TRILHA = {
  grade: 'mundo',
  hexes: [
    { id: 'a', col: 60, row: 20, kind: 'parada', label: 'Início' },
    { id: 'b', col: 60, row: 21, kind: 'caminho' },
    { id: 'c', col: 60, row: 22, kind: 'parada', label: 'Meio' },
  ],
}

function live(sessionId: string, state: Record<string, unknown>): LiveSession {
  return { sessionId, state: state as LiveSession['state'], gmUserId: 'gm', characters: [], members: [], encounters: [] }
}

function renderMesa(repo: InMemorySessionRepo) {
  setActiveContexto(DEF)
  return render(
    <CatalogProvider catalog={{ ...baseCatalog, contextoDef: DEF }}>
      <SessionRepoProvider repo={repo}>
        <MemoryRouter>
          <GrupoView groupId={MESA_GRUPO_ID} />
        </MemoryRouter>
      </SessionRepoProvider>
    </CatalogProvider>,
  )
}

async function cenario(carimboRemoto: string) {
  const repo = new InMemorySessionRepo()
  const sess = await repo.createSession({ name: 'Mesa', gmUserId: 'gm', code: 'MEI1' })
  const exploId = `${MESA_GRUPO_ID}:${sess.id}`
  // já sincronizado: remoto = local (no formato jsonb), mesmo carimbo
  const R0 = comoJsonb({ ...TRILHA, updatedAt: carimboRemoto, grupoId: exploId }) as Record<string, unknown>
  await repo.setExploracao(sess.id, R0 as never)
  setGroupStateFull(exploId, R0 as never)
  setLiveSession(live(sess.id, { exploracao: R0 }))
  const { container } = renderMesa(repo)
  await waitFor(() => expect(container.querySelector('[data-editar-trilha]')).not.toBeNull())
  fireEvent.click(container.querySelector('[data-editar-trilha]')!)
  fireEvent.click(container.querySelector('[data-meio-trecho="c"]')!)
  fireEvent.click(container.querySelector('[data-meio-opcao="Cavalo"]')!)
  const meioLocal = () => getGroupState(exploId).hexes.find((h) => h.id === 'c')?.meio
  const meioRemoto = async () =>
    ((await repo.findSessionById(sess.id))!.state.exploracao as { hexes: { id: string; meio?: string }[] }).hexes.find(
      (h) => h.id === 'c',
    )?.meio
  expect(meioLocal()).toBe('Cavalo')
  await waitFor(async () => expect(await meioRemoto()).toBe('Cavalo'))
  // snapshot VELHO chega depois (refetch disparado antes do RPC + outra chave mudou)
  setLiveSession(live(sess.id, { exploracao: comoJsonb(R0), mural: [{ id: 'x' }] }))
  await new Promise((r) => setTimeout(r, 50))
  // …e então o realtime do próprio RPC
  const R1 = comoJsonb((await repo.findSessionById(sess.id))!.state.exploracao)
  setLiveSession(live(sess.id, { exploracao: R1, mural: [{ id: 'x' }] }))
  await new Promise((r) => setTimeout(r, 50))
  expect(meioLocal()).toBe('Cavalo')
  expect(await meioRemoto()).toBe('Cavalo')
  await waitFor(() => expect(container.querySelector('[data-viagem-trecho="c"]')!.textContent).toBe('🐎 ⅔ dia'))
}

describe('meio do trecho na mesa conectada (sync da trilha)', () => {
  it('escolha sobrevive a push → snapshot velho → realtime (relógios iguais)', async () => {
    await cenario(new Date(Date.now() - 60_000).toISOString())
  }, 30000)

  it('escolha sobrevive mesmo com o carimbo remoto À FRENTE do relógio deste aparelho', async () => {
    await cenario(new Date(Date.now() + 5 * 60_000).toISOString())
  }, 30000)
})
