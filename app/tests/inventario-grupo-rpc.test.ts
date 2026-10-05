// @vitest-environment node
// INVENTÁRIO DO GRUPO por item, via RPC de MEMBRO (2026-10-04). O app gravava o
// mapa `state.inventarioGrupo` INTEIRO com updateSessionState — RLS gm-only →
// a escrita do JOGADOR (adicionar, puxar, receber) se perdia e o item puxado
// continuava no pool (duplicava depois de recarregar). Agora:
// inventarioSet (session_inventario_set) e inventarioTirar
// (session_inventario_tirar, devolve o que de fato saiu). PGRST202 → caminho
// antigo pelo patch do state.
import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { SupabaseSessionRepo } from '../src/data/session-repo/supabase'
import { InMemorySessionRepo } from '../src/data/session-repo/in-memory'
import type { GroupInventoryItem } from '../src/data/session-repo/contract'

type J = Record<string, unknown>
const tick = () => new Promise((r) => setTimeout(r, 0))
const wire = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T
const item = (nome: string): GroupInventoryItem => ({ kind: 'ouro', qtd: 10, addedBy: 'p-1', addedAt: nome })

function fakeSb(opts: { rpc: boolean }) {
  const server = { state: {} as J }
  const rpcCalls: { name: string; args: J }[] = []
  const ausente = { code: 'PGRST202', message: 'Could not find the function public.x in the schema cache' }
  const pool = () => ({ ...((server.state.inventarioGrupo ?? {}) as J) })
  const sb = {
    async rpc(name: string, args: J) {
      rpcCalls.push({ name, args })
      const a = wire(args)
      await tick()
      if (name === 'session_state_patch') {
        // patch (gm) segue disponível no caminho antigo
        server.state = { ...server.state, ...(a.p_patch as J) }
        return { data: true, error: null }
      }
      if (!opts.rpc) return { data: null, error: ausente }
      if (name === 'session_inventario_set') {
        const p = pool()
        if (a.p_item == null) delete p[a.p_chave as string]
        else p[a.p_chave as string] = a.p_item
        server.state = { ...server.state, inventarioGrupo: p }
        return { data: null, error: null }
      }
      if (name === 'session_inventario_tirar') {
        const p = pool()
        const sairam = (a.p_chaves as string[]).filter((k) => k in p)
        for (const k of sairam) delete p[k]
        server.state = { ...server.state, inventarioGrupo: p }
        return { data: sairam, error: null }
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
      }
    },
  }
  return { sb: sb as unknown as SupabaseClient, server, rpcCalls }
}

describe('SupabaseSessionRepo — inventário por item', () => {
  it('inventarioSet chama a RPC com a chave e o item (null = tirar)', async () => {
    const f = fakeSb({ rpc: true })
    f.server.state = { inventarioGrupo: { a: item('a') }, mural: [] }
    const repo = new SupabaseSessionRepo(f.sb)
    await repo.inventarioSet('s1', 'b', item('b'))
    await repo.inventarioSet('s1', 'a', null)
    expect(f.rpcCalls.map((c) => c.name)).toEqual(['session_inventario_set', 'session_inventario_set'])
    expect(f.rpcCalls[0]!.args).toEqual({ p_session_id: 's1', p_chave: 'b', p_item: item('b') })
    expect(f.rpcCalls[1]!.args).toEqual({ p_session_id: 's1', p_chave: 'a', p_item: null })
    expect(f.server.state).toEqual({ inventarioGrupo: { b: item('b') }, mural: [] })
  })

  it('inventarioTirar devolve só as chaves que estavam no pool', async () => {
    const f = fakeSb({ rpc: true })
    f.server.state = { inventarioGrupo: { a: item('a'), b: item('b') } }
    const repo = new SupabaseSessionRepo(f.sb)
    expect(await repo.inventarioTirar('s1', ['a', 'x'])).toEqual(['a'])
    expect(f.rpcCalls[0]).toEqual({ name: 'session_inventario_tirar', args: { p_session_id: 's1', p_chaves: ['a', 'x'] } })
    expect(f.server.state.inventarioGrupo).toEqual({ b: item('b') })
  })

  it('dois aparelhos puxando a MESMA chave ao mesmo tempo: só um recebe', async () => {
    const f = fakeSb({ rpc: true })
    f.server.state = { inventarioGrupo: { a: item('a') } }
    const r1 = new SupabaseSessionRepo(f.sb)
    const r2 = new SupabaseSessionRepo(f.sb)
    const [x, y] = await Promise.all([r1.inventarioTirar('s1', ['a']), r2.inventarioTirar('s1', ['a'])])
    expect([...x, ...y]).toEqual(['a'])
  })

  it('função ausente (PGRST202) → read-modify-write pelo patch do state, sem insistir na RPC', async () => {
    const f = fakeSb({ rpc: false })
    f.server.state = { inventarioGrupo: { a: item('a') }, mural: [] }
    const repo = new SupabaseSessionRepo(f.sb)
    await repo.inventarioSet('s1', 'b', item('b'))
    expect(await repo.inventarioTirar('s1', ['a', 'x'])).toEqual(['a'])
    await repo.inventarioSet('s1', 'c', item('c'))
    expect(f.server.state).toEqual({ inventarioGrupo: { b: item('b'), c: item('c') }, mural: [] })
    const nomes = f.rpcCalls.map((c) => c.name)
    expect(nomes.filter((n) => n === 'session_inventario_set')).toHaveLength(1)
    expect(nomes.filter((n) => n === 'session_inventario_tirar')).toHaveLength(1)
    expect(nomes.filter((n) => n === 'session_state_patch')).toHaveLength(3)
  })
})

describe('InMemorySessionRepo — inventário por item com a RLS modelada', () => {
  async function mesa() {
    const repo = new InMemorySessionRepo()
    const sess = await repo.createSession({ name: 'Mesa', gmUserId: 'gm-1', code: 'INVRPC' })
    await repo.insertMember({ sessionId: sess.id, userId: 'p-1', role: 'player', displayName: 'Ana' })
    return { repo, sess }
  }

  it('JOGADOR (membro, não mestre) grava item; o patch do state inteiro é só do mestre', async () => {
    const { repo, sess } = await mesa()
    repo.actingUserId = 'p-1'
    await expect(repo.updateSessionState(sess.id, { inventarioGrupo: { a: item('a') } })).rejects.toThrow(/permiss/)
    await repo.inventarioSet(sess.id, 'a', item('a'))
    expect((await repo.findSessionById(sess.id))!.state.inventarioGrupo).toEqual({ a: item('a') })
    expect(await repo.inventarioTirar(sess.id, ['a'])).toEqual(['a'])
    expect((await repo.findSessionById(sess.id))!.state.inventarioGrupo).toEqual({})
  })

  it('quem não é membro nem mestre → rejeita', async () => {
    const { repo, sess } = await mesa()
    repo.actingUserId = 'estranho'
    await expect(repo.inventarioSet(sess.id, 'a', item('a'))).rejects.toThrow(/member/)
    await expect(repo.inventarioTirar(sess.id, ['a'])).rejects.toThrow(/member/)
  })

  it('duas tiradas concorrentes da mesma chave: só uma devolve', async () => {
    const { repo, sess } = await mesa()
    await repo.inventarioSet(sess.id, 'a', item('a'))
    const [x, y] = await Promise.all([repo.inventarioTirar(sess.id, ['a']), repo.inventarioTirar(sess.id, ['a'])])
    expect([...x, ...y]).toEqual(['a'])
  })
})
