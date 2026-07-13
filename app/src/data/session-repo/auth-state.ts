// Estado de AUTH da sessão — usuário do Supabase (GitHub OAuth ou anônimo)
// como um store observável, com injeção de fake pros testes (InMemory não tem
// auth — o teste passa {id, nome} direto no SessionRepoProvider).
import { useSyncExternalStore } from 'react'
import { supabaseClient, signInWithGitHub } from './supabase'

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
          nome:
            (u.user_metadata?.['name'] as string | undefined) ??
            (u.user_metadata?.['user_name'] as string | undefined) ??
            nickname() ??
            'Convidado',
        }
      : null
    emit()
  })
  sb.auth.onAuthStateChange((_ev, session) => {
    const u = session?.user
    cache = u
      ? {
          id: u.id,
          nome:
            (u.user_metadata?.['name'] as string | undefined) ??
            (u.user_metadata?.['user_name'] as string | undefined) ??
            nickname() ??
            'Convidado',
        }
      : null
    emit()
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
  cache = null
  emit()
}
