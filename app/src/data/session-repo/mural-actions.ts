// AÇÕES DO MURAL da sessão (2026-10-04): pôr/tirar imagem do mural — mesmo
// molde do `gravar()` de aventura/session-actions (updateSessionState da chave
// `mural`, RLS gm-only, + sala viva OTIMISTA). A diferença: o mural é uma
// LISTA, e o updateSessionState troca a chave inteira — então relê o mural do
// servidor logo antes de gravar (outro aparelho do mestre pode ter posto algo
// que a sala viva deste ainda não viu). Puro sobre SessionRepo → testável com
// o InMemory.
import type { MuralItem, SessionRepo, SessionState } from './contract'
import { getLiveSession, setLiveSession, type LiveSession } from './live-session'

async function muralAtual(repo: SessionRepo, live: LiveSession): Promise<MuralItem[]> {
  try {
    const sess = await repo.findSessionById(live.sessionId)
    if (sess) return sess.state.mural ?? []
  } catch {
    /* servidor fora — cai na sala viva */
  }
  return live.state?.mural ?? []
}

async function gravar(repo: SessionRepo, live: LiveSession, mural: MuralItem[]): Promise<void> {
  await repo.updateSessionState(live.sessionId, { mural } as Partial<SessionState>)
  // a sala viva pode ter andado enquanto o await rodava — parte da mais nova
  const base = getLiveSession()?.sessionId === live.sessionId ? getLiveSession()! : live
  setLiveSession({ ...base, state: { ...(base.state ?? {}), mural } })
}

/** Mesma imagem = mesmo alvo da vault (ou mesma url, pra item sem alvo). */
export function noMural(mural: readonly MuralItem[] | undefined, chave: { target?: string; url?: string }): boolean {
  return (mural ?? []).some((m) => (chave.target ? m.target === chave.target : !!chave.url && m.url === chave.url))
}

/** Põe uma imagem no mural. `imagem` (Blob já comprimido) = figura CIFRADA:
 *  sobe pro Storage e o item guarda a url pública; sem ela, o item guarda só o
 *  alvo da vault. Imagem que já está lá = no-op (nem sobe de novo). */
export async function adicionarAoMural(
  repo: SessionRepo,
  live: LiveSession,
  entrada: { target?: string; url?: string; legenda?: string; imagem?: Blob },
): Promise<'adicionado' | 'ja-estava'> {
  const chave = { target: entrada.target, url: entrada.url }
  if (noMural(live.state?.mural, chave)) return 'ja-estava'
  const antes = await muralAtual(repo, live)
  if (noMural(antes, chave)) return 'ja-estava'
  const url = entrada.imagem ? await repo.uploadMuralImagem(live.sessionId, entrada.imagem) : entrada.url
  const item: MuralItem = { id: crypto.randomUUID(), em: new Date().toISOString() }
  if (entrada.target) item.target = entrada.target
  if (url) item.url = url
  if (entrada.legenda) item.legenda = entrada.legenda
  // relê de novo: o upload pode levar segundos
  const depois = entrada.imagem ? await muralAtual(repo, live) : antes
  await gravar(repo, live, [...depois, item])
  return 'adicionado'
}

/** Tira um item do mural; se a imagem morava no Storage, apaga o objeto
 *  também (best-effort — o item sai do mural mesmo se o storage falhar). */
export async function removerDoMural(repo: SessionRepo, live: LiveSession, id: string): Promise<void> {
  const antes = await muralAtual(repo, live)
  const item = antes.find((m) => m.id === id) ?? live.state?.mural?.find((m) => m.id === id)
  await gravar(
    repo,
    live,
    antes.filter((m) => m.id !== id),
  )
  if (item?.url && !item.url.startsWith('data:')) {
    try {
      await repo.removerMuralImagem(item.url)
    } catch (err) {
      console.warn('[mural] objeto do storage não apagado:', err)
    }
  }
}
