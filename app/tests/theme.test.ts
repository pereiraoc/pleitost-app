// @vitest-environment jsdom
// Tema (theme.ts): 4 eixos — TEMA (cor, data-theme), MODO (claro/escuro,
// data-mode; cada tema tem as duas variantes), CONTEXTO (fontes, data-context) e
// COR DE DESTAQUE (override inline quando difere do tema). Persiste em
// `pleitost.theme` (sincroniza por conta); migra shapes antigos.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { ACCENT_COLORS, useTheme, __resetThemeForTests } from '../src/theme'

const root = () => document.documentElement
const cssVar = (name: string) => root().style.getPropertyValue(name)

beforeAll(() => {
  const store = new Map<string, string>()
  const mock = {
    get length() {
      return store.size
    },
    clear: () => store.clear(),
    getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    removeItem: (k: string) => void store.delete(k),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
  }
  Object.defineProperty(globalThis, 'localStorage', { value: mock, configurable: true, writable: true })
})

beforeEach(() => {
  localStorage.clear()
  __resetThemeForTests()
})
afterEach(() => {
  cleanup()
  __resetThemeForTests()
})

describe('theme — TEMA (cor) × MODO (claro/escuro)', () => {
  it('default: aco-solar / light / fantasia nos data-* do <html>', () => {
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('aco-solar')
    expect(result.current.mode).toBe('light')
    expect(result.current.isDark).toBe(false)
    expect(root().dataset.theme).toBe('aco-solar')
    expect(root().dataset.mode).toBe('light')
    expect(root().dataset.context).toBe('fantasia')
  })

  it('setTheme NÃO mexe no modo (eixos independentes)', () => {
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setTheme('ferro-frio'))
    expect(root().dataset.theme).toBe('ferro-frio')
    expect(root().dataset.mode).toBe('light') // modo inalterado (default light)
    // escolhe escuro; trocar de tema mantém o escuro
    act(() => result.current.setMode('dark'))
    act(() => result.current.setTheme('aco-solar'))
    expect(root().dataset.theme).toBe('aco-solar')
    expect(root().dataset.mode).toBe('dark') // modo mantido
  })

  it('toggleLightDark alterna o MODO do tema atual (mantém o tema)', () => {
    const { result } = renderHook(() => useTheme())
    act(() => result.current.toggleLightDark()) // aco-solar light → dark
    expect(result.current.theme).toBe('aco-solar') // MESMO tema
    expect(result.current.mode).toBe('dark')
    expect(root().dataset.mode).toBe('dark')
    act(() => result.current.toggleLightDark())
    expect(result.current.mode).toBe('light')
  })

  it('setMode define o modo explicitamente', () => {
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setTheme('safira')) // dark
    act(() => result.current.setMode('light'))
    expect(root().dataset.theme).toBe('safira')
    expect(root().dataset.mode).toBe('light') // safira CLARO
  })
})

describe('theme — CONTEXTO e COR DE DESTAQUE', () => {
  it('setContext é ortogonal (só as fontes/data-context)', () => {
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setTheme('rubi'))
    act(() => result.current.setContext('cyberpunk'))
    expect(root().dataset.context).toBe('cyberpunk')
    expect(root().dataset.theme).toBe('rubi')
  })

  it('destaque de OUTRA cor sobrepõe --accent inline; igual ao tema não', () => {
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setTheme('esmeralda'))
    expect(cssVar('--accent')).toBe('') // destaque = tema → sem override
    act(() => result.current.setAccent('rubi'))
    expect(cssVar('--accent')).toBe(ACCENT_COLORS.rubi.accent)
    expect(cssVar('--accent2')).toBe(ACCENT_COLORS.rubi.accent2)
  })

  it('setCustomAccent define --accent, não --accent2', () => {
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setCustomAccent('#123456'))
    expect(result.current.accent).toBe('custom')
    expect(cssVar('--accent')).toBe('#123456')
    expect(cssVar('--accent2')).toBe('')
  })
})

describe('theme — persistência e migração', () => {
  it('persiste tema+modo na chave nova pleitost.theme', () => {
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setTheme('rubi'))
    act(() => result.current.setMode('light'))
    const saved = JSON.parse(localStorage.getItem('pleitost.theme') as string)
    expect(saved.theme).toBe('rubi')
    expect(saved.mode).toBe('light')
  })

  it('migra shape antigo {mode,aesthetic:cyberpunk} → ferro-frio/dark/cyberpunk', () => {
    localStorage.setItem('pleitost-theme', JSON.stringify({ mode: 'dark', aesthetic: 'cyberpunk', accent: 'ametista' }))
    __resetThemeForTests()
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('ferro-frio')
    expect(result.current.mode).toBe('dark')
    expect(result.current.context).toBe('cyberpunk')
    expect(result.current.accent).toBe('ferro-frio')
    expect(localStorage.getItem('pleitost-theme')).toBeNull()
  })

  it('normalize rejeita lixo e cai no default aco-solar/light/fantasia', () => {
    localStorage.setItem('pleitost.theme', JSON.stringify({ theme: 'nope', mode: 5, context: 9, accent: 'xyz' }))
    __resetThemeForTests()
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('aco-solar')
    expect(result.current.mode).toBe('light')
    expect(result.current.context).toBe('fantasia')
    expect(result.current.accent).toBe('aco-solar')
  })
})
