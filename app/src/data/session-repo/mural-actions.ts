// AÇÕES DO MURAL da sessão (2026-10-04): pôr/tirar imagem do mural — RLS
// gm-only + sala viva OTIMISTA, como o `gravar()` de aventura/session-actions.
// O mural é uma LISTA: pôr/tirar vai pelas escritas ATÔMICAS do repo
// (muralAdd/muralRemove → RPCs session_mural_add/remove), nunca reler e
// regravar a lista inteira — outro aparelho do mestre (ou outro recurso
// gravando o state) não perde nada. Puro sobre SessionRepo → testável com o
// InMemory.
import { muralJaTem, type MuralItem, type SessionRepo } from './contract'
import { getLiveSession, setLiveSession, type LiveSession } from './live-session'

/** Sala viva OTIMISTA com o mural que o servidor devolveu (ou o calculado). */
function mostrar(live: LiveSession, mural: MuralItem[]): void {
  // a sala viva pode ter andado enquanto o await rodava — parte da mais nova
  const base = getLiveSession()?.sessionId === live.sessionId ? getLiveSession()! : live
  setLiveSession({ ...base, state: { ...(base.state ?? {}), mural } })
}

async function apagarObjeto(repo: SessionRepo, url: string | undefined): Promise<void> {
  if (!url || url.startsWith('data:')) return
  try {
    await repo.removerMuralImagem(url)
  } catch (err) {
    console.warn('[mural] objeto do storage não apagado:', err)
  }
}

/** Mesma imagem = mesmo alvo da vault (ou mesma url, pra item sem alvo). */
export function noMural(mural: readonly MuralItem[] | undefined, chave: { target?: string; url?: string }): boolean {
  return muralJaTem(mural, chave)
}

/** Põe uma imagem no mural. `imagem` (Blob já comprimido) = figura CIFRADA:
 *  sobe pro Storage e o item guarda a url pública; sem ela, o item guarda só o
 *  alvo da vault. Imagem que já está lá = no-op (nem sobe de novo; se só deu
 *  pra saber DEPOIS do upload, o objeto recém-subido é apagado). */
export async function adicionarAoMural(
  repo: SessionRepo,
  live: LiveSession,
  entrada: { target?: string; url?: string; legenda?: string; imagem?: Blob },
): Promise<'adicionado' | 'ja-estava'> {
  const chave = { target: entrada.target, url: entrada.url }
  if (noMural(live.state?.mural, chave)) return 'ja-estava'
  if (entrada.imagem) {
    // poupa o upload se o servidor já tem a imagem (a sala viva pode estar velha)
    try {
      const sess = await repo.findSessionById(live.sessionId)
      if (noMural(sess?.state.mural, chave)) return 'ja-estava'
    } catch {
      /* servidor fora — o muralAdd decide */
    }
  }
  const url = entrada.imagem ? await repo.uploadMuralImagem(live.sessionId, entrada.imagem) : entrada.url
  const item: MuralItem = { id: crypto.randomUUID(), em: new Date().toISOString() }
  if (entrada.target) item.target = entrada.target
  if (url) item.url = url
  if (entrada.legenda) item.legenda = entrada.legenda
  let mural: MuralItem[] | null
  try {
    mural = await repo.muralAdd(live.sessionId, item)
  } catch (err) {
    if (entrada.imagem) await apagarObjeto(repo, url)
    throw err
  }
  if (!mural) {
    if (entrada.imagem) await apagarObjeto(repo, url)
    throw new Error('[mural] sem permissão pra editar o mural desta sessão')
  }
  mostrar(live, mural)
  if (mural.some((m) => m.id === item.id)) return 'adicionado'
  // duplicado descoberto no servidor (outro aparelho pôs a mesma imagem)
  if (entrada.imagem) await apagarObjeto(repo, url)
  return 'ja-estava'
}

/** Tira um item do mural; se a imagem morava no Storage, apaga o objeto
 *  também (best-effort — o item sai do mural mesmo se o storage falhar). */
export async function removerDoMural(repo: SessionRepo, live: LiveSession, id: string): Promise<void> {
  const local = live.state?.mural?.find((m) => m.id === id)
  const removido = await repo.muralRemove(live.sessionId, id)
  const base = getLiveSession()?.sessionId === live.sessionId ? getLiveSession()! : live
  mostrar(live, (base.state?.mural ?? []).filter((m) => m.id !== id))
  await apagarObjeto(repo, (removido ?? local)?.url)
}
