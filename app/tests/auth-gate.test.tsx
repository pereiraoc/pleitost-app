// @vitest-environment jsdom
// PORTÃO DE LOGIN (2026-11-04): o app inteiro exige login do GitHub. Sem
// sessão a única coisa na tela é o "Sign in with GitHub"; com sessão, a rota
// pedida; o retorno do OAuth ('loading' enquanto o client lê a URL) nunca é
// bloqueado e volta pra página guardada antes do redirect.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { AuthGate, RequireLogin } from '../src/components/layout/AuthGate'

const login = vi.hoisted(() => vi.fn(() => new Promise<void>(() => {})))
vi.mock('../src/data/session-repo/supabase', async (orig) => ({
  ...(await orig<typeof import('../src/data/session-repo/supabase')>()),
  signInWithGitHub: login,
  // client falso: o logout não pode bater no Supabase de verdade
  supabaseClient: () => ({ auth: { signOut: async () => ({ error: null }) } }),
}))

import { __setAuthStatusForTests, logoutSessao } from '../src/data/session-repo/auth-state'

function montar(path: string) {
  const router = createMemoryRouter(
    [
      {
        element: <AuthGate />,
        children: [
          { path: '/', element: <p>home</p> },
          { path: '/compendio', element: <p>compendio</p> },
          { path: '/heroi/*', element: <p>ficha do heroi</p> },
          { path: '/papel/*', element: <p>ficha de papel</p> },
        ],
      },
    ],
    { initialEntries: [path] },
  )
  render(<RouterProvider router={router} />)
  return router
}

beforeEach(() => {
  sessionStorage.clear()
  login.mockClear()
})
afterEach(() => cleanup())

describe('AuthGate — login do GitHub obrigatório', () => {
  it('deslogado: só a tela de login, nenhum conteúdo (inclusive rota fora do AppShell)', () => {
    __setAuthStatusForTests('signed-out')
    montar('/compendio')
    expect(screen.getByRole('button', { name: 'Sign in with GitHub' })).toBeTruthy()
    expect(screen.queryByText('compendio')).toBeNull()
    cleanup()
    montar('/papel/heroi-x')
    expect(screen.getByRole('button', { name: 'Sign in with GitHub' })).toBeTruthy()
    expect(screen.queryByText('ficha de papel')).toBeNull()
  })

  it('logado: mostra a rota pedida', () => {
    __setAuthStatusForTests('signed-in')
    montar('/compendio')
    expect(screen.getByText('compendio')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Sign in with GitHub' })).toBeNull()
  })

  it('clique guarda a página pedida e dispara o OAuth do GitHub', () => {
    __setAuthStatusForTests('signed-out')
    montar('/heroi/ana?aba=perfil')
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with GitHub' }))
    expect(login).toHaveBeenCalledTimes(1)
    expect(sessionStorage.getItem('pleitost.auth.returnTo')).toBe('/heroi/ana?aba=perfil')
  })

  it('callback do OAuth não é bloqueado: loading → sessão → volta pra página pedida', async () => {
    sessionStorage.setItem('pleitost.auth.returnTo', '/heroi/ana')
    __setAuthStatusForTests('loading')
    const router = montar('/')
    // enquanto o client lê o code/token da URL: nem login nem conteúdo
    expect(screen.queryByRole('button', { name: 'Sign in with GitHub' })).toBeNull()
    expect(screen.queryByText('home')).toBeNull()
    act(() => __setAuthStatusForTests('signed-in'))
    expect(router.state.location.pathname).toBe('/heroi/ana')
    expect(await screen.findByText('ficha do heroi')).toBeTruthy()
    expect(sessionStorage.getItem('pleitost.auth.returnTo')).toBeNull()
  })

  it('logout/sessão expirada volta pra tela de login', async () => {
    __setAuthStatusForTests('signed-in')
    montar('/compendio')
    expect(screen.getByText('compendio')).toBeTruthy()
    act(() => __setAuthStatusForTests('signed-out'))
    expect(screen.getByRole('button', { name: 'Sign in with GitHub' })).toBeTruthy()
    expect(screen.queryByText('compendio')).toBeNull()
    // logout explícito também tranca (mesmo sem o evento SIGNED_OUT chegar)
    act(() => __setAuthStatusForTests('signed-in'))
    await act(() => logoutSessao())
    expect(screen.getByRole('button', { name: 'Sign in with GitHub' })).toBeTruthy()
  })

  it('build sem Supabase: tranca com aviso, sem botão', () => {
    __setAuthStatusForTests('unconfigured')
    montar('/compendio')
    expect(screen.queryByText('compendio')).toBeNull()
    expect(screen.getByText(/no server configured/)).toBeTruthy()
  })

  it('erro devolvido pelo GitHub no retorno aparece na tela de login', () => {
    window.history.replaceState(null, '', '/?error=access_denied&error_description=User+denied+access')
    __setAuthStatusForTests('signed-out')
    montar('/')
    expect(screen.getByRole('alert').textContent).toBe('User denied access')
    window.history.replaceState(null, '', '/')
  })
})

describe('RequireLogin — portão antes do catálogo (05/11)', () => {
  it('sem sessão mostra o login e não monta o app (nada do mundo é baixado)', () => {
    act(() => __setAuthStatusForTests('signed-out'))
    const montou = vi.fn()
    function App() {
      montou()
      return <p>app</p>
    }
    render(
      <RequireLogin>
        <App />
      </RequireLogin>,
    )
    expect(screen.getByText('Sign in required')).toBeTruthy()
    expect(montou).not.toHaveBeenCalled()
  })

  it('com sessão monta o app', () => {
    act(() => __setAuthStatusForTests('signed-in'))
    render(
      <RequireLogin>
        <p>app</p>
      </RequireLogin>,
    )
    expect(screen.getByText('app')).toBeTruthy()
  })
})
