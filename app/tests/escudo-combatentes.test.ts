// @vitest-environment jsdom
// ESCUDO DO MESTRE — montagem da lista de combatentes do encontro ativo:
// ordem do turno, filtro por lado (padrão inimigos), vez atual, escondidos,
// segredo do disfarce só pro GM, `semFicha` quando o fmBlob não existe aqui.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { montarCombatentes } from '../src/components/mestre/escudo/useCombatentes'
import { stashDisguiseSecret } from '../src/data/session-repo/disguise-secrets'
import type { LiveSession } from '../src/data/session-repo/live-session'
import type { Encounter, SessionCharacter } from '../src/data/session-repo/contract'

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

const char = (id: string, family: string, kind: SessionCharacter['kind'], extra: Partial<SessionCharacter> = {}): SessionCharacter =>
  ({
    id,
    sessionId: 's1',
    memberId: 'm',
    kind,
    tutorCharacterId: null,
    characterPath: id,
    visibility: 'visible',
    summary: { nome: id.toUpperCase(), family, nivel: 1, atributos: { FOR: 0, AGI: 0, INT: 0, PRE: 0 }, vitalidadeMax: 10, stats: {} },
    state: { recursosRestantes: { vitalidade: 10, moral: 0, em: 0, moralTemp: 0 }, condicoesAtivas: {}, efeitosAtivos: {}, invocacoesAtivas: {} },
    fmBlob: { Tier: 0 },
    updatedAt: '',
    encounterId: 'e1',
    ...extra,
  }) as unknown as SessionCharacter

function live(chars: SessionCharacter[], enc: Partial<Encounter> | null): LiveSession {
  const encounters: Encounter[] = enc
    ? [
        {
          id: 'e1',
          sessionId: 's1',
          sourceNotePath: '',
          name: 'E',
          status: 'active',
          roster: { entries: [] },
          difficulty: null,
          revealedCharacterIds: [],
          turnState: null,
          createdAt: '',
          ...enc,
        } as unknown as Encounter,
      ]
    : []
  return { sessionId: 's1', gmUserId: 'gm', state: null, characters: chars, members: [], encounters }
}

describe('montarCombatentes', () => {
  const h = char('heroi', 'Heroi', 'heroi')
  const ca = char('ca', 'CompanheiroAnimal', 'companheiro', { tutorCharacterId: 'heroi' })
  const g1 = char('g1', 'Monstro', 'npc')
  const g2 = char('g2', 'Monstro', 'npc', { fmBlob: {} })

  it('ordem do turno, filtro padrão só inimigos, TODOS inclui a mesa (CA do lado do tutor)', () => {
    const l = live([h, ca, g1, g2], { turnState: { order: ['g1', 'heroi', 'ca', 'g2'], currentIndex: 1, round: 2, started: true, hidden: ['g2'] } })
    const ini = montarCombatentes(l, true, 'inimigos')
    expect(ini.lista.map((v) => v.c.id)).toEqual(['g1', 'g2'])
    expect(ini.todos.map((v) => v.c.id)).toEqual(['g1', 'heroi', 'ca', 'g2'])
    expect(ini.vezDe?.c.id).toBe('heroi')
    expect(ini.todos.find((v) => v.c.id === 'ca')?.lado).toBe('jogador')
    expect(ini.todos.find((v) => v.c.id === 'g2')?.escondido).toBe(true)
    expect(ini.todos.find((v) => v.c.id === 'g2')?.semFicha).toBe(true)
    expect(ini.todos.find((v) => v.c.id === 'g1')?.semFicha).toBe(false)
    const todos = montarCombatentes(l, true, 'todos')
    expect(todos.lista.map((v) => v.c.id)).toEqual(['g1', 'heroi', 'ca', 'g2'])
  })

  it('morto (turnState.mortos) vira vm.morto; a VM é refeita quando a marca muda', () => {
    const ts = { order: ['g1', 'g2'], currentIndex: 0, round: 1, started: true }
    const a = montarCombatentes(live([g1, g2], { turnState: ts }), true, 'todos')
    expect(a.todos.map((v) => v.morto)).toEqual([false, false])
    const b = montarCombatentes(
      live([g1, g2], { turnState: { ...ts, mortos: ['g2'] } }),
      true,
      'todos',
      new Map(a.todos.map((v) => [v.c.id, v])),
    )
    expect(b.todos.map((v) => v.morto)).toEqual([false, true])
    expect(b.todos[0]).toBe(a.todos[0])
  })

  it('sem encontro ativo: listas vazias e ativo null', () => {
    const r = montarCombatentes(live([h, g1], null), true, 'todos')
    expect(r.ativo).toBeNull()
    expect(r.lista).toEqual([])
    expect(r.vezDe).toBeNull()
  })

  it('GM vê o segredo do disfarce (nome/ficha reais); jogador vê a linha mascarada', () => {
    const masc = char('npc', 'Monstro', 'npc', { fmBlob: {}, characterPath: '(disfarçado)' })
    masc.summary.nome = ''
    stashDisguiseSecret('s1', 'npc', {
      summary: { ...masc.summary, nome: 'Goblin Batedor' },
      fmBlob: { Tier: 0, Classe: '[[Batedor]]' },
      characterPath: 'Sistema/Criaturas/Bestiário/Goblin Batedor',
    })
    const l = live([h, masc], { turnState: { order: ['heroi', 'npc'], currentIndex: 0, round: 1, started: true } })
    const gm = montarCombatentes(l, true, 'inimigos')
    expect(gm.lista[0]!.c.summary.nome).toBe('Goblin Batedor')
    expect(gm.lista[0]!.semFicha).toBe(false)
    expect(gm.lista[0]!.doc.frontmatter['Classe']).toBe('[[Batedor]]')
    const jog = montarCombatentes(l, false, 'inimigos')
    expect(jog.lista[0]!.c.summary.nome).toBe('')
    expect(jog.lista[0]!.semFicha).toBe(true)
  })
})
