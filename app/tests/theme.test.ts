// @vitest-environment jsdom
// Tema (theme.ts): TEMA = paleta completa via data-theme; COR DE DESTAQUE separada
// (override inline de --accent/--accent2/--sb). Persiste em `pleitost.theme` (chave
// que sincroniza por conta), migrando shape antigo {mode,aesthetic}.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { ACCENT_PRESETS, useTheme, __resetThemeForTests } from '../src/theme'

const root = () => document.documentElement
const cssVar = (name: string) => root().style.getPropertyValue(name)

// jsdom+vitest: o localStorage nativo do Node sombreia o do jsdom (vem undefined).
// Instala um mock em memória em globalThis pra o teste E o theme.ts compartilharem.
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

describe('theme — tema (paleta completa)', () => {
  it('default é aco-solar e vira data-theme no <html>', () => {
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('aco-solar')
    expect(result.current.isDark).toBe(false)
    expect(root().dataset.theme).toBe('aco-solar')
  })

  it('setTheme troca o tema (aplica data-theme e marca escuro)', () => {
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setTheme('ferro-frio'))
    expect(root().dataset.theme).toBe('ferro-frio')
    expect(result.current.isDark).toBe(true)
    act(() => result.current.setTheme('medieval'))
    expect(root().dataset.theme).toBe('medieval')
    expect(result.current.isDark).toBe(false)
  })

  it('toggleLightDark pula entre os temas-assinatura claro/escuro', () => {
    const { result } = renderHook(() => useTheme())
    act(() => result.current.toggleLightDark()) // aco-solar (claro) → ferro-frio
    expect(result.current.theme).toBe('ferro-frio')
    act(() => result.current.toggleLightDark()) // ferro-frio (escuro) → aco-solar
    expect(result.current.theme).toBe('aco-solar')
  })
})

describe('theme — cor de destaque (separada do tema)', () => {
  it('preset aplica --accent/--accent2/--sb inline e persiste, sem mexer no tema', () => {
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setTheme('ferro-frio'))
    act(() => result.current.setAccent('rubi'))
    expect(result.current.theme).toBe('ferro-frio') // tema intacto
    expect(cssVar('--accent')).toBe(ACCENT_PRESETS.rubi.accent)
    expect(cssVar('--accent2')).toBe(ACCENT_PRESETS.rubi.accent2)
    expect(cssVar('--sb')).toContain('color-mix')
    const saved = JSON.parse(localStorage.getItem('pleitost.theme') as string)
    expect(saved.accent).toBe('rubi')
    expect(saved.theme).toBe('ferro-frio')
  })

  it("'padrao' remove os overrides (destaque do tema reaparece)", () => {
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setAccent('safira'))
    expect(cssVar('--accent')).toBe(ACCENT_PRESETS.safira.accent)
    act(() => result.current.setAccent('padrao'))
    expect(cssVar('--accent')).toBe('')
    expect(cssVar('--accent2')).toBe('')
    expect(cssVar('--sb')).toBe('')
  })

  it('setCustomAccent muda para custom, define --accent e não define --accent2', () => {
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setAccent('rubi'))
    act(() => result.current.setCustomAccent('#123456'))
    expect(result.current.accent).toBe('custom')
    expect(result.current.customAccent).toBe('#123456')
    expect(cssVar('--accent')).toBe('#123456')
    expect(cssVar('--accent2')).toBe('')
  })
})

describe('theme — persistência e migração', () => {
  it('persiste na chave nova pleitost.theme', () => {
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setTheme('cyberpunk'))
    expect(JSON.parse(localStorage.getItem('pleitost.theme') as string).theme).toBe('cyberpunk')
  })

  it('migra shape antigo {mode,aesthetic} → theme, e chave antiga pleitost-theme', () => {
    localStorage.setItem('pleitost-theme', JSON.stringify({ mode: 'dark', aesthetic: 'cyberpunk' }))
    __resetThemeForTests()
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('cyberpunk') // aesthetic antigo → theme
    expect(result.current.accent).toBe('padrao')
    expect(localStorage.getItem('pleitost-theme')).toBeNull()
    expect(JSON.parse(localStorage.getItem('pleitost.theme') as string).theme).toBe('cyberpunk')
  })

  it('normalize rejeita lixo e cai no default aco-solar', () => {
    localStorage.setItem('pleitost.theme', JSON.stringify({ theme: 'nope', accent: 42, customAccent: 'xyz' }))
    __resetThemeForTests()
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('aco-solar')
    expect(result.current.accent).toBe('padrao')
    expect(result.current.customAccent).toBeNull()
  })
})
