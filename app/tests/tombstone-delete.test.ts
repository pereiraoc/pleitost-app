// @vitest-environment jsdom
// removeLocalEntity grava TOMBSTONE persistido — a deleção propaga pelo sync
// por conta em vez de ressuscitar pela união (#366 follow-up).
import { beforeEach, describe, expect, it } from 'vitest'
import {
  createLocalEntity,
  emptyHeroFrontmatter,
  getLocalDoc,
  removeLocalEntity,
  __resetLocalStoreForTests,
} from '../src/data/local-entities'

function makeStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k) => (data.has(k) ? data.get(k)! : null),
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  }
}

beforeEach(() => {
  if (!window.localStorage) {
    Object.defineProperty(window, 'localStorage', { value: makeStorage(), configurable: true })
  }
  window.localStorage.clear()
  __resetLocalStoreForTests()
})

describe('tombstones na deleção de entidade local', () => {
  it('deletar grava o tombstone no blob e remove a entidade', () => {
    const id = createLocalEntity('Heroi', 'Temporário', emptyHeroFrontmatter())
    expect(getLocalDoc(id)).toBeTruthy()
    removeLocalEntity(id)
    expect(getLocalDoc(id)).toBeUndefined()
    const blob = JSON.parse(window.localStorage.getItem('pleitost.localEntities')!)
    expect(blob[id]).toBeUndefined()
    expect(blob.__tombstones__?.[id], 'tombstone persistido').toBeTruthy()
  })
})
