// @vitest-environment jsdom
// Report sem permissão extra do GitHub (2026-10-08): o login pede só a
// identidade (sem `public_repo`); o report vai SEMPRE pra tabela bug_reports
// com o LOGIN de quem mandou (contexto.reporter) — a issue é aberta na triagem.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearGitHubLogin, gitHubLogin, setGitHubLogin } from '../src/data/github-login'
import { __setBugSenderForTests, enviarBugReport, type BugReport } from '../src/data/bug-report'
import { setDebugOn } from '../src/data/debug-log'

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

let enviados: BugReport[] = []
beforeEach(() => {
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    if (!window[name]) Object.defineProperty(window, name, { value: makeStorage(), configurable: true })
    window[name].clear()
  }
  clearGitHubLogin()
  setDebugOn(false)
  enviados = []
  __setBugSenderForTests(async (r) => void enviados.push(r))
})
afterEach(() => {
  vi.restoreAllMocks()
  clearGitHubLogin()
  __setBugSenderForTests(null)
})

describe('login do GitHub (só identidade)', () => {
  it('guarda o login; null não apaga; logout limpa', () => {
    expect(gitHubLogin()).toBeNull()
    setGitHubLogin('fulano')
    expect(gitHubLogin()).toBe('fulano')
    setGitHubLogin(null)
    expect(gitHubLogin()).toBe('fulano')
    clearGitHubLogin()
    expect(gitHubLogin()).toBeNull()
  })
})

describe('enviarBugReport', () => {
  it('vai pro canal do Supabase com o login de quem mandou, sem chamar a API do GitHub', async () => {
    setGitHubLogin('fulano')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const r = await enviarBugReport('cliquei e sumiu', 'sugestao')
    expect(r).toEqual({ canal: 'anon' })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(enviados).toHaveLength(1)
    expect(enviados[0]!.contexto.reporter).toBe('fulano')
    expect(enviados[0]!.contexto.tipo).toBe('sugestao')
  })
  it('convidado (sem login): sem reporter', async () => {
    await enviarBugReport('x')
    expect(enviados[0]!.contexto.reporter).toBeUndefined()
  })
})
