// @vitest-environment jsdom
// #519 C3 — entidades locais por MUNDO: criação carimba o mundo ativo,
// listagem filtra, legado sem campo = fantasia, blob segue inteiro (sync).
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  createLocalEntity,
  getLocalEntity,
  localEntitiesOfKind,
  emptyHeroFrontmatter,
  __resetLocalStoreForTests,
} from '../src/data/local-entities'
import { useTheme, __resetThemeForTests } from '../src/theme'

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

beforeEach(() => {
  window.localStorage?.clear?.()
  __resetThemeForTests()
  __resetLocalStoreForTests()
})

const setContext = (c: 'fantasia' | 'cyberpunk') => {
  const { result } = renderHook(() => useTheme())
  act(() => result.current.setContext(c))
}

describe('entidades locais por mundo (C3)', () => {
  it('herói de um mundo não aparece na lista do outro; criação carimba o mundo', () => {
    const idFant = createLocalEntity('Heroi', 'Carlos', emptyHeroFrontmatter() as never)
    expect(getLocalEntity(idFant)?.world).toBe('fantasia')
    expect(localEntitiesOfKind('Heroi').map((r) => r.id)).toContain(idFant)

    setContext('cyberpunk')
    expect(localEntitiesOfKind('Heroi')).toHaveLength(0)
    const idCyb = createLocalEntity('Heroi', 'Neuromante', emptyHeroFrontmatter() as never)
    expect(getLocalEntity(idCyb)?.world).toBe('cyberpunk')
    expect(localEntitiesOfKind('Heroi').map((r) => r.id)).toEqual([idCyb])

    setContext('fantasia')
    expect(localEntitiesOfKind('Heroi').map((r) => r.id)).toEqual([idFant])
    // acesso DIRETO por id segue funcionando nos dois (rota/sync)
    expect(getLocalEntity(idCyb)).toBeTruthy()
  })

  it('entidade LEGADA sem campo world conta como fantasia', () => {
    const id = createLocalEntity('Heroi', 'Legado', emptyHeroFrontmatter() as never)
    // simula blob antigo persistido sem o campo
    const raw = JSON.parse(window.localStorage.getItem('pleitost.localEntities')!)
    delete raw[id].world
    window.localStorage.setItem('pleitost.localEntities', JSON.stringify(raw))
    __resetLocalStoreForTests()
    // rehidrata do storage “antigo”
    expect(localEntitiesOfKind('Heroi').some((r) => r.id === id)).toBe(true)
    setContext('cyberpunk')
    expect(localEntitiesOfKind('Heroi')).toHaveLength(0)
  })
})
