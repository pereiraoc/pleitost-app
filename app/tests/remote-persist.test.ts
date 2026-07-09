// @vitest-environment jsdom
// Persistência durável (#84): o localStorage vira espelho de /app-state — hidrata
// do servidor ao abrir (preenche o que falta) e espelha cada gravação de volta.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetPersistForTests,
  hydrateFromServer,
  installPersistMirror,
} from '../src/data/remote-persist'

// jsdom pode não prover localStorage — polyfill em window (como os outros testes)
beforeAll(() => {
  if (typeof window !== 'undefined' && !window.localStorage) {
    const data = new Map<string, string>()
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        get length() {
          return data.size
        },
        clear: () => data.clear(),
        getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
        key: (i: number) => [...data.keys()][i] ?? null,
        removeItem: (k: string) => void data.delete(k),
        setItem: (k: string, v: string) => void data.set(k, String(v)),
      },
    })
  }
})
const store = () => window.localStorage

interface Call {
  method: string
  body?: Record<string, unknown>
}

function mockFetch(getData: Record<string, string>): Call[] {
  const calls: Call[] = []
  globalThis.fetch = vi.fn(async (_url: unknown, opts?: { method?: string; body?: string }) => {
    const method = (opts?.method ?? 'GET').toUpperCase()
    calls.push({ method, body: opts?.body ? JSON.parse(opts.body) : undefined })
    if (method === 'GET') return { ok: true, json: async () => getData } as unknown as Response
    return { ok: true } as unknown as Response
  }) as unknown as typeof fetch
  return calls
}

beforeEach(() => {
  store().clear()
  __resetPersistForTests()
})
afterEach(() => {
  __resetPersistForTests()
  vi.useRealTimers()
})

describe('remote-persist (#84)', () => {
  it('hidrata preenchendo as chaves AUSENTES do servidor, sem sobrescrever local', async () => {
    store().setItem('pleitost.heroEdits.carlos', 'LOCAL') // já existe local
    mockFetch({
      'pleitost.groupState.g1': 'CAMINHO',
      'pleitost.heroEdits.carlos': 'SERVER', // NÃO deve sobrescrever o local
      'fora.do.namespace': 'X', // ignorado
    })
    await hydrateFromServer()
    expect(store().getItem('pleitost.groupState.g1')).toBe('CAMINHO') // preenchido
    expect(store().getItem('pleitost.heroEdits.carlos')).toBe('LOCAL') // preservado
    expect(store().getItem('fora.do.namespace')).toBeNull()
  })

  it('espelha setItem/removeItem das chaves do app pro servidor + bootstrap', async () => {
    vi.useFakeTimers()
    store().setItem('pleitost.hexMap.r1', 'EXISTIA') // deve entrar no bootstrap
    const calls = mockFetch({})
    installPersistMirror()

    // bootstrap: manda o estado local atual pro servidor (síncrono)
    const boot = calls.find((c) => c.method === 'PUT')
    expect(boot?.body).toMatchObject({ 'pleitost.hexMap.r1': 'EXISTIA' })

    // grava/apaga chaves → sincroniza após o debounce; chave fora do namespace não
    store().setItem('pleitost.groupState.g1', 'NOVO CAMINHO')
    store().setItem('nao.sincroniza', 'ZZZ')
    store().removeItem('pleitost.hexMap.r1')
    vi.advanceTimersByTime(600)

    const last = calls.filter((c) => c.method === 'PUT').pop()
    expect(last?.body).toMatchObject({ 'pleitost.groupState.g1': 'NOVO CAMINHO', 'pleitost.hexMap.r1': null })
    expect(Object.keys(last?.body ?? {})).not.toContain('nao.sincroniza')
    // e o localStorage real continua funcionando por baixo do espelho
    expect(store().getItem('pleitost.groupState.g1')).toBe('NOVO CAMINHO')
    expect(store().getItem('pleitost.hexMap.r1')).toBeNull()
  })
})
