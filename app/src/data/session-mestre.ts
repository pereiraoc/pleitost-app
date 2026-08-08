// #440 — o Modo Mestre é DEFINIDO pela SESSÃO ATIVA: conectado como GM →
// mestre ligado; conectado como jogador → desligado; fora de sessão → toggle
// livre. Deriva de live.gmUserId (autor da sessão) vs o usuário logado.
import { useLiveSession } from './session-repo/live-session'
import { useSupabaseUser } from './session-repo/auth-state'

/** Papel do usuário na sessão ativa. `locked` = há sessão viva com papel
 *  determinável (gmUserId + usuário logado) — aí o Modo Mestre é forçado pelo
 *  papel e o toggle do CONFIG fica travado. `roleMestre` = é o GM da sessão. */
export function useIsSessionMestre(): { locked: boolean; roleMestre: boolean } {
  const live = useLiveSession()
  const user = useSupabaseUser()
  const locked = !!live?.sessionId && !!user && !!live.gmUserId
  const roleMestre = locked && live!.gmUserId === user!.id
  return { locked, roleMestre }
}
