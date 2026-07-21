// @vitest-environment node
// TESTE MULTI-USUÁRIO (GM + jogador) sobre o backend compartilhado
// (InMemorySessionRepo — MESMO transporte/semântica do Supabase). Simula a MESA:
// um cliente EDITA, o outro precisa VER a mudança (o problema de "não salva entre
// dispositivos/membros"). Cada "cliente" = uma visão que re-busca do backend a
// cada notify (espelho do LiveSessionBridge). Cobre: OURO/inventário/tesouros via
// fmBlob (o fix do salvamento), vida via state, inventário do grupo + envio pelo
// GM (SessionState), e exploração compartilhada (#5). Fecha #3a/#3b/#6/#20/#21/#5
// no nível de DADOS (a persistência/propagação, que é onde os bugs viviam).
import { describe, expect, it, vi } from 'vitest'
import { InMemorySessionRepo } from '../src/data/session-repo/in-memory'
import type { SessionCharacter } from '../src/data/session-repo/contract'

const summary = (nome: string) =>
  ({ nome, vitalidadeMax: 20, moralMax: 10, stats: { defesa: 12, movimento: 6 } }) as unknown as SessionCharacter['summary']
const state = () =>
  ({
    recursosRestantes: { vitalidade: 20, moral: 10, moralTemp: 0 },
    condicoesAtivas: {},
    efeitosAtivos: {},
    invocacoesAtivas: {},
  }) as unknown as SessionCharacter['state']

async function setup() {
  const repo = new InMemorySessionRepo()
  const sess = await repo.createSession({ name: 'Mesa', gmUserId: 'gm', code: 'M1' })
  await repo.insertMember({ sessionId: sess.id, userId: 'gm', role: 'gm', displayName: 'Mestre' })
  await repo.insertMember({ sessionId: sess.id, userId: 'p1', role: 'player', displayName: 'Ana' })
  const char = await repo.insertCharacter({
    sessionId: sess.id,
    memberId: 'p1',
    kind: 'hero',
    tutorCharacterId: null,
    characterPath: 'local:Ana',
    visibility: 'party',
    summary: summary('Ana'),
    state: state(),
    fmBlob: { Inventario: { Ouro: 10, Tesouros: [] } },
  })
  return { repo, sessId: sess.id, charId: char.id }
}

/** Um "cliente" (GM ou jogador) — re-busca o backend a cada notify da sessão,
 *  como o LiveSessionBridge do app. */
function makeClient(repo: InMemorySessionRepo, sessId: string) {
  const view = { chars: [] as SessionCharacter[], state: {} as Record<string, unknown> }
  const refetch = async () => {
    view.chars = await repo.findCharactersBySession(sessId)
    view.state = ((await repo.findSessionById(sessId))?.state ?? {}) as Record<string, unknown>
  }
  const off = repo.subscribe(sessId, () => void refetch())
  return { view, refetch, off }
}

describe('sync multi-usuário: GM + jogador na mesma mesa', () => {
  it('#6/#21/salvamento: OURO + tesouros editados pelo jogador chegam pro GM (fmBlob)', async () => {
    const { repo, sessId, charId } = await setup()
    const gm = makeClient(repo, sessId)
    await gm.refetch()
    expect((gm.view.chars.find((c) => c.id === charId)?.fmBlob as any)?.Inventario?.Ouro).toBe(10)
    // jogador edita ouro + ganha artefato → RE-PUBLICA o fmBlob (o que o
    // usePublicacao passou a fazer em qualquer edição não-Interativa).
    await repo.updateCharacterFmBlob(charId, {
      Inventario: { Ouro: 999, Tesouros: ['[[Garras do Rei-Mago|Garras do Rei-Mago (Mestre)]]'] },
    })
    await gm.refetch()
    const fm = gm.view.chars.find((c) => c.id === charId)!.fmBlob as any
    expect(fm.Inventario.Ouro).toBe(999)
    expect(fm.Inventario.Tesouros).toContain('[[Garras do Rei-Mago|Garras do Rei-Mago (Mestre)]]') // #21
    gm.off()
  })

  it('#20: vida (state) alterada pelo jogador chega pro GM', async () => {
    const { repo, sessId, charId } = await setup()
    const gm = makeClient(repo, sessId)
    await repo.updateCharacterState(charId, {
      recursosRestantes: { vitalidade: 3, moral: 10, moralTemp: 0 },
    } as never)
    await gm.refetch()
    expect(gm.view.chars.find((c) => c.id === charId)?.state.recursosRestantes?.vitalidade).toBe(3)
    gm.off()
  })

  it('#3a: GM coloca item no grupo → jogador vê; puxar remove do grupo (persiste)', async () => {
    const { repo, sessId } = await setup()
    const player = makeClient(repo, sessId)
    await repo.updateSessionState(sessId, {
      inventarioGrupo: { k1: { kind: 'ouro', qtd: 50, addedBy: 'gm', addedAt: 't', valorPO: 50 } as never },
    })
    await player.refetch()
    expect(player.view.state.inventarioGrupo).toHaveProperty('k1')
    // jogador PUXA → writeMap com o mapa SEM k1 (transferência sai do grupo)
    await repo.updateSessionState(sessId, { inventarioGrupo: {} })
    await player.refetch()
    expect(player.view.state.inventarioGrupo).toEqual({})
    player.off()
  })

  it('#3b: GM envia item PRA o personagem (paraChar) → o jogador vê o endereçamento', async () => {
    const { repo, sessId, charId } = await setup()
    const player = makeClient(repo, sessId)
    await repo.updateSessionState(sessId, {
      inventarioGrupo: {
        k1: {
          kind: 'tesouro',
          docId: 'Sistema/Equipamento/Tesouros/Equipamentos/Anel',
          nome: 'Anel',
          tier: 'A',
          addedBy: 'gm',
          addedAt: 't',
          paraChar: charId,
        } as never,
      },
    })
    await player.refetch()
    expect((player.view.state.inventarioGrupo as any).k1.paraChar).toBe(charId)
    player.off()
  })

  it('#5: exploração de um membro chega pros outros (SessionState.exploracao)', async () => {
    const { repo, sessId } = await setup()
    const player = makeClient(repo, sessId)
    await repo.updateSessionState(sessId, {
      exploracao: { hexes: [{ id: 'h1', col: 2, row: 3, label: 'Vila do Grupo' }] } as never,
    })
    await player.refetch()
    expect((player.view.state.exploracao as any).hexes[0].label).toBe('Vila do Grupo')
    player.off()
  })

  it('updateSessionState faz MERGE top-level (gravar exploração NÃO apaga o inventário)', async () => {
    const { repo, sessId } = await setup()
    await repo.updateSessionState(sessId, { inventarioGrupo: { k1: { kind: 'ouro', qtd: 5 } as never } })
    await repo.updateSessionState(sessId, { exploracao: { hexes: [] } as never })
    const s = (await repo.findSessionById(sessId))!.state
    expect(s.inventarioGrupo).toHaveProperty('k1')
    expect(s.exploracao).toBeDefined()
  })

  it('realtime: um write notifica os DOIS clientes (GM + jogador)', async () => {
    const { repo, sessId, charId } = await setup()
    const gmCb = vi.fn()
    const playerCb = vi.fn()
    const offA = repo.subscribe(sessId, gmCb)
    const offB = repo.subscribe(sessId, playerCb)
    await repo.updateCharacterFmBlob(charId, { Inventario: { Ouro: 1 } })
    expect(gmCb).toHaveBeenCalled()
    expect(playerCb).toHaveBeenCalled()
    offA()
    offB()
  })
})
