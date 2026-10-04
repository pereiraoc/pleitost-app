// @vitest-environment jsdom
// PERF da sessão viva ("atualizar só o que mudou"): cada evento realtime
// re-busca as 4 tabelas e o LiveSessionBridge chama setLiveSession com objetos
// TODOS novos — antes, toda ficha aberta (useDocs/useDoc dependiam do live
// inteiro) re-rodava o pipeline a cada refetch. Agora:
//  - mergeLive faz structural sharing por id (char/encounter/member iguais
//    mantêm a referência; summary/fmBlob/state reaproveitados um a um);
//  - refetch idêntico não notifica;
//  - useLiveSelector só re-renderiza quando a FATIA selecionada muda;
//  - useDocs de ids só da vault não re-renderiza com a sala.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { mergeLive } from '../src/data/session-repo/live-merge'
import {
  getLiveSession,
  setLiveSession,
  synthDocFromCharacter,
  useLiveSelector,
  type LiveSession,
} from '../src/data/session-repo/live-session'
import { useDocs } from '../src/data/useDoc'
import { InMemorySessionRepo } from '../src/data/session-repo/in-memory'
import { comSegredo, stashDisguiseSecret } from '../src/data/session-repo/disguise-secrets'
import type { Encounter, SessionCharacter, SessionMember } from '../src/data/session-repo/contract'
import { __resetSettingsForTests } from '../src/settings'

function makeStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    key: (i: number) => [...data.keys()][i] ?? null,
    removeItem: (k: string) => void data.delete(k),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
  }
}

beforeAll(() => {
  Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true })
  __resetSettingsForTests()
})

afterEach(() => {
  cleanup()
  act(() => setLiveSession(null))
})

function char(id: string, vit = 20, extra: Partial<SessionCharacter> = {}): SessionCharacter {
  return {
    id,
    sessionId: 's1',
    memberId: 'p-' + id,
    kind: 'heroi',
    tutorCharacterId: null,
    characterPath: 'local:' + id,
    visibility: 'party',
    summary: { nome: id, vitalidadeMax: 20, moralMax: 10, stats: { defesa: 12 } } as unknown as SessionCharacter['summary'],
    state: { recursosRestantes: { vitalidade: vit, moral: 10, moralTemp: 0 }, condicoesAtivas: {} } as unknown as SessionCharacter['state'],
    fmBlob: { Inventario: { Ouro: 10, Tesouros: ['a', 'b'] } },
    updatedAt: '2026-10-04T00:00:00Z',
    encounterId: null,
    ...extra,
  }
}
function enc(id: string, currentIndex = 0): Encounter {
  return {
    id,
    sessionId: 's1',
    sourceNotePath: 'x',
    name: 'Combate',
    status: 'active',
    roster: { entries: [] },
    difficulty: null,
    revealedCharacterIds: [],
    turnState: { order: ['a', 'b'], currentIndex, round: 1 } as unknown as Encounter['turnState'],
    createdAt: 't',
    startedAt: 't',
    archivedAt: null,
  }
}
function member(userId: string): SessionMember {
  return { sessionId: 's1', userId, role: 'player', displayName: userId, joinedAt: 't' }
}
/** Snapshot "do servidor": tudo novo (como mapCharacter/mapEncounter). */
function snap(vitB = 20, currentIndex = 0): LiveSession {
  return {
    sessionId: 's1',
    gmUserId: 'gm',
    state: { aventura: { nota: 'X' } } as unknown as LiveSession['state'],
    characters: [char('a'), char('b', vitB)],
    members: [member('gm'), member('p1')],
    encounters: [enc('e1', currentIndex)],
  }
}

describe('mergeLive: structural sharing por id', () => {
  it('mudar 1 personagem mantém as refs dos outros; encounter igual mantém a ref', () => {
    const prev = snap()
    const next = mergeLive(prev, snap(15))
    expect(next).not.toBe(prev)
    expect(next.characters[0]).toBe(prev.characters[0])
    expect(next.characters[1]).not.toBe(prev.characters[1])
    expect(next.characters[1]!.state.recursosRestantes?.vitalidade).toBe(15)
    // sub-objetos iguais reaproveitados individualmente
    expect(next.characters[1]!.summary).toBe(prev.characters[1]!.summary)
    expect(next.characters[1]!.fmBlob).toBe(prev.characters[1]!.fmBlob)
    expect(next.encounters).toBe(prev.encounters)
    expect(next.members).toBe(prev.members)
    expect(next.state).toBe(prev.state)
  })

  it('snapshot idêntico (chaves em outra ordem, jsonb) devolve o prev', () => {
    const prev = snap()
    const n = snap()
    n.characters[0] = { ...n.characters[0]!, fmBlob: { Inventario: { Tesouros: ['a', 'b'], Ouro: 10 } } }
    expect(mergeLive(prev, n)).toBe(prev)
  })

  it('encounter com turno novo troca só ele', () => {
    const prev = snap()
    const next = mergeLive(prev, snap(20, 1))
    expect(next.encounters).not.toBe(prev.encounters)
    expect(next.encounters[0]!.turnState?.currentIndex).toBe(1)
    expect(next.characters).toBe(prev.characters)
  })

  it('otimista parcial (encounter novo anexado ao live atual) funciona', () => {
    const prev = snap()
    const novo = { ...enc('e2'), status: 'prepared' as const }
    const next = mergeLive(prev, { ...prev, encounters: [...prev.encounters, novo] })
    expect(next.encounters).toHaveLength(2)
    expect(next.encounters[0]).toBe(prev.encounters[0])
    expect(next.encounters[1]).toBe(novo)
    expect(next.characters).toBe(prev.characters)
  })
})

