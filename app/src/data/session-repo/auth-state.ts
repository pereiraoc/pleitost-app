// Estado de AUTH da sessão — usuário do Supabase (GitHub OAuth ou anônimo)
// como um store observável, com injeção de fake pros testes (InMemory não tem
// auth — o teste passa {id, nome} direto no SessionRepoProvider).
import { useSyncExternalStore } from 'react'
import { supabaseClient, signInWithGitHub } from './supabase'
import { connectUserStateSync } from '../remote-persist'
import { clearGitHubLogin, setGitHubLogin } from '../github-login'

export interface SessionUser {
  id: string
  /** Nome exibível (GitHub name/login; convidado usa o nickname digitado). */
  nome: string
}

let cache: SessionUser | null = null
let started = false
const listeners = new Set<() => void>()

/** PORTÃO DE LOGIN (2026-11-04): estado da sessão pro gate do app inteiro.
 *  'loading' = o client ainda não decidiu (inclui o retorno do OAuth, enquanto
 *  o Supabase lê o code/token da URL); 'unconfigured' = build sem Supabase. */
export type AuthStatus = 'loading' | 'signed-in' | 'signed-out' | 'unconfigured'
let status: AuthStatus = 'loading'

function emit() {
  for (const l of listeners) l()
}

/** Nickname do convidado (anônimo não tem nome no provider) — local. */
const NICK_KEY = 'pleitost.sessao.nickname'
export function setNickname(nick: string): void {
  try {
    localStorage.setItem(NICK_KEY, nick)
  } catch {
    /* sem storage */
  }
  if (cache) cache = { ...cache, nome: nick || cache.nome }
  emit()
}
function nickname(): string {
  try {
    return localStorage.getItem(NICK_KEY) ?? ''
  } catch {
    return ''
  }
}

/** Nome exibível robusto: 1º candidato NÃO-vazio. #291: `?? ` deixava passar
 *  string vazia ('' não é nullish), então uma conta GitHub sem `name`/`user_name`
 *  e sem nick virava display_name '' — que viola o CHECK não-vazio do
 *  session_members no join. Aqui `.trim()` garante um nome de verdade. */
export function displayNameOf(u: { user_metadata?: Record<string, unknown> } | null | undefined): string {
  const cands = [u?.user_metadata?.['name'], u?.user_metadata?.['user_name'], nickname()]
  for (const c of cands) if (typeof c === 'string' && c.trim()) return c
  return 'Convidado'
}

function start() {
  if (started) return
  started = true
  const sb = supabaseClient()
  if (!sb) {
    status = 'unconfigured'
    emit()
    return
  }
  // estado inicial + mudanças (login GitHub volta por redirect; anônimo é imediato)
  void sb.auth.getUser().then(({ data }) => {
    const u = data.user
    cache = u
      ? {
          id: u.id,
          nome: displayNameOf(u),
        }
      : null
    emit()
    // #239: logado → espelho por conta (heróis/anotações entre dispositivos)
    void connectUserStateSync(cache?.id ?? null)
  })
  sb.auth.onAuthStateChange((_ev, session) => {
    const u = session?.user
    // Login do GitHub (user_name) atribui o report (contexto.reporter);
    // null não apaga — o logout limpa explicitamente.
    setGitHubLogin(typeof u?.user_metadata?.['user_name'] === 'string' ? (u.user_metadata['user_name'] as string) : null)
    cache = u
      ? {
          id: u.id,
          nome: displayNameOf(u),
        }
      : null
    // Gate: a SESSÃO local decide (INITIAL_SESSION chega depois de o client
    // processar o retorno do OAuth na URL; SIGNED_OUT cobre logout e refresh
    // token expirado/revogado). Não usa o getUser() acima: offline ele falha
    // e trancaria o PWA de quem já está logado.
    status = session ? 'signed-in' : 'signed-out'
    // #291: mantém o token do REALTIME em dia. Sem isso, no refresh de token
    // (~1h) o socket segue com o JWT velho e o realtime RLS-gated PARA de
    // entregar eventos no meio da mesa (turno/HP/revelação não chegam). O
    // onAuthStateChange dispara em INITIAL_SESSION/SIGNED_IN/TOKEN_REFRESHED.
    try {
      const rt = (sb as { realtime?: { setAuth?: (t: string | null) => void } }).realtime
      rt?.setAuth?.(session?.access_token ?? null)
    } catch {
      /* versão sem realtime.setAuth: ignora */
    }
    emit()
    void connectUserStateSync(cache?.id ?? null)
  })
}

/** SÓ testes: define o usuário atual sem passar pelo Supabase. */
export function __setUserForTests(user: SessionUser | null): void {
  cache = user
  emit()
}

/** SÓ testes: define o estado do portão de login sem passar pelo Supabase. */
export function __setAuthStatusForTests(next: AuthStatus): void {
  started = true
  status = next
  emit()
}

function subscribe(cb: () => void): () => void {
  start()
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** Estado da sessão pro portão de login (AuthGate). */
export function useAuthStatus(): AuthStatus {
  return useSyncExternalStore(subscribe, () => status)
}

/** Usuário atual do Supabase (null = deslogado/sem servidor). */
export function useSupabaseUser(): SessionUser | null {
  return useSyncExternalStore(subscribe, () => cache)
}

export async function loginGitHub(): Promise<void> {
  await signInWithGitHub()
}

export async function logoutSessao(): Promise<void> {
  const sb = supabaseClient()
  if (sb) await sb.auth.signOut()
  clearGitHubLogin()
  cache = null
  if (sb) status = 'signed-out'
  emit()
}
