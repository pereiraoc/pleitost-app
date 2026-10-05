// @vitest-environment node
// ESCRITA ATÔMICA DO STATE DA SESSÃO + MURAL (2026-10-04). updateSessionState
// fazia SELECT state → merge no cliente → UPDATE do state INTEIRO: qualquer
// escrita entre a leitura e o UPDATE era desfeita (o jogador anda na trilha
// enquanto o mestre empurra o mapa → a trilha volta). Agora vai pela RPC
// `session_state_patch` (state || patch, um UPDATE no servidor) e o mural pelas
// RPCs session_mural_add/remove; projeto sem as funções (PGRST202) → caminho
// antigo. Harness: cliente Supabase FAKE com um "servidor" de uma sessão, cada
// ida ao servidor custa um tick (pra intercalar escritas concorrentes) e o
// payload passa por JSON (undefined some, como no fio de verdade).
import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { SupabaseSessionRepo } from '../src/data/session-repo/supabase'
import { InMemorySessionRepo } from '../src/data/session-repo/in-memory'
import type { MuralItem } from '../src/data/session-repo/contract'
import { adicionarAoMural, removerDoMural } from '../src/data/session-repo/mural-actions'
import { getLiveSession, setLiveSession, type LiveSession } from '../src/data/session-repo/live-session'

type J = Record<string, unknown>
const tick = () => new Promise((r) => setTimeout(r, 0))
const wire = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

function fakeSb(opts: { rpc: boolean; permitido?: boolean }) {
  const server = { state: {} as J }
  const rpcCalls: { name: string; args: J }[] = []
  let writes = 0
  const ausente = { code: 'PGRST202', message: 'Could not find the function public.x in the schema cache' }
  const dup = (mural: MuralItem[], item: MuralItem) =>
    mural.some((e) => ('target' in item ? e.target === item.target : 'url' in item && e.url === item.url))
  const sb = {
    async rpc(name: string, args: J) {
      rpcCalls.push({ name, args })
      const a = wire(args)
      await tick()
      if (!opts.rpc) return { data: null, error: ausente }
      const ok = opts.permitido !== false
      if (name === 'session_state_patch') {
        if (ok) server.state = { ...server.state, ...(a.p_patch as J) }
        return { data: ok, error: null }
      }
      if (name === 'session_mural_add') {
        if (!ok) return { data: null, error: null }
        const mural = (server.state.mural ?? []) as MuralItem[]
        const item = a.p_item as MuralItem
        if (!dup(mural, item)) server.state = { ...server.state, mural: [...mural, item] }
        return { data: wire(server.state.mural), error: null }
      }
      if (name === 'session_mural_remove') {
        const mural = (server.state.mural ?? []) as MuralItem[]
        const item = mural.find((e) => e.id === a.p_id)
        if (!ok || !item) return { data: null, error: null }
        server.state = { ...server.state, mural: mural.filter((e) => e.id !== a.p_id) }
        return { data: item, error: null }
      }
      return { data: null, error: ausente }
    },
    from(_table: string) {
      return {
        select: () => ({
          eq: (_c: string, id: string) => ({
            maybeSingle: async () => {
              const snap = wire(server.state)
              await tick()
              return { data: { id, code: 'X', gm_user_id: 'gm', name: 'Mesa', state: snap, created_at: '', ended_at: null }, error: null }
            },
          }),
        }),
        update: (vals: J) => ({
          eq: async () => {
            const v = wire(vals)
            await tick()
            if (opts.permitido !== false) server.state = v.state as J // RLS: 0 linhas = silêncio
            writes++
            return { error: null }
          },
        }),
      }
    },
  }
  return { sb: sb as unknown as SupabaseClient, server, rpcCalls, writes: () => writes }
}

