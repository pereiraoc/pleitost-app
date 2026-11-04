// PORTÃO DE LOGIN (2026-11-04): o app inteiro exige login do GitHub — o dono
// quer saber sempre quem está usando. Rota-raiz do router: sem sessão, a ÚNICA
// coisa na tela é o "Sign in with GitHub"; com sessão, o <Outlet /> normal.
//
// Retorno do OAuth: o redirect volta SEMPRE pra BASE (oauthRedirectUrl — é a
// URL liberada no Supabase), então a página pedida fica guardada em
// sessionStorage no clique e o gate navega pra ela quando a sessão chega.
// Enquanto o client lê o code/token da URL o estado é 'loading' (o callback
// nunca vê a tela de login nem o redirect '/' → '/compendio' antes da hora).
// Assets estáticos (vault-data, ícones, SW) não passam pelo router.
import { useEffect, useState, type CSSProperties } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { loginGitHub, useAuthStatus } from '../../data/session-repo/auth-state'
import { clip } from '../mestre/ui'

const RETURN_KEY = 'pleitost.auth.returnTo'

function readReturnTo(): string | null {
  try {
    return sessionStorage.getItem(RETURN_KEY)
  } catch {
    return null
  }
}
function writeReturnTo(path: string): void {
  try {
    if (path && path !== '/') sessionStorage.setItem(RETURN_KEY, path)
    else sessionStorage.removeItem(RETURN_KEY)
  } catch {
    /* sem sessionStorage: volta pra home */
  }
}
function clearReturnTo(): void {
  try {
    sessionStorage.removeItem(RETURN_KEY)
  } catch {
    /* sem sessionStorage */
  }
}

/** Erro devolvido pelo provider no retorno do OAuth (?error_description= ou
 *  #error_description=), pra não cair calado na tela de login de novo. */
function oauthErrorFromUrl(): string | null {
  try {
    const q = new URLSearchParams(window.location.search)
    const h = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    return q.get('error_description') ?? h.get('error_description') ?? q.get('error') ?? h.get('error')
  } catch {
    return null
  }
}

const screen: CSSProperties = {
  minHeight: '100dvh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '32px 16px',
  background: 'var(--bg)',
  color: 'var(--text)',
  fontFamily: 'var(--body)',
}
const card: CSSProperties = {
  width: '100%',
  maxWidth: 360,
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  padding: '28px 24px',
  background: 'var(--card)',
  border: '1px solid var(--line2)',
  clipPath: clip(12),
}
const kicker: CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: '.12em',
  color: 'var(--muted)',
}
const mono: CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 12,
  letterSpacing: '.1em',
  color: 'var(--muted)',
}

function Loading() {
  return (
    <div style={screen} role="status">
      <span style={mono}>loading…</span>
    </div>
  )
}

/** Tela de login — a única coisa visível sem sessão. */
export function SignInScreen({ unconfigured = false }: { unconfigured?: boolean }) {
  const location = useLocation()
  const [erro, setErro] = useState<string | null>(() => oauthErrorFromUrl())
  const [indo, setIndo] = useState(false)

  const entrar = () => {
    setErro(null)
    setIndo(true)
    writeReturnTo(location.pathname + location.search + location.hash)
    loginGitHub().catch((e) => {
      setIndo(false)
      setErro(String(e?.message ?? e))
    })
  }

  return (
    <main style={screen}>
      <div style={card}>
        <span style={kicker}>// PLEITOST</span>
        <h1 style={{ margin: 0, fontFamily: 'var(--display)', fontSize: 22, fontWeight: 700 }}>Sign in required</h1>
        {unconfigured ? (
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--muted)' }}>
            Sign-in is not available: this build has no server configured.
          </p>
        ) : (
          <>
            <p style={{ margin: 0, fontSize: 13.5, color: 'var(--muted)' }}>
              Sign in with your GitHub account to use the app.
            </p>
            <button
              type="button"
              onClick={entrar}
              disabled={indo}
              style={{
                padding: '10px 14px',
                background: 'color-mix(in srgb,var(--accent) 16%,var(--card))',
                border: '1px solid color-mix(in srgb,var(--accent) 45%,var(--line2))',
                color: 'var(--accent)',
                cursor: indo ? 'wait' : 'pointer',
                fontWeight: 600,
                fontSize: 13,
                clipPath: clip(7),
              }}
            >
              {indo ? 'Redirecting to GitHub…' : 'Sign in with GitHub'}
            </button>
          </>
        )}
        {erro ? (
          <span role="alert" style={{ ...mono, fontSize: 11, letterSpacing: '.04em', color: 'var(--red)' }}>
            {erro}
          </span>
        ) : null}
      </div>
    </main>
  )
}

/** Rota-raiz: libera o app só com sessão do GitHub. */
export function AuthGate() {
  const status = useAuthStatus()
  const navigate = useNavigate()
  // página pedida antes do redirect do OAuth (lida 1x: o retorno recarrega o app)
  const [voltarPara, setVoltarPara] = useState<string | null>(() => readReturnTo())

  useEffect(() => {
    if (status !== 'signed-in' || !voltarPara) return
    clearReturnTo()
    // libera o <Outlet /> só depois da navegação (sem flash da home)
    void Promise.resolve(navigate(voltarPara, { replace: true })).then(() => setVoltarPara(null))
  }, [status, voltarPara, navigate])

  if (status === 'loading') return <Loading />
  if (status === 'signed-out') return <SignInScreen />
  if (status === 'unconfigured') return <SignInScreen unconfigured />
  if (voltarPara) return <Loading />
  return <Outlet />
}
