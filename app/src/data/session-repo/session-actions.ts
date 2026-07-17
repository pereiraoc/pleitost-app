// Ações de saída da sessão — espelham o pleitost-sync (view.ts): DESCONECTAR
// (fica no histórico), ABANDONAR (jogador sai do server) e ENCERRAR (o CRIADOR
// acaba a mesa pra todos). Server-side é best-effort: se o repo falhar, o
// histórico local some do mesmo jeito (o usuário não fica preso na sessão).
import type { SessionRepo } from './contract'
import { deleteSession, setActiveSessionCode } from '../session-store'

/** ↩ Desconectar — só desativa a sessão ativa; membership e histórico intactos.
 *  Volta pra LISTA DE SESSÕES, onde as sessões já entradas seguem pra rejoin. */
export function disconnectSession(): void {
  setActiveSessionCode(null)
}

/** 🚪 Abandonar (jogador) — sai do server (removeMember) e tira a sessão do
 *  histórico local; a mesa continua existindo pros outros. */
export async function abandonSession(
  repo: SessionRepo | null,
  remoteId: string | undefined,
  userId: string | undefined,
  codigo: string,
): Promise<void> {
  if (repo && remoteId && userId) {
    try {
      await repo.removeMember(remoteId, userId)
    } catch {
      /* server indisponível — ainda assim sai do histórico local */
    }
  }
  deleteSession(codigo) // já zera a sessão ativa se for a atual
}

/** ⛔ Encerrar (criador/gm) — endSession no server (a mesa some pra todos) e
 *  tira do histórico local. */
export async function endSessionAsGm(
  repo: SessionRepo | null,
  remoteId: string | undefined,
  codigo: string,
): Promise<void> {
  if (repo && remoteId) {
    try {
      await repo.endSession(remoteId)
    } catch {
      /* server indisponível — ainda assim sai do histórico local */
    }
  }
  deleteSession(codigo)
}

/** É o CRIADOR da mesa (mestre-de-fato), não confundir com o toggle Modo Mestre
 *  da ficha. Conectado: o papel vem de live.gmUserId. Offline: fallback pelo
 *  nome do criador guardado na sessão local. */
export function isSessionCreator(
  live: { gmUserId: string | null } | null,
  user: { id: string; nome: string } | null,
  sess: { mestre: string },
): boolean {
  if (!user) return false
  if (live?.gmUserId) return live.gmUserId === user.id
  return !!sess.mestre && sess.mestre === user.nome
}
