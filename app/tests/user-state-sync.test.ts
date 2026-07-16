// @vitest-environment jsdom
// DADOS ENTRE DISPOSITIVOS (#239) — req do usuário: "abri minha conta em
// outro dispositivo e não ta aparecendo as minhas coisas (tem que mostrar
// tudo que eu fiz entre dispositivos, tipo meus herois, anotações, etc)".
// O espelho do remote-persist (#84) ganha o canal POR CONTA (user_state no
// Supabase, RLS por usuário): login hidrata as chaves AUSENTES do local e
// cada flush espelha o patch pra linha da conta.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  connectUserStateSync,
  installPersistMirror,
  __putUserPatchForTests,
  __resetPersistForTests,
  __setUserStateOpsForTests,
} from '../src/data/remote-persist'

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
  // o espelho do /app-state (dev) não interessa aqui
  globalThis.fetch = (async () => ({ ok: false, status: 404, json: async () => ({}) })) as typeof fetch
})

beforeEach(() => {
  vi.useFakeTimers()
  window.localStorage.clear()
  __resetPersistForTests()
})
afterEach(() => {
  vi.useRealTimers()
  __resetPersistForTests()
  __setUserStateOpsForTests(null)
})

function fakeServer(inicial: Record<string, string> = {}) {
  const data: Record<string, string> = { ...inicial }
  const puts: Array<Record<string, string | null>> = []
  __setUserStateOpsForTests({
    async get() {
      return { ...data }
    },
    async put(_u, patch) {
      puts.push(patch)
      for (const [k, v] of Object.entries(patch)) {
        if (v === null) delete data[k]
        else data[k] = v
      }
    },
  })
  return { data, puts }
}

describe('espelho por conta (#239)', () => {
  it('dispositivo novo: login hidrata heróis/anotações da conta no localStorage', async () => {
    const heroi = JSON.stringify({ 'local:Heroi:abc': { id: 'local:Heroi:abc', basename: 'Dante' } })
    fakeServer({
      'pleitost.localEntities': heroi,
      'pleitost.settings.mestre': 'true',
      'nao-sincronizada': 'x',
    })
    const added: string[] = []
    await connectUserStateSync('u-1', (a) => added.push(...a))
    expect(window.localStorage.getItem('pleitost.localEntities')).toBe(heroi)
    expect(window.localStorage.getItem('pleitost.settings.mestre')).toBe('true')
    // chave fora do namespace do app NÃO entra
    expect(window.localStorage.getItem('nao-sincronizada')).toBeNull()
    expect(added).toContain('pleitost.localEntities')
  })

  it('local existente NUNCA é sobrescrito pela conta (preenche só o que falta)', async () => {
    window.localStorage.setItem('pleitost.settings.mestre', 'false')
    fakeServer({ 'pleitost.settings.mestre': 'true', 'pleitost.hexMap.X': '{"cells":[]}' })
    await connectUserStateSync('u-1', () => {})
    expect(window.localStorage.getItem('pleitost.settings.mestre')).toBe('false')
    expect(window.localStorage.getItem('pleitost.hexMap.X')).toBe('{"cells":[]}')
  })

  it('gravações locais espelham pra conta (flush debounced) e remoção apaga', async () => {
    const srv = fakeServer()
    await connectUserStateSync('u-1', () => {})
    installPersistMirror()
    await vi.runAllTimersAsync() // bootstrap
    window.localStorage.setItem('pleitost.groupState.g1', '{"hexes":[]}')
    await vi.runAllTimersAsync()
    expect(srv.data['pleitost.groupState.g1']).toBe('{"hexes":[]}')
    window.localStorage.removeItem('pleitost.groupState.g1')
    await vi.runAllTimersAsync()
    expect(srv.data['pleitost.groupState.g1']).toBeUndefined()
  })

  it('deslogado: nada vai pra conta', async () => {
    const srv = fakeServer()
    await connectUserStateSync(null, () => {})
    installPersistMirror()
    window.localStorage.setItem('pleitost.settings.mestre', 'true')
    await vi.runAllTimersAsync()
    expect(srv.puts).toHaveLength(0)
  })

  it('#291: putUserPatch serializa os read-merge-write (nunca 2 puts ao mesmo tempo)', async () => {
    vi.useRealTimers() // o put finge latência com setTimeout real
    let active = 0
    let maxActive = 0
    __setUserStateOpsForTests({
      async get() {
        return null
      },
      async put() {
        active++
        maxActive = Math.max(maxActive, active)
        await new Promise((r) => setTimeout(r, 10))
        active--
      },
    })
    await connectUserStateSync('u-1', () => {}) // seta sbUserId (bootstrap put já resolveu)
    // dois flushes concorrentes: sem serialização, os dois read-merge-write se
    // sobreporiam (maxActive = 2) e um clobberaria o outro.
    await Promise.all([__putUserPatchForTests({ a: '1' }), __putUserPatchForTests({ b: '2' })])
    expect(maxActive).toBe(1)
  })
})
