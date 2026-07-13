// Provider do SessionRepo — a UI consome SEMPRE via contexto (nunca importa
// Supabase direto): produção usa o SupabaseSessionRepo do env; testes/E2E
// injetam o InMemorySessionRepo (dois "clientes" compartilham a mesma
// instância pra simular a mesa). null = servidor não configurado → a SESSÃO
// funciona no modo local-first (session-store), sem sync.
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { SessionRealtime, SessionRepo } from './contract'
import { supabaseSessionRepo } from './supabase'
import { useSupabaseUser, type SessionUser } from './auth-state'

export type SessionRepoCtx = (SessionRepo & SessionRealtime) | null

const Ctx = createContext<SessionRepoCtx | undefined>(undefined)
const UserCtx = createContext<SessionUser | null | undefined>(undefined)

export function SessionRepoProvider({
  repo,
  user,
  children,
}: {
  /** Injeção pra teste; ausente = Supabase do env (ou null sem env). */
  repo?: SessionRepoCtx
  /** Usuário FAKE pros testes (InMemory não tem auth); ausente = Supabase. */
  user?: SessionUser | null
  children: ReactNode
}) {
  const value = useMemo<SessionRepoCtx>(() => (repo !== undefined ? repo : supabaseSessionRepo()), [repo])
  return (
    <Ctx.Provider value={value}>
      <UserCtx.Provider value={user}>{children}</UserCtx.Provider>
    </Ctx.Provider>
  )
}

export function useSessionRepo(): SessionRepoCtx {
  const v = useContext(Ctx)
  // fora do provider (testes antigos/telas isoladas) = sem servidor
  return v === undefined ? null : v
}

/** Usuário da sessão: fake injetado (testes) OU o do Supabase. */
export function useSessionUser(): SessionUser | null {
  const injected = useContext(UserCtx)
  const supa = useSupabaseUser()
  return injected !== undefined ? injected : supa
}
