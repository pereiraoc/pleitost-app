// @vitest-environment jsdom
// B1 do Escudo do Mestre: lado do combatente e linha efetiva com segredo
// fatorados do CombateDaSala/ResumoSessaoDetail — fonte única pra sidebar e
// pro Escudo.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ladoDoCombatente } from '../src/data/session-repo/combatente'
import { comSegredo, stashDisguiseSecret } from '../src/data/session-repo/disguise-secrets'
import type { SessionCharacter } from '../src/data/session-repo/contract'

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

const char = (over: Partial<SessionCharacter> & { family: string }): SessionCharacter =>
  ({
    id: 'x',
    sessionId: 's1',
    memberId: 'm',
    kind: 'heroi',
    tutorCharacterId: null,
    characterPath: 'p',
    visibility: 'visible',
    summary: { nome: 'N', family: over.family, nivel: 1, atributos: { FOR: 0, AGI: 0, INT: 0, PRE: 0 }, vitalidadeMax: 10, stats: {} },
    state: { recursosRestantes: { vitalidade: 10, moral: 0, em: 0, moralTemp: 0 }, condicoesAtivas: {}, efeitosAtivos: {}, invocacoesAtivas: {} },
    fmBlob: {},
    updatedAt: '',
    ...over,
  }) as unknown as SessionCharacter

describe('ladoDoCombatente', () => {
  it('herói = jogador, monstro = inimigo', () => {
    const m = new Map<string, SessionCharacter>()
    expect(ladoDoCombatente(char({ family: 'Heroi' }), m)).toBe('jogador')
    expect(ladoDoCombatente(char({ family: 'Monstro', kind: 'npc' }), m)).toBe('inimigo')
  })
  it('#16: companheiro animal fica do lado do TUTOR; sem tutor na sala cai na própria família', () => {
    const tutor = char({ id: 't', family: 'Heroi' })
    const ca = char({ id: 'ca', family: 'CompanheiroAnimal', kind: 'companheiro', tutorCharacterId: 't' })
    expect(ladoDoCombatente(ca, new Map([['t', tutor]]))).toBe('jogador')
    expect(ladoDoCombatente(ca, new Map())).toBe('inimigo')
  })
})

describe('comSegredo', () => {
  it('sem segredo devolve a linha intacta', () => {
    const c = char({ family: 'Monstro', kind: 'npc' })
    expect(comSegredo(c, 's1')).toBe(c)
  })
  it('com segredo: identidade, path e fmBlob reais; state ao vivo preservado', () => {
    const c = char({ id: 'npc1', family: 'Monstro', kind: 'npc', characterPath: '(disfarçado)' })
    stashDisguiseSecret('s1', 'npc1', {
      summary: { ...c.summary, nome: 'Goblin Batedor' },
      fmBlob: { Tier: 0 },
      characterPath: 'Sistema/Criaturas/Bestiário/Goblin Batedor',
    })
    const e = comSegredo(c, 's1')
    expect(e.summary.nome).toBe('Goblin Batedor')
    expect(e.characterPath).toBe('Sistema/Criaturas/Bestiário/Goblin Batedor')
    expect(e.fmBlob).toEqual({ Tier: 0 })
    expect(e.state).toBe(c.state)
  })
  it('segredo sem ficha guardada mantém o fmBlob publicado (liberado pelo 📖)', () => {
    const c = char({ id: 'npc2', family: 'Monstro', kind: 'npc', fmBlob: { Tier: 1 } })
    stashDisguiseSecret('s1', 'npc2', { summary: c.summary, fmBlob: {}, characterPath: 'x' })
    expect(comSegredo(c, 's1').fmBlob).toEqual({ Tier: 1 })
  })
})
