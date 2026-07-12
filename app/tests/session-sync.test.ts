// @vitest-environment jsdom
// Sync remoto da sessão (#101b) — adapter com WebSocket/fetch FAKES:
//   - device login: guarda token+user após o poll autorizar;
//   - sala: sessão remota aplica nos campos locais; volátil de herói remoto
//     entra via hero-store com origem 'sync' e NÃO ecoa de volta;
//   - write local Interativa.* é encaminhado pra sala.
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import {
  __resetSessionStoreForTests,
  getSession,
  joinSessionByCode,
} from '../src/data/session-store'
import { __resetHeroStoreMemoryForTests, getHeroEdits, writeHeroEdit } from '../src/data/hero-store'
import {
  connectSessionSync,
  getServerAuth,
  logoutServer,
  setServerUrl,
  startDeviceLogin,
} from '../src/data/session-sync'

class FakeWS {
  static instances: FakeWS[] = []
  static OPEN = 1
  readyState = 1
  sent: string[] = []
  onmessage: ((ev: { data: string }) => void) | null = null
  url: string
  constructor(url: string) {
    this.url = url
    FakeWS.instances.push(this)
  }
  send(s: string) {
    this.sent.push(s)
  }
  close() {
    this.readyState = 3
  }
  emit(msg: unknown) {
    this.onmessage?.({ data: JSON.stringify(msg) })
  }
}

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

beforeEach(() => {
  if (!window.localStorage) {
    Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true })
  }
  window.localStorage.clear()
  __resetSessionStoreForTests()
  __resetHeroStoreMemoryForTests()
  logoutServer()
  FakeWS.instances = []
  vi.stubGlobal('WebSocket', FakeWS as unknown as typeof WebSocket)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('login por device flow', () => {
  it('guarda token+user quando o poll autoriza', async () => {
    setServerUrl('http://srv:8787')
    let polls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).endsWith('/auth/device')) {
          return {
            ok: true,
            json: async () => ({
              device_code: 'dev1',
              user_code: 'AB-12',
              verification_uri: 'https://github.com/login/device',
              interval: 0.01,
              expires_in: 60,
            }),
          }
        }
        if (String(url).endsWith('/auth/poll')) {
          polls++
          return {
            ok: true,
            json: async () =>
              polls < 2 ? { pending: true } : { token: 'tok1', user: { login: 'octavio', name: 'Octavio', avatar: '' } },
          }
        }
        throw new Error(`fetch inesperado ${url}`)
      }),
    )
    const d = await startDeviceLogin()
    expect(d.userCode).toBe('AB-12')
    const user = await d.finish
    expect(user.login).toBe('octavio')
    expect(getServerAuth()?.token).toBe('tok1')
  })
})

describe('sala viva', () => {
  function setupAuthed() {
    setServerUrl('http://srv:8787')
    window.localStorage.setItem(
      'pleitost.serverAuth',
      JSON.stringify({ token: 'tok1', user: { login: 'octavio', name: 'Octavio', avatar: '' } }),
    )
    logoutServer() // limpa cache…
    window.localStorage.setItem(
      'pleitost.serverAuth',
      JSON.stringify({ token: 'tok1', user: { login: 'octavio', name: 'Octavio', avatar: '' } }),
    )
  }

  it('sessão remota aplica campos locais; hero volátil entra sem ecoar', () => {
    setupAuthed()
    joinSessionByCode('ROOM01')
    const cleanup = connectSessionSync('ROOM01')
    const ws = FakeWS.instances[0]
    expect(ws.url).toContain('code=ROOM01')
    expect(ws.url).toContain('token=tok1')

    ws.emit({
      t: 'session',
      sess: {
        codigo: 'ROOM01',
        nome: 'Mesa do Octavio',
        grupoId: 'G/x',
        mestre: 'octavio',
        init: { 'Heróis/Carlos': 18 },
        round: 2,
        vezIdx: 1,
        claims: { octavio: ['Heróis/Carlos'] },
        membros: ['octavio'],
        heroVol: { 'Heróis/Carlos': { 'Interativa.Recursos_Restantes.Vitalidade': 7 } },
        rev: 4,
      },
    })
    const local = getSession('ROOM01')!
    expect(local.nome).toBe('Mesa do Octavio')
    expect(local.round).toBe(2)
    expect(local.init['Heróis/Carlos']).toBe(18)
    // volátil aplicado no hero-store…
    expect(getHeroEdits('Heróis/Carlos').fm['Interativa.Recursos_Restantes.Vitalidade']).toBe(7)
    // …sem eco (writes de origem 'sync' não voltam pra sala)
    expect(ws.sent.filter((s) => s.includes('"t":"hero"')).length).toBe(0)

    // write LOCAL de vida é encaminhado
    writeHeroEdit('Heróis/Carlos', 'fm', 'Interativa.Recursos_Restantes.Vitalidade', 5, {
      channel: 'autosave',
      origem: 'combate',
    })
    const heroMsgs = ws.sent.filter((s) => s.includes('"t":"hero"'))
    expect(heroMsgs.length).toBe(1)
    expect(JSON.parse(heroMsgs[0]).value).toBe(5)

    // cleanup desliga o forward
    cleanup()
    writeHeroEdit('Heróis/Carlos', 'fm', 'Interativa.Recursos_Restantes.Vitalidade', 4, {
      channel: 'autosave',
      origem: 'combate',
    })
    expect(ws.sent.filter((s) => s.includes('"t":"hero"')).length).toBe(1)
  })

  it('writes que NÃO são Interativa.* não vazam pra sala', () => {
    setupAuthed()
    joinSessionByCode('ROOM02')
    const cleanup = connectSessionSync('ROOM02')
    const ws = FakeWS.instances[0]
    writeHeroEdit('Heróis/Carlos', 'fm', 'Nível', 9, { channel: 'imediato', origem: 'perfil' })
    expect(ws.sent.filter((s) => s.includes('"t":"hero"')).length).toBe(0)
    cleanup()
  })
})