describe('SupabaseSessionRepo.updateSessionState — RPC atômica', () => {
  it('dois patches concorrentes em chaves diferentes sobrevivem os dois', async () => {
    const f = fakeSb({ rpc: true })
    f.server.state = { exploracao: { trilha: 1 } }
    const repo = new SupabaseSessionRepo(f.sb)
    await Promise.all([
      repo.updateSessionState('s1', { mapaAtlas: { v: 1 } }),
      repo.updateSessionState('s1', { grupoImagem: 'data:x' }),
    ])
    expect(f.server.state).toEqual({ exploracao: { trilha: 1 }, mapaAtlas: { v: 1 }, grupoImagem: 'data:x' })
    expect(f.rpcCalls.map((c) => c.name)).toEqual(['session_state_patch', 'session_state_patch'])
    expect(f.rpcCalls[0]!.args).toEqual({ p_session_id: 's1', p_patch: { mapaAtlas: { v: 1 } } })
    expect(f.writes()).toBe(0)
  })

  it('chave com undefined vai como null (o `||` do servidor manteria o valor velho)', async () => {
    const f = fakeSb({ rpc: true })
    f.server.state = { aventura: { docId: 'a' }, mural: [] }
    const repo = new SupabaseSessionRepo(f.sb)
    await repo.updateSessionState('s1', { aventura: undefined })
    expect(f.rpcCalls[0]!.args.p_patch).toEqual({ aventura: null })
    expect(f.server.state.aventura).toBeNull()
    expect(f.server.state.mural).toEqual([])
  })

  it('RPC devolve false (sem permissão / sessão inexistente) → erro', async () => {
    const f = fakeSb({ rpc: true, permitido: false })
    const repo = new SupabaseSessionRepo(f.sb)
    await expect(repo.updateSessionState('s1', { grupoImagem: 'x' })).rejects.toThrow(/updateSessionState/)
  })

  it('função ausente (PGRST202) → read-merge-write, e não tenta a RPC de novo', async () => {
    const f = fakeSb({ rpc: false })
    f.server.state = { exploracao: { trilha: 1 }, aventura: { docId: 'a' } }
    const repo = new SupabaseSessionRepo(f.sb)
    await repo.updateSessionState('s1', { grupoImagem: 'x' })
    await repo.updateSessionState('s1', { aventura: undefined })
    expect(f.server.state).toEqual({ exploracao: { trilha: 1 }, grupoImagem: 'x' })
    expect(f.rpcCalls.filter((c) => c.name === 'session_state_patch')).toHaveLength(1)
    expect(f.writes()).toBe(2)
  })
})

describe('SupabaseSessionRepo.muralAdd/muralRemove', () => {
  const it1: MuralItem = { id: 'm1', target: 'A.png', em: 't' }
  const it2: MuralItem = { id: 'm2', target: 'B.png', em: 't' }

  for (const rpc of [true, false]) {
    it(`${rpc ? 'RPC' : 'fallback PGRST202'}: concorrentes entram os dois; duplicado é no-op; remove devolve o item`, async () => {
      const f = fakeSb({ rpc })
      const repo = new SupabaseSessionRepo(f.sb)
      if (rpc) {
        const [a, b] = await Promise.all([repo.muralAdd('s1', it1), repo.muralAdd('s1', it2)])
        expect(a).toBeTruthy()
        expect(b).toBeTruthy()
        expect((f.server.state.mural as MuralItem[]).map((m) => m.id).sort()).toEqual(['m1', 'm2'])
      } else {
        await repo.muralAdd('s1', it1)
        await repo.muralAdd('s1', it2)
      }
      const dup = await repo.muralAdd('s1', { id: 'm3', target: 'A.png', em: 't' })
      expect(dup!.map((m) => m.id).sort()).toEqual(['m1', 'm2'])
      expect(await repo.muralRemove('s1', 'm1')).toEqual(it1)
      expect(await repo.muralRemove('s1', 'm1')).toBeNull()
      expect((f.server.state.mural as MuralItem[]).map((m) => m.id)).toEqual(['m2'])
      const nomes = f.rpcCalls.map((c) => c.name)
      if (!rpc) {
        // uma tentativa por função, depois só read-modify-write
        expect(nomes.filter((n) => n === 'session_mural_add')).toHaveLength(1)
        expect(nomes.filter((n) => n === 'session_mural_remove')).toHaveLength(1)
      }
    })
  }
})

