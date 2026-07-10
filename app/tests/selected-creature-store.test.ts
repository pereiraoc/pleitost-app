// @vitest-environment jsdom
// Persistência do herói/NPC selecionado (#86).
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  __resetSelectedCreatureForTests,
  getSelectedCreature,
  setSelectedCreature,
  subscribeSelectedCreature,
} from '../src/data/selected-creature-store'

beforeAll(() => {
  if (typeof window !== 'undefined' && !window.localStorage) {
    const data = new Map<string, string>()
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        get length() {
          return data.size
        },
        clear: () => data.clear(),
        getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
        key: (i: number) => [...data.keys()][i] ?? null,
        removeItem: (k: string) => void data.delete(k),
        setItem: (k: string, v: string) => void data.set(k, String(v)),
      },
    })
  }
})
beforeEach(() => {
  window.localStorage.clear()
  __resetSelectedCreatureForTests()
})
afterEach(() => __resetSelectedCreatureForTests())

describe('selected-creature-store (#86)', () => {
  it('grava/lê a seleção e PERSISTE (rehidrata após "reload")', () => {
    expect(getSelectedCreature()).toBeNull()
    setSelectedCreature('Sistema/Criaturas/Heróis/Carlos')
    expect(getSelectedCreature()).toBe('Sistema/Criaturas/Heróis/Carlos')
    // grava na chave pleitost.* (durável via #84)
    expect(window.localStorage.getItem('pleitost.selectedCreature')).toContain('Carlos')
    // "reload": zera a memória, o localStorage rehidrata
    __resetSelectedCreatureForTests()
    expect(getSelectedCreature()).toBe('Sistema/Criaturas/Heróis/Carlos')
  })

  it('notifica assinantes na TROCA (idempotente); limpar com null', () => {
    let n = 0
    const un = subscribeSelectedCreature(() => n++)
    setSelectedCreature('a')
    setSelectedCreature('a') // mesma seleção → não notifica
    expect(n).toBe(1)
    setSelectedCreature('b')
    expect(n).toBe(2)
    setSelectedCreature(null)
    expect(getSelectedCreature()).toBeNull()
    expect(window.localStorage.getItem('pleitost.selectedCreature')).toBeNull()
    expect(n).toBe(3)
    un()
  })
})