describe('setLiveSession', () => {
  it('refetch idêntico não notifica', () => {
    act(() => setLiveSession(snap()))
    const antes = getLiveSession()
    let renders = 0
    function Probe() {
      useLiveSelector((l) => l)
      renders++
      return null
    }
    render(<Probe />)
    const base = renders
    act(() => setLiveSession(snap()))
    expect(getLiveSession()).toBe(antes)
    expect(renders).toBe(base)
  })
})

describe('useLiveSelector: re-render só quando a fatia muda', () => {
  it('componente que lê só encounters não re-renderiza quando a vida de um personagem muda', () => {
    act(() => setLiveSession(snap()))
    let renders = 0
    function SoEncounters() {
      const encs = useLiveSelector((l) => l?.encounters)
      renders++
      return <span>{encs?.length}</span>
    }
    render(<SoEncounters />)
    const base = renders
    act(() => setLiveSession(snap(5)))
    expect(getLiveSession()!.characters[1]!.state.recursosRestantes?.vitalidade).toBe(5)
    expect(renders).toBe(base)
    act(() => setLiveSession(snap(5, 1)))
    expect(renders).toBe(base + 1)
  })

  it('useDocs com id só da vault não re-renderiza com mudança da sala', () => {
    act(() => setLiveSession(snap()))
    globalThis.fetch = (async () => ({ ok: false, status: 404, json: async () => ({}) })) as unknown as typeof fetch
    let renders = 0
    const ids = ['Sistema/Algo']
    function SoVault() {
      useDocs(ids)
      renders++
      return null
    }
    render(<SoVault />)
    const base = renders
    act(() => setLiveSession(snap(3)))
    act(() => setLiveSession(snap(4, 1)))
    expect(renders).toBe(base)
  })

  it('useDocs de sessao:<id> re-renderiza só quando AQUELE personagem muda', () => {
    act(() => setLiveSession(snap()))
    let renders = 0
    let last: unknown
    const ids = ['sessao:a']
    function SoA() {
      last = useDocs(ids)?.get('sessao:a')
      renders++
      return null
    }
    render(<SoA />)
    const base = renders
    const docAntes = last
    act(() => setLiveSession(snap(3))) // muda o b
    expect(renders).toBe(base)
    const n = snap()
    n.characters[0] = char('a', 7)
    act(() => setLiveSession(n))
    expect(renders).toBe(base + 1)
    expect(last).not.toBe(docAntes)
  })
})

describe('memo por referência', () => {
  it('synthDocFromCharacter devolve o MESMO doc pro mesmo objeto de personagem', () => {
    const c = char('a')
    expect(synthDocFromCharacter(c)).toBe(synthDocFromCharacter(c))
    expect(synthDocFromCharacter({ ...c })).not.toBe(synthDocFromCharacter(c))
  })

  it('comSegredo devolve a mesma linha enquanto char e segredo não mudam', () => {
    const c = char('n1', 20, { kind: 'npc', fmBlob: {} })
    stashDisguiseSecret('s1', 'n1', {
      summary: { ...c.summary, nome: 'Goblin Real' },
      fmBlob: { Atributos: { FOR: 2 } },
      characterPath: 'Monstros/Goblin',
    })
    const r1 = comSegredo(c, 's1')
    expect(r1.summary.nome).toBe('Goblin Real')
    expect(comSegredo(c, 's1')).toBe(r1)
    stashDisguiseSecret('s1', 'n1', {
      summary: { ...c.summary, nome: 'Goblin Outro' },
      fmBlob: {},
      characterPath: 'Monstros/Goblin',
    })
    const r2 = comSegredo(c, 's1')
    expect(r2).not.toBe(r1)
    expect(r2.summary.nome).toBe('Goblin Outro')
  })
})

describe('in-memory repo devolve clones (como o Supabase)', () => {
  it('listEncountersBySession / listMembers não vazam instâncias internas', async () => {
    const repo = new InMemorySessionRepo()
    const sess = await repo.createSession({ name: 'Mesa', gmUserId: 'gm', code: 'M1' })
    await repo.insertMember({ sessionId: sess.id, userId: 'gm', role: 'gm', displayName: 'Mestre' })
    await repo.insertEncounter({ sessionId: sess.id, sourceNotePath: 'x', name: 'C', roster: { entries: [] }, difficulty: null })
    const [e1] = await repo.listEncountersBySession(sess.id)
    const [e2] = await repo.listEncountersBySession(sess.id)
    expect(e1).not.toBe(e2)
    expect(e1).toEqual(e2)
    const [m1] = await repo.listMembers(sess.id)
    const [m2] = await repo.listMembers(sess.id)
    expect(m1).not.toBe(m2)
  })
})
