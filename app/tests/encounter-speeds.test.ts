// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  getMonsterPrep,
  setMonsterPrep,
  getEncounterPreps,
  __resetEncounterSpeedsForTests,
} from '../src/data/encounter-speeds'

function makeStorage(): Storage {
  const d = new Map<string, string>()
  return {
    get length() {
      return d.size
    },
    clear: () => d.clear(),
    getItem: (k: string) => (d.has(k) ? d.get(k)! : null),
    key: (i: number) => [...d.keys()][i] ?? null,
    removeItem: (k: string) => void d.delete(k),
    setItem: (k: string, v: string) => void d.set(k, String(v)),
  }
}
beforeAll(() => {
  if (!window.localStorage) {
    Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true })
  }
})
afterEach(() => {
  window.localStorage.clear()
  __resetEncounterSpeedsForTests()
})

describe('encounter-speeds', () => {
  it('default: tier null, não escondido, não disfarçado', () => {
    expect(getMonsterPrep('Campanhas/Combates/X', 'Goblin#1')).toEqual({
      tier: null,
      escondido: false,
      disfarcado: false,
    })
  })

  it('set/override por monstro, persiste e é independente por instância', () => {
    setMonsterPrep('X', 'Goblin#1', { tier: 'super' })
    setMonsterPrep('X', 'Goblin#1', { escondido: true })
    expect(getMonsterPrep('X', 'Goblin#1')).toEqual({ tier: 'super', escondido: true, disfarcado: false })
    expect(getMonsterPrep('X', 'Goblin#2').tier).toBeNull()
    expect(Object.keys(getEncounterPreps('X'))).toEqual(['Goblin#1'])
  })

  it('persiste no localStorage (sobrevive a um reset do cache)', () => {
    setMonsterPrep('X', 'Goblin#1', { tier: 'lento' })
    __resetEncounterSpeedsForTests() // simula reload (cache zerado, localStorage intacto)
    expect(getMonsterPrep('X', 'Goblin#1').tier).toBe('lento')
  })
})
