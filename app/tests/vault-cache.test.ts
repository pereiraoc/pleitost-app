// @vitest-environment jsdom
// FRESCOR do cache vault-data (report 2026-08-15): o SW serve os JSONs como
// StaleWhileRevalidate e um deploy de database só aparecia UMA visita depois.
// ensureFreshVaultData compara o db-version.json (rede direta) com o último
// visto e purga o cache 'vault-data' quando muda — na MESMA visita.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ensureFreshVaultData } from '../src/data/vault-cache'

/** Polyfill de localStorage (vitest 4 + jsdom, mesmo idioma dos demais testes). */
beforeAll(() => {
  if (!window.localStorage) {
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

const KEY = 'pleitost.dbVersionVista'

function mockStamp(extractedAt: string | null, ok = true) {
  globalThis.fetch = vi.fn(async () => ({
    ok,
    json: async () => (extractedAt ? { extractedAt } : {}),
  })) as unknown as typeof fetch
}

const deleted: string[] = []
beforeEach(() => {
  deleted.length = 0
  Object.defineProperty(globalThis, 'caches', {
    configurable: true,
    value: {
      delete: async (name: string) => {
        deleted.push(name)
        return true
      },
    },
  })
  window.localStorage?.removeItem(KEY)
})
afterEach(() => {
  Object.defineProperty(globalThis, 'caches', { configurable: true, value: undefined })
})

describe('ensureFreshVaultData', () => {
  it('database NOVA (stamp mudou) → purga o cache vault-data e memoriza', async () => {
    window.localStorage.setItem(KEY, '2026-08-01T00:00:00.000Z')
    mockStamp('2026-08-15T12:00:00.000Z')
    await ensureFreshVaultData()
    expect(deleted).toEqual(['vault-data'])
    expect(window.localStorage.getItem(KEY)).toBe('2026-08-15T12:00:00.000Z')
  })

  it('mesmo stamp → NÃO purga (offline-first preservado)', async () => {
    window.localStorage.setItem(KEY, '2026-08-15T12:00:00.000Z')
    mockStamp('2026-08-15T12:00:00.000Z')
    await ensureFreshVaultData()
    expect(deleted).toEqual([])
  })

  it('primeira visita (sem stamp visto) → purga uma vez e memoriza', async () => {
    mockStamp('2026-08-15T12:00:00.000Z')
    await ensureFreshVaultData()
    expect(deleted).toEqual(['vault-data'])
  })

  it('rede fora / resposta ruim → segue sem purgar (não quebra o boot)', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch
    await expect(ensureFreshVaultData()).resolves.toBeUndefined()
    expect(deleted).toEqual([])
    mockStamp(null) // stamp sem extractedAt
    await ensureFreshVaultData()
    expect(deleted).toEqual([])
  })
})
