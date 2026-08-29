// @vitest-environment jsdom
// #519 C4 — sessões por MUNDO: criação carimba, listagem filtra, legado =
// fantasia, e TROCAR de mundo desconecta a sessão ativa.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  createSession,
  listSessions,
  getActiveSessionCode,
  setActiveSessionCode,
  __resetSessionStoreForTests,
} from '../src/data/session-store'
import { useTheme, __resetThemeForTests } from '../src/theme'
import { useSessions } from '../src/data/session-store'

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
  __resetSessionStoreForTests?.()
})

const setContext = (c: 'fantasia' | 'cyberpunk') => {
  const { result } = renderHook(() => useTheme())
  act(() => result.current.setContext(c))
}

describe('sessões por mundo (C4)', () => {
  it('mesa criada num mundo não aparece na lista do outro; legado = fantasia', () => {
    const fant = createSession('Mesa Fantasia', null, 'GM')
    expect(fant.world).toBe('fantasia')
    expect(listSessions().map((s) => s.codigo)).toContain(fant.codigo)

    setContext('cyberpunk')
    expect(listSessions()).toHaveLength(0)
    const cyb = createSession('Mesa POA', null, 'GM')
    expect(listSessions().map((s) => s.codigo)).toEqual([cyb.codigo])

    setContext('fantasia')
    expect(listSessions().map((s) => s.codigo)).toEqual([fant.codigo])
  })

  it('useSessions (snapshot da UI) também filtra pelo mundo', () => {
    const fant = createSession('Mesa UI', null, 'GM')
    const { result, rerender } = renderHook(() => useSessions())
    expect(result.current.sessions.map((s) => s.codigo)).toContain(fant.codigo)
    setContext('cyberpunk')
    rerender()
    expect(result.current.sessions).toHaveLength(0)
  })

  it('trocar de mundo DESCONECTA a sessão ativa', () => {
    const rec = createSession('Mesa Ativa', null, 'GM')
    setActiveSessionCode(rec.codigo)
    expect(getActiveSessionCode()).toBe(rec.codigo)
    setContext('cyberpunk')
    expect(getActiveSessionCode()).toBeNull()
    // trocar de volta NÃO reconecta sozinho (desconexão é natural, não toggle)
    setContext('fantasia')
    expect(getActiveSessionCode()).toBeNull()
  })
})
