// @vitest-environment jsdom
// MODO DEBUG: o ring buffer só captura quando LIGADO, respeita o teto, e os logs
// entram no contexto do bug report (o que o dono lê no dashboard / vai pra issue).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearLogs,
  getLogs,
  isDebugOn,
  logCount,
  pushLog,
  setDebugOn,
} from '../src/data/debug-log'
import { __setBugSenderForTests, enviarBugReport, type BugReport } from '../src/data/bug-report'

// jsdom não provê localStorage por padrão neste projeto (mesmo padrão do
// group-migrate.test): polyfill em memória.
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

beforeEach(() => {
  if (!window.localStorage) {
    Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true })
  }
  window.localStorage.clear()
  setDebugOn(false)
  clearLogs()
})
afterEach(() => {
  __setBugSenderForTests(null)
  setDebugOn(false)
  clearLogs()
})

describe('modo debug (ring buffer)', () => {
  it('desligado: pushLog é no-op', () => {
    pushLog('save', 'não deveria entrar')
    expect(logCount()).toBe(0)
  })

  it('ligado: captura e persiste o flag; desligar para de capturar', () => {
    setDebugOn(true)
    expect(isDebugOn()).toBe(true)
    pushLog('save', 'ouro publicado', { ouro: 999 })
    expect(logCount()).toBe(1)
    const [e] = getLogs()
    expect(e.tag).toBe('save')
    expect(e.msg).toContain('ouro publicado')
    expect(e.msg).toContain('999') // dado anexado em JSON
    setDebugOn(false)
    pushLog('save', 'depois de desligar')
    expect(logCount()).toBe(1) // não cresceu
  })

  it('respeita o teto do buffer (descarta os mais antigos)', () => {
    setDebugOn(true)
    for (let i = 0; i < 500; i++) pushLog('sync', `evento ${i}`)
    expect(logCount()).toBeLessThanOrEqual(400)
    // o mais novo sobrevive; o mais antigo (evento 0) foi descartado
    const logs = getLogs()
    expect(logs[logs.length - 1]!.msg).toContain('evento 499')
    expect(logs.some((l) => l.msg === 'evento 0')).toBe(false)
  })
})

describe('bug report anexa os logs quando debug ligado', () => {
  it('debug LIGADO → contexto.logs vem preenchido', async () => {
    setDebugOn(true)
    pushLog('publish', 'pushState char=abc fmBlob=true')
    let recebido: BugReport | null = null
    __setBugSenderForTests(async (r) => {
      recebido = r
    })
    await enviarBugReport('o ouro não salvou')
    const captured = recebido as unknown as BugReport
    expect(captured).not.toBeNull()
    expect(captured.contexto.logs?.length).toBe(1)
    expect(captured.contexto.logs?.[0]?.msg).toContain('pushState')
  })

  it('debug DESLIGADO → sem campo logs', async () => {
    pushLog('publish', 'ignorado (debug off)')
    let recebido: BugReport | null = null
    __setBugSenderForTests(async (r) => {
      recebido = r
    })
    await enviarBugReport('outra coisa')
    const captured = recebido as unknown as BugReport
    expect(captured.contexto.logs).toBeUndefined()
  })
})
