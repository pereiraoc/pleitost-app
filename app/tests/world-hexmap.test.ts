// @vitest-environment jsdom
// #519 C5 — hexMap por MUNDO: fantasia nas chaves legadas (dados intactos);
// cyberpunk em namespace próprio; troca de mundo isola sem vazar células.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { getHexMapState, setHexLocal, __setSeedsForTests } from '../src/data/hexmap-store'
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
  window.localStorage.clear()
  __resetThemeForTests()
  __setSeedsForTests({})
})

const setContext = (c: 'fantasia' | 'cyberpunk') => {
  const { result } = renderHook(() => useTheme())
  act(() => result.current.setContext(c))
}

describe('hexMap por mundo (C5)', () => {
  it('células de um mundo não vazam pro outro; fantasia usa a chave legada', () => {
    setHexLocal('Regiao X', 1, 2, 'local:um')
    expect(getHexMapState('Regiao X').cells).toHaveLength(1)
    expect(window.localStorage.getItem('pleitost.hexMap.Regiao X')).toBeTruthy()

    setContext('cyberpunk')
    expect(getHexMapState('Regiao X').cells).toHaveLength(0)
    setHexLocal('Regiao X', 3, 4, 'local:poa')
    expect(getHexMapState('Regiao X').cells).toHaveLength(1)
    expect(window.localStorage.getItem('pleitost.hexMap.cyberpunk.Regiao X')).toBeTruthy()

    setContext('fantasia')
    expect(getHexMapState('Regiao X').cells.map((c) => c.localId)).toEqual(['local:um'])
  })
})
