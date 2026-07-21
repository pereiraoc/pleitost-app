// @vitest-environment jsdom
// Migração da exploração da MESA (bug: era keyed pela constante MESA_GRUPO_ID e
// virou escopada por sessão → os hexes do Carlos ficaram órfãos na chave antiga).
// migrateGroupState porta o estado antigo pro escopo novo sem perder dados,
// sem sobrescrever um destino já preenchido e sem revazar (limpa o antigo).
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  addGroupHex,
  getGroupState,
  groupStateJson,
  migrateGroupState,
  setGroupStateFull,
  __resetGroupStoreMemoryForTests,
} from '../src/data/group-store'

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

beforeEach(() => {
  if (!window.localStorage) {
    Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true })
  }
  window.localStorage.clear()
  __resetGroupStoreMemoryForTests()
})
afterEach(() => {
  window.localStorage.clear()
  __resetGroupStoreMemoryForTests()
})

const OLD = 'sessao:mesa'
const NEW = 'sessao:mesa:s1'

describe('migrateGroupState — porta a exploração da mesa', () => {
  it('porta os hexes do antigo pro escopo novo e LIMPA o antigo', () => {
    addGroupHex(OLD, { col: 3, row: 4, kind: 'parada', label: 'Vila do Carlos' })
    addGroupHex(OLD, { col: 5, row: 6, kind: 'caminho' })
    expect(getGroupState(OLD).hexes).toHaveLength(2)

    expect(migrateGroupState(OLD, NEW)).toBe(true)
    const novo = getGroupState(NEW)
    expect(novo.hexes).toHaveLength(2)
    expect(novo.hexes[0]!.label).toBe('Vila do Carlos')
    // antigo esvaziado (não revaza pra outras sessões)
    expect(getGroupState(OLD).hexes).toHaveLength(0)
  })

  it('NÃO sobrescreve um destino que já tem exploração', () => {
    addGroupHex(OLD, { col: 1, row: 1 })
    addGroupHex(NEW, { col: 9, row: 9, label: 'Já existe' })
    expect(migrateGroupState(OLD, NEW)).toBe(false)
    expect(getGroupState(NEW).hexes).toHaveLength(1)
    expect(getGroupState(NEW).hexes[0]!.label).toBe('Já existe')
    expect(getGroupState(OLD).hexes).toHaveLength(1) // antigo intacto
  })

  it('no-op quando o antigo está vazio (nada a portar)', () => {
    expect(migrateGroupState(OLD, NEW)).toBe(false)
    expect(getGroupState(NEW).hexes).toHaveLength(0)
  })

  it('no-op quando from === to', () => {
    addGroupHex(NEW, { col: 2, row: 2 })
    expect(migrateGroupState(NEW, NEW)).toBe(false)
    expect(getGroupState(NEW).hexes).toHaveLength(1)
  })
})

describe('sync da mesa: groupStateJson + setGroupStateFull', () => {
  it('setGroupStateFull aplica um estado completo (remoto→local) filtrando hexes', () => {
    setGroupStateFull(NEW, {
      hexes: [
        { id: 'h1', col: 1, row: 2, label: 'Vila', kind: 'parada' },
        { id: 'bad', col: NaN as unknown as number, row: 0 }, // inválido → filtrado
      ],
      regiaoAtiva: 'Regiao X',
      atualId: 'h1',
    })
    const s = getGroupState(NEW)
    expect(s.hexes).toHaveLength(1)
    expect(s.regiaoAtiva).toBe('Regiao X')
    expect(s.atualId).toBe('h1')
  })

  it('groupStateJson é canônico e igual pra estados equivalentes (base do guard anti-loop)', () => {
    const a = groupStateJson({ hexes: [{ id: 'h1', col: 1, row: 2 }], regiaoAtiva: 'R' })
    const b = groupStateJson({ hexes: [{ id: 'h1', col: 1, row: 2 }], regiaoAtiva: 'R' })
    expect(a).toBe(b)
    expect(groupStateJson({ hexes: [] })).not.toBe(a)
  })
})
