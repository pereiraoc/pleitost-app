// @vitest-environment jsdom
// N4: report do autor logado com GitHub abre a issue DIRETO no repo, como ele
// (provider_token). Aqui: o módulo github-issue (guardar token, POST na API) e o
// branch do enviarBugReport que usa o GitHub e cai no anônimo quando não há token.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  canOpenGitHubIssue,
  clearGitHubToken,
  gitHubLogin,
  openGitHubIssue,
  setGitHubToken,
} from '../src/data/github-issue'
import { enviarBugReport } from '../src/data/bug-report'
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

beforeEach(() => {
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    if (!window[name]) Object.defineProperty(window, name, { value: makeStorage(), configurable: true })
    window[name].clear()
  }
  clearGitHubToken()
  setDebugOn(false)
})
afterEach(() => {
  vi.restoreAllMocks()
  clearGitHubToken()
})

describe('github-issue: token + criação', () => {
  it('sem token: não pode abrir issue', () => {
    expect(canOpenGitHubIssue()).toBe(false)
  })

  it('setGitHubToken guarda token+login e IGNORA null (não apaga um token bom)', () => {
    setGitHubToken('tkn', 'fulano')
    expect(canOpenGitHubIssue()).toBe(true)
    expect(gitHubLogin()).toBe('fulano')
    setGitHubToken(null) // TOKEN_REFRESHED sem provider_token não deve limpar
    expect(canOpenGitHubIssue()).toBe(true)
    clearGitHubToken() // logout limpa
    expect(canOpenGitHubIssue()).toBe(false)
  })

  it('openGitHubIssue faz POST autenticado e devolve number+url', async () => {
    setGitHubToken('tkn-123', 'fulano')
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ number: 42, html_url: 'https://github.com/pereiraoc/pleitost-app/issues/42' }), {
        status: 201,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const issue = await openGitHubIssue('titulo', 'corpo')
    expect(issue).toEqual({ number: 42, url: 'https://github.com/pereiraoc/pleitost-app/issues/42' })
    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toContain('/repos/pereiraoc/pleitost-app/issues')
    expect((init as RequestInit).method).toBe('POST')
    expect((init as RequestInit & { headers: Record<string, string> }).headers.Authorization).toBe('Bearer tkn-123')
  })

  it('openGitHubIssue lança em 403 (escopo faltando) — chamador faz fallback', async () => {
    setGitHubToken('tkn', 'x')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('no scope', { status: 403 })))
    await expect(openGitHubIssue('t', 'b')).rejects.toThrow(/403/)
  })
})

describe('enviarBugReport: escolhe o canal', () => {
  it('autor logado com GitHub → abre issue e retorna canal github', async () => {
    setGitHubToken('tkn', 'fulano')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ number: 7, html_url: 'https://github.com/pereiraoc/pleitost-app/issues/7' }), {
          status: 201,
        }),
      ),
    )
    const r = await enviarBugReport('cliquei e sumiu')
    expect(r).toEqual({ canal: 'github', url: 'https://github.com/pereiraoc/pleitost-app/issues/7', number: 7 })
  })
})