describe('InMemorySessionRepo — atômico', () => {
  it('patches concorrentes e muralAdd/Remove com a mesma dedupe do SQL', async () => {
    const repo = new InMemorySessionRepo()
    const s = await repo.createSession({ name: 'M', gmUserId: 'gm', code: 'AT1' })
    await Promise.all([
      repo.updateSessionState(s.id, { grupoImagem: 'x' }),
      repo.updateSessionState(s.id, { mapaAtlas: 1 }),
      repo.muralAdd(s.id, { id: 'a', target: 'A.png', em: 't' }),
      repo.muralAdd(s.id, { id: 'b', url: 'http://u/1.jpg', em: 't' }),
    ])
    const st = (await repo.findSessionById(s.id))!.state
    expect(st.grupoImagem).toBe('x')
    expect(st.mapaAtlas).toBe(1)
    expect(st.mural!.map((m) => m.id)).toEqual(['a', 'b'])
    // mesmo target / mesma url sem target = duplicado
    expect((await repo.muralAdd(s.id, { id: 'c', target: 'A.png', em: 't' }))!.map((m) => m.id)).toEqual(['a', 'b'])
    expect((await repo.muralAdd(s.id, { id: 'd', url: 'http://u/1.jpg', em: 't' }))!.map((m) => m.id)).toEqual(['a', 'b'])
    expect(await repo.muralRemove(s.id, 'a')).toMatchObject({ id: 'a' })
    expect(await repo.muralRemove(s.id, 'a')).toBeNull()
    expect(await repo.muralAdd('nao-existe', { id: 'e', target: 'Z', em: 't' })).toBeNull()
  })
})

describe('mural-actions sobre as escritas atômicas', () => {
  it('imagem duplicada descoberta DEPOIS do upload → apaga o objeto órfão', async () => {
    const repo = new InMemorySessionRepo()
    const sess = await repo.createSession({ name: 'Mesa', gmUserId: 'gm', code: 'MU2' })
    const live: LiveSession = { sessionId: sess.id, state: {}, gmUserId: 'gm', characters: [], members: [], encounters: [] }
    setLiveSession(live)
    // durante o upload, outro aparelho do mestre põe a mesma imagem
    const upload = repo.uploadMuralImagem.bind(repo)
    repo.uploadMuralImagem = async (sid, blob) => {
      const url = await upload(sid, blob)
      await repo.updateSessionState(sid, { mural: [{ id: 'outro', target: 'Nico.png', em: 't' }] })
      return url
    }
    const blob = new Blob([new Uint8Array([1])], { type: 'image/jpeg' })
    const r = await adicionarAoMural(repo, live, { target: 'Nico.png', imagem: blob })
    expect(r).toBe('ja-estava')
    expect(repo.muralUploads).toHaveLength(1)
    expect(repo.muralRemovidos).toEqual([repo.muralUploads[0]!.url])
    expect((await repo.findSessionById(sess.id))!.state.mural!.map((m) => m.id)).toEqual(['outro'])
    expect(getLiveSession()!.state!.mural!.map((m) => m.id)).toEqual(['outro'])
  })

  it('remover apaga o objeto do item que o SERVIDOR devolveu, mesmo com a sala viva velha', async () => {
    const repo = new InMemorySessionRepo()
    const sess = await repo.createSession({ name: 'Mesa', gmUserId: 'gm', code: 'MU3' })
    await repo.updateSessionState(sess.id, { mural: [{ id: 'x', url: 'blob:mural/s/1.jpg', em: 't' }, { id: 'y', target: 'Y.png', em: 't' }] })
    // sala viva velha: não sabe nem do 'x' (a url vem do item que o servidor devolve)
    const live: LiveSession = { sessionId: sess.id, state: { mural: [{ id: 'z', target: 'Z.png', em: 't' }] }, gmUserId: 'gm', characters: [], members: [], encounters: [] }
    setLiveSession(live)
    await removerDoMural(repo, live, 'x')
    expect(repo.muralRemovidos).toEqual(['blob:mural/s/1.jpg'])
    expect((await repo.findSessionById(sess.id))!.state.mural!.map((m) => m.id)).toEqual(['y'])
    // otimista: tira o id da sala viva (o realtime reconcilia o resto)
    expect(getLiveSession()!.state!.mural!.map((m) => m.id)).toEqual(['z'])
  })
})
