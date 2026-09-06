// AÇÕES DE SESSÃO do formato de aventura (2026-09-05): iniciar/avançar/encerrar
// a aventura em curso — cada uma é 1 `updateSessionState` com patch mínimo da
// chave `aventura` (RLS gm-only) + atualização OTIMISTA da sessão viva (o
// compêndio não assina o realtime; a página da Sessão reconcilia). Puro sobre
// SessionRepo → testável com o InMemory.
import type { SessionRepo, SessionState } from '../data/session-repo/contract'
import { setLiveSession, type LiveSession } from '../data/session-repo/live-session'

type AventuraState = NonNullable<SessionState['aventura']>

async function gravar(repo: SessionRepo, live: LiveSession, aventura: AventuraState | undefined): Promise<void> {
  await repo.updateSessionState(live.sessionId, { aventura } as Partial<SessionState>)
  setLiveSession({ ...live, state: { ...(live.state ?? {}), aventura } })
}

export function aventuraAtual(live: LiveSession | null): AventuraState | null {
  return live?.state?.aventura ?? null
}

/** Inicia a aventura na mesa (cena atual = null → Abertura; a 1ª cena entra
 *  com "próxima"). Reiniciar a mesma aventura zera o progresso. */
export async function iniciarAventura(repo: SessionRepo, live: LiveSession, docId: string, titulo: string): Promise<void> {
  await gravar(repo, live, { docId, titulo, cenaAtual: null, concluidas: [], iniciadaEm: new Date().toISOString() })
}

/** Vai pra cena `slug`; a cena anterior (se houver) entra em `concluidas`. */
export async function irParaCena(repo: SessionRepo, live: LiveSession, slug: string | null): Promise<void> {
  const atual = aventuraAtual(live)
  if (!atual) return
  const concluidas = atual.cenaAtual && atual.cenaAtual !== slug && !atual.concluidas.includes(atual.cenaAtual)
    ? [...atual.concluidas, atual.cenaAtual]
    : atual.concluidas
  await gravar(repo, live, { ...atual, cenaAtual: slug, concluidas })
}

export async function encerrarAventura(repo: SessionRepo, live: LiveSession): Promise<void> {
  await gravar(repo, live, undefined)
}
