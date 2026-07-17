// @vitest-environment jsdom
// #291 (segurança): prova end-to-end sobre o InMemorySessionRepo de que um NPC
// disfarçado NUNCA publica identidade/stats na linha (o que a RLS entregaria ao
// jogador), guardando o real só no user_state do GM (disguise-secrets), e que o
// reveal re-publica só o nome.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { InMemorySessionRepo } from '../src/data/session-repo/in-memory'
import { insertNpc, toggleRevealDisguisedNpc, type NpcInsertInput } from '../src/data/session-repo/encounter-actions'
import { readDisguiseSecret } from '../src/data/session-repo/disguise-secrets'
import type { CharacterState, CharacterSummary } from '../src/data/session-repo/contract'

const realSummary: CharacterSummary = {
  nome: 'Goblin Assassino',
  family: 'Monstro',
  classe: 'Ladino',
  raca: 'Goblin',
  nivel: 5,
  atributos: { FOR: 2, AGI: 4, INT: 1, PRE: 2 },
  vitalidadeMax: 30,
  moralMax: 8,
  imagem: 'goblin.webp',
  stats: { defesa: 16, vigor: 10, evasao: 14, impeto: 5, movimento: 8, percepcao: 12, intuicao: 7 },
}
const state: CharacterState = {
  recursosRestantes: { vitalidade: 30, moral: 8, em: 0, moralTemp: 0 },
  condicoesAtivas: {},
  efeitosAtivos: {},
  invocacoesAtivas: {},
}
const npc: NpcInsertInput = {
  memberId: 'm',
  kind: 'npc',
  characterPath: 'Sistema/Criaturas/Monstros/Goblin Assassino',
  summary: realSummary,
  state,
}

async function setup() {
  const repo = new InMemorySessionRepo()
  const s = await repo.createSession({ name: 'M', gmUserId: 'gm', code: 'DISF01' })
  const enc = await repo.insertEncounter({
    sessionId: s.id,
    sourceNotePath: '',
    name: 'C',
    roster: { entries: [] },
    difficulty: null,
  })
  return { repo, s, enc }
}
const rowOf = async (repo: InMemorySessionRepo, sid: string, cid: string) =>
  (await repo.findCharactersBySession(sid)).find((c) => c.id === cid)!

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
  if (!window.localStorage) {
    Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true })
  }
})
beforeEach(() => window.localStorage.clear())

describe('#291: disfarce seguro no combate (data-layer)', () => {
  it('NPC disfarçado (default): linha publicada SEM identidade/stats; segredo (GM) tem o real', async () => {
    const { repo, s, enc } = await setup()
    const char = await insertNpc(repo, s.id, enc.id, npc, undefined) // undefined = disfarçado
    const pub = await rowOf(repo, s.id, char.id)
    expect(pub.summary.nome).toBe('')
    expect(pub.summary.stats.defesa).toBe(0)
    expect(pub.summary.raca).toBeUndefined()
    expect(pub.characterPath).toBe('(disfarçado)')
    expect(pub.summary.imagem).toBe('goblin.webp') // imagem visível (spec)
    expect(pub.summary.vitalidadeMax).toBe(30) // estimativa de vida
    // prova anti-devtools: nada sensível na linha inteira
    const blob = JSON.stringify(pub)
    for (const leak of ['Goblin', 'Assassino', 'Ladino', 'Monstros/']) expect(blob).not.toContain(leak)
    // o real vive no segredo do GM
    const secret = readDisguiseSecret(s.id, char.id)
    expect(secret?.summary.nome).toBe('Goblin Assassino')
    expect(secret?.characterPath).toBe('Sistema/Criaturas/Monstros/Goblin Assassino')
  })

  it('reveal traz o NOME; des-revelar mascara de novo; stats sempre ocultos pro jogador', async () => {
    const { repo, s, enc } = await setup()
    const char = await insertNpc(repo, s.id, enc.id, npc, undefined)
    await toggleRevealDisguisedNpc(repo, s.id, enc.id, char.id)
    let pub = await rowOf(repo, s.id, char.id)
    expect(pub.summary.nome).toBe('Goblin Assassino')
    expect(pub.summary.stats.defesa).toBe(0)
    await toggleRevealDisguisedNpc(repo, s.id, enc.id, char.id)
    pub = await rowOf(repo, s.id, char.id)
    expect(pub.summary.nome).toBe('')
  })

  it('invisível: publica hidden (a RLS nem entrega) — sem segredo', async () => {
    const { repo, s, enc } = await setup()
    const char = await insertNpc(repo, s.id, enc.id, npc, { invisivel: true })
    const pub = await rowOf(repo, s.id, char.id)
    expect(pub.visibility).toBe('hidden')
    expect(readDisguiseSecret(s.id, char.id)).toBeNull()
  })

  it('revelado de saída (disfarçado:false): publica o real direto, sem segredo', async () => {
    const { repo, s, enc } = await setup()
    const char = await insertNpc(repo, s.id, enc.id, npc, { disfarcado: false })
    const pub = await rowOf(repo, s.id, char.id)
    expect(pub.summary.nome).toBe('Goblin Assassino')
    expect(pub.characterPath).toBe('Sistema/Criaturas/Monstros/Goblin Assassino')
    expect(readDisguiseSecret(s.id, char.id)).toBeNull()
  })
})
