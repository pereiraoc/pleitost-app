// @vitest-environment node
// TSK-106 (12/11/2026): sessão só para quem está nela. A tabela `sessions` não
// é mais pública e o jogador não se insere direto em `session_members` — entrar
// é a RPC `session_join_by_code` (código + nome; o servidor grava o membro).
// Publicar no compêndio (doc_overlays) é só de conta editora: o erro de RLS
// vira uma mensagem que diz o que aconteceu (os rascunhos ficam no aparelho).
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { SupabaseSessionRepo } from '../src/data/session-repo/supabase'

type J = Record<string, unknown>
const ROW = { id: 's1', code: 'ABC234', gm_user_id: 'gm', name: 'Mesa', state: {}, created_at: '2026-11-12', ended_at: null }

function fakeSb(opts: { rpc: 'ok' | 'vazio' | 'ausente' }) {
  const rpcCalls: { name: string; args: J }[] = []
  const inserts: J[] = []
  const sb = {
    async rpc(name: string, args: J) {
      rpcCalls.push({ name, args })
      if (opts.rpc === 'ausente') {
        return { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.session_join_by_code' } }
      }
      return { data: opts.rpc === 'ok' ? [ROW] : [], error: null }
    },
    // caminho antigo (projeto sem a RPC): sessions por código, member, insert
    from(table: string) {
      const q = {
        select: () => q,
        eq: () => q,
        is: () => q,
        maybeSingle: async () => ({ data: table === 'sessions' ? ROW : null, error: null }),
        insert: (row: J) => {
          inserts.push({ table, ...row })
          return { select: () => ({ single: async () => ({ data: { ...row, joined_at: '' }, error: null }) }) }
        },
      }
      return q
    },
  }
  return { sb: sb as unknown as SupabaseClient, rpcCalls, inserts }
}

describe('SupabaseSessionRepo.joinSessionByCode', () => {
  it('chama a RPC com o código normalizado e o nome; devolve a sessão', async () => {
    const f = fakeSb({ rpc: 'ok' })
    const s = await new SupabaseSessionRepo(f.sb).joinSessionByCode(' abc234 ', { userId: 'p1', displayName: 'Ana' })
    expect(f.rpcCalls).toEqual([{ name: 'session_join_by_code', args: { p_code: 'ABC234', p_display_name: 'Ana' } }])
    expect(s?.id).toBe('s1')
    expect(s?.code).toBe('ABC234')
    expect(f.inserts).toEqual([]) // o membro é gravado no servidor, não pelo cliente
  })

  it('código errado / mesa encerrada (nenhuma linha) → null', async () => {
    const f = fakeSb({ rpc: 'vazio' })
    expect(await new SupabaseSessionRepo(f.sb).joinSessionByCode('ZZZ999', { userId: 'p1', displayName: 'Ana' })).toBeNull()
  })

  it('projeto sem a RPC (PGRST202) → caminho antigo: acha por código e se insere como player', async () => {
    const f = fakeSb({ rpc: 'ausente' })
    const repo = new SupabaseSessionRepo(f.sb)
    expect((await repo.joinSessionByCode('abc234', { userId: 'p1', displayName: 'Ana' }))?.id).toBe('s1')
    expect(f.inserts).toEqual([{ table: 'session_members', session_id: 's1', user_id: 'p1', role: 'player', display_name: 'Ana' }])
    // não insiste na RPC ausente
    await repo.joinSessionByCode('abc234', { userId: 'p1', displayName: 'Ana' })
    expect(f.rpcCalls.length).toBe(1)
  })
})

describe('publishOverlays sem ser editor do compêndio', () => {
  afterEach(() => {
    vi.doUnmock('../src/data/session-repo/supabase')
    vi.resetModules()
  })

  it('erro de RLS vira mensagem clara; outros erros passam como vieram', async () => {
    let erro: { code: string; message: string } = {
      code: '42501',
      message: 'new row violates row-level security policy for table "doc_overlays"',
    }
    vi.resetModules()
    vi.doMock('../src/data/session-repo/supabase', () => ({
      supabaseClient: () => ({ from: () => ({ upsert: async () => ({ error: erro }) }) }),
    }))
    const { publishOverlays } = await import('../src/data/published-overlay-store')
    await expect(publishOverlays([{ id: 'Doc/X', patch: { body: 'x' } }], 'Ana')).rejects.toThrow(/não é editora do compêndio/)
    erro = { code: '08006', message: 'rede caiu' }
    await expect(publishOverlays([{ id: 'Doc/X', patch: { body: 'x' } }], 'Ana')).rejects.toThrow('rede caiu')
  })
})
