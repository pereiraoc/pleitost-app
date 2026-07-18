// @vitest-environment jsdom
// Bug: a cor de destaque (accent) "volta pro padrão" ao reabrir. Reproduz o
// ciclo LOCAL: selecionar accent → persistir → recarregar (reset do módulo) →
// deve manter o accent escolhido.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { useTheme, getThemeSnapshot, __resetThemeForTests } from '../src/theme'
import { renderHook, act } from '@testing-library/react'

// jsdom sem --localstorage-file → window.localStorage vem undefined; polyfill
// fiel só no teste (mesmo shim do config.test).
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

afterEach(() => {
  __resetThemeForTests()
  window.localStorage.clear()
})

describe('persistência da cor de destaque', () => {
  it('accent escolhido sobrevive ao "reabrir" (reset do módulo + reload)', () => {
    const { result } = renderHook(() => useTheme())
    // tema ferro-frio (escuro) + destaque aço-solar (independente do tema)
    act(() => result.current.setTheme('ferro-frio'))
    act(() => result.current.setAccent('aco-solar'))
    expect(JSON.parse(localStorage.getItem('pleitost.theme')!).accent).toBe('aco-solar')

    // "reabrir": zera o cache do módulo e recarrega do localStorage
    __resetThemeForTests()
    expect(getThemeSnapshot().accent).toBe('aco-solar')
    expect(getThemeSnapshot().theme).toBe('ferro-frio')
  })

  it('estado antigo salvo com accent "ametista" migra p/ ferro-frio (não trava o novo pick)', () => {
    window.localStorage.setItem(
      'pleitost.theme',
      JSON.stringify({ theme: 'ferro-frio', mode: 'dark', context: 'fantasia', accent: 'ametista' }),
    )
    // carrega o legado
    expect(getThemeSnapshot().accent).toBe('ferro-frio')
    // agora escolhe aço-solar e recarrega — deve manter
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setAccent('aco-solar'))
    __resetThemeForTests()
    expect(getThemeSnapshot().accent).toBe('aco-solar')
  })
})
