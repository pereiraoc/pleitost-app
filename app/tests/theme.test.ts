// @vitest-environment jsdom
// Tema (theme.ts): 3 eixos — TEMA (paleta, data-theme), CONTEXTO (fontes,
// data-context) e COR DE DESTAQUE (override inline quando difere do tema).
// Persiste em `pleitost.theme` (sincroniza por conta); migra shapes antigos.
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

describe('theme — TEMA (paleta) e CONTEXTO', () => {
  it('default: aco-solar + fantasia; vira data-theme/data-context no <html>', () => {
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('aco-solar')
    expect(result.current.context).toBe('fantasia')
    expect(result.current.isDark).toBe(false)
    expect(root().dataset.theme).toBe('aco-solar')
    expect(root().dataset.context).toBe('fantasia')
  })

  it('setTheme troca a paleta e coordena o destaque com ela', () => {
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setTheme('safira'))
    expect(root().dataset.theme).toBe('safira')
    expect(result.current.accent).toBe('safira') // coordenado
    expect(result.current.isDark).toBe(true)
    // destaque coincide com o tema → sem override inline (paleta manda)
    expect(cssVar('--accent')).toBe('')
  })

  it('setContext é ortogonal (só troca as fontes/data-context)', () => {
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setTheme('rubi'))
    act(() => result.current.setContext('cyberpunk'))
    expect(root().dataset.context).toBe('cyberpunk')
    expect(root().dataset.theme).toBe('rubi') // tema intacto
  })

  it('toggleLightDark pula aco-solar (claro) ↔ ferro-frio (escuro)', () => {
    const { result } = renderHook(() => useTheme())
    act(() => result.current.toggleLightDark())
    expect(result.current.theme).toBe('ferro-frio')
    act(() => result.current.toggleLightDark())
    expect(result.current.theme).toBe('aco-solar')
  })
})

describe('theme — COR DE DESTAQUE (separada do tema)', () => {
  it('destaque de OUTRA cor sobrepõe --accent/--accent2/--sb inline', () => {
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setTheme('esmeralda')) // tema+destaque esmeralda
    act(() => result.current.setAccent('rubi')) // destaque diferente → override
    expect(root().dataset.theme).toBe('esmeralda') // tema intacto
    expect(cssVar('--accent')).toBe(ACCENT_COLORS.rubi.accent)
    expect(cssVar('--accent2')).toBe(ACCENT_COLORS.rubi.accent2)
    expect(cssVar('--sb')).toContain(ACCENT_COLORS.rubi.accent)
  })

  it('destaque IGUAL ao tema não gera override (paleta manda)', () => {
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setAccent('safira'))
    act(() => result.current.setTheme('safira'))
    expect(cssVar('--accent')).toBe('')
  })

  it('setCustomAccent define --accent, não define --accent2', () => {
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setCustomAccent('#123456'))
    expect(result.current.accent).toBe('custom')
    expect(cssVar('--accent')).toBe('#123456')
    expect(cssVar('--accent2')).toBe('')
  })
})

describe('theme — persistência e migração', () => {
  it('persiste na chave nova pleitost.theme', () => {
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setTheme('rubi'))
    expect(JSON.parse(localStorage.getItem('pleitost.theme') as string).theme).toBe('rubi')
  })

  it('migra shape antigo {mode,aesthetic:cyberpunk} → ferro-frio + contexto cyberpunk', () => {
    localStorage.setItem('pleitost-theme', JSON.stringify({ mode: 'dark', aesthetic: 'cyberpunk', accent: 'ametista' }))
    __resetThemeForTests()
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('ferro-frio')
    expect(result.current.context).toBe('cyberpunk')
    expect(result.current.accent).toBe('ferro-frio') // ametista antigo → ferro-frio (roxo)
    expect(localStorage.getItem('pleitost-theme')).toBeNull()
    expect(JSON.parse(localStorage.getItem('pleitost.theme') as string).theme).toBe('ferro-frio')
  })

  it('normalize rejeita lixo e cai no default aco-solar/fantasia', () => {
    localStorage.setItem('pleitost.theme', JSON.stringify({ theme: 'nope', context: 9, accent: 'xyz' }))
    __resetThemeForTests()
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('aco-solar')
    expect(result.current.context).toBe('fantasia')
    expect(result.current.accent).toBe('aco-solar')
  })
})
