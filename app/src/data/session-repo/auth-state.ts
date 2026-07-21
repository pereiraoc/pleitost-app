// Estado de AUTH da sessão — usuário do Supabase (GitHub OAuth ou anônimo)
// como um store observável, com injeção de fake pros testes (InMemory não tem
// auth — o teste passa {id, nome} direto no SessionRepoProvider).
import { useSyncExternalStore } from 'react'
import { supabaseClient, signInWithGitHub } from './supabase'
import { connectUserStateSync } from '../remote-persist'
import { clearGitHubToken, setGitHubToken } from '../github-issue'

export interface SessionUser {
  id: string
  /** Nome exibível (GitHub name/login; convidado usa o nickname digitado). */
  nome: string
}

let cache: SessionUser | null = null
let started = false
const listeners = new Set<() => void>()

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
  if (!sb) return
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
    // N4: captura o provider_token do GitHub (só vem no SIGNED_IN/refresh) pra
    // o report abrir a issue como o próprio autor. O login (user_name) rotula a
    // UI ("aberta como @fulano"). setGitHubToken ignora null (não apaga um token
    // bom num TOKEN_REFRESHED); o logout limpa explicitamente.
    setGitHubToken(
      session?.provider_token ?? null,
      typeof u?.user_metadata?.['user_name'] === 'string' ? (u.user_metadata['user_name'] as string) : null,
    )
    cache = u
      ? {
          id: u.id,
          nome: displayNameOf(u),
        }
      : null
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

/** Usuário atual do Supabase (null = deslogado/sem servidor). */
export function useSupabaseUser(): SessionUser | null {
  return useSyncExternalStore(
    (cb) => {
      start()
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => cache,
  )
}

export async function loginGitHub(): Promise<void> {
  await signInWithGitHub()
}


export async function logoutSessao(): Promise<void> {
  const sb = supabaseClient()
  if (sb) await sb.auth.signOut()
  clearGitHubToken()
  cache = null
  emit()
}
