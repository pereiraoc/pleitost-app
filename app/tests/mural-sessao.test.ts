// @vitest-environment node
// MURAL DA SESSÃO (2026-10-04): um mural POR SESSÃO em `state.mural` — o
// mestre põe imagens pros jogadores verem e tira quando quiser. Imagem PÚBLICA
// da vault vai só como `target` (cada aparelho resolve no próprio manifesto);
// imagem CIFRADA de aventura (jogador não tem a chave) sobe pro bucket `mural`
// e o item guarda a `url`. Harness: InMemory + cliente que re-busca a cada
// notify (espelho do LiveSessionBridge, como o session-multiuser.test).
import { describe, expect, it } from 'vitest'
import { InMemorySessionRepo } from '../src/data/session-repo/in-memory'
import type { MuralItem } from '../src/data/session-repo/contract'
import { adicionarAoMural, removerDoMural } from '../src/data/session-repo/mural-actions'
import { getLiveSession, setLiveSession, type LiveSession } from '../src/data/session-repo/live-session'

async function setup() {
  const repo = new InMemorySessionRepo()
  const sess = await repo.createSession({ name: 'Mesa', gmUserId: 'gm', code: 'MU1' })
  const live: LiveSession = { sessionId: sess.id, state: {}, gmUserId: 'gm', characters: [], members: [], encounters: [] }
  setLiveSession(live)
  return { repo, sessId: sess.id, live }
}

function makeClient(repo: InMemorySessionRepo, sessId: string) {
  const view = { mural: [] as MuralItem[] }
  const refetch = async () => {
    view.mural = (await repo.findSessionById(sessId))?.state.mural ?? []
  }
  const off = repo.subscribe(sessId, () => void refetch())
  return { view, refetch, off }
}

describe('mural da sessão', () => {
  it('GM põe imagem pública → o jogador vê; GM tira → some', async () => {
    const { repo, sessId, live } = await setup()
    const jogador = makeClient(repo, sessId)
    const r = await adicionarAoMural(repo, live, { target: 'Mapa do Porto.png', legenda: 'O porto' })
    expect(r).toBe('adicionado')
    await jogador.refetch()
    expect(jogador.view.mural).toHaveLength(1)
    expect(jogador.view.mural[0]).toMatchObject({ target: 'Mapa do Porto.png', legenda: 'O porto' })
    expect(jogador.view.mural[0]!.url).toBeUndefined()
    // otimista: a sala viva do GM já mostra
    expect(getLiveSession()?.state?.mural).toHaveLength(1)
    expect(repo.muralUploads).toHaveLength(0)

    await removerDoMural(repo, getLiveSession()!, jogador.view.mural[0]!.id)
    await jogador.refetch()
    expect(jogador.view.mural).toHaveLength(0)
    jogador.off()
  })

  it('pôr a mesma imagem de novo é no-op', async () => {
    const { repo, sessId, live } = await setup()
    await adicionarAoMural(repo, live, { target: 'A.png' })
    const r = await adicionarAoMural(repo, live, { target: 'A.png' })
    expect(r).toBe('ja-estava')
    expect((await repo.findSessionById(sessId))!.state.mural).toHaveLength(1)
  })

  it('não apaga o que outro aparelho do GM pôs (relê o state antes de gravar)', async () => {
    const { repo, sessId, live } = await setup()
    // outro aparelho gravou direto no servidor; a sala viva deste aparelho está velha
    await repo.updateSessionState(sessId, { mural: [{ id: 'x', target: 'Outro.png', em: '2026-10-04T00:00:00Z' }] })
    await adicionarAoMural(repo, live, { target: 'Novo.png' })
    const mural = (await repo.findSessionById(sessId))!.state.mural!
    expect(mural.map((m) => m.target).sort()).toEqual(['Novo.png', 'Outro.png'])
  })

  it('imagem cifrada sobe pro storage e o item guarda a url; tirar apaga o objeto', async () => {
    const { repo, sessId, live } = await setup()
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' })
    await adicionarAoMural(repo, live, { target: 'Nico.png', legenda: 'Nico', imagem: blob })
    expect(repo.muralUploads).toHaveLength(1)
    expect(repo.muralUploads[0]!.sessionId).toBe(sessId)
    const item = (await repo.findSessionById(sessId))!.state.mural![0]!
    expect(item.url).toBe(repo.muralUploads[0]!.url)
    // de novo (mesmo alvo) → nem sobe
    expect(await adicionarAoMural(repo, getLiveSession()!, { target: 'Nico.png', imagem: blob })).toBe('ja-estava')
    expect(repo.muralUploads).toHaveLength(1)

    await removerDoMural(repo, getLiveSession()!, item.id)
    expect(repo.muralRemovidos).toEqual([item.url])
    expect((await repo.findSessionById(sessId))!.state.mural).toEqual([])
  })
})
