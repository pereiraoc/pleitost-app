// @vitest-environment jsdom
// Tema (theme.ts): base aesthetic×mode + COR DE DESTAQUE (preset/custom) aplicada
// como override inline de --accent/--accent2/--sb no :root, persistida em
// `pleitost.theme` (chave que SINCRONIZA por conta via remote-persist), com
// migração da chave antiga `pleitost-theme`.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { ACCENT_PRESETS, useTheme, __resetThemeForTests } from '../src/theme'

const root = () => document.documentElement
const cssVar = (name: string) => root().style.getPropertyValue(name)

// jsdom+vitest: o localStorage nativo do Node (experimental) sombreia o do jsdom
// e vem undefined. Instala um mock em memória em globalThis pra que o teste E o
// theme.ts (que usa `localStorage` cru) compartilhem o MESMO store.
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

describe('theme — base aesthetic × mode', () => {
  it('default é medieval/light/padrao, sem override de destaque', () => {
    const { result } = renderHook(() => useTheme())
    expect(result.current.mode).toBe('light')
    expect(result.current.aesthetic).toBe('medieval')
    expect(result.current.accent).toBe('padrao')
    expect(root().dataset.mode).toBe('light')
    expect(root().dataset.aesthetic).toBe('medieval')
    expect(cssVar('--accent')).toBe('') // 'padrão' não sobrescreve a paleta base
  })

  it('toggleMode/setMode/setAesthetic seguem funcionando (regressão)', () => {
    const { result } = renderHook(() => useTheme())
    act(() => result.current.toggleMode())
    expect(result.current.mode).toBe('dark')
    expect(root().dataset.mode).toBe('dark')
    act(() => result.current.setMode('light'))
    expect(result.current.mode).toBe('light')
    act(() => result.current.setAesthetic('cyberpunk'))
    expect(root().dataset.aesthetic).toBe('cyberpunk')
  })
})

describe('theme — cor de destaque', () => {
  it('preset nomeado aplica --accent/--accent2/--sb inline e persiste', () => {
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setAccent('rubi'))
    expect(cssVar('--accent')).toBe(ACCENT_PRESETS.rubi.accent)
    expect(cssVar('--accent2')).toBe(ACCENT_PRESETS.rubi.accent2)
    expect(cssVar('--sb')).toContain('color-mix')
    expect(cssVar('--sb')).toContain(ACCENT_PRESETS.rubi.accent)
    const saved = JSON.parse(localStorage.getItem('pleitost.theme') as string)
    expect(saved.accent).toBe('rubi')
  })

  it("voltar para 'padrao' remove os overrides (paleta base reaparece)", () => {
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setAccent('safira'))
    expect(cssVar('--accent')).toBe(ACCENT_PRESETS.safira.accent)
    act(() => result.current.setAccent('padrao'))
    expect(cssVar('--accent')).toBe('')
    expect(cssVar('--accent2')).toBe('')
    expect(cssVar('--sb')).toBe('')
  })

  it('setCustomAccent muda para custom, define --accent e NÃO define --accent2', () => {
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setAccent('rubi')) // define accent2 antes…
    act(() => result.current.setCustomAccent('#123456'))
    expect(result.current.accent).toBe('custom')
    expect(result.current.customAccent).toBe('#123456')
    expect(cssVar('--accent')).toBe('#123456')
    expect(cssVar('--accent2')).toBe('') // custom só mexe no accent; accent2 fica do base
  })
})

describe('theme — persistência e migração', () => {
  it('persiste na chave nova pleitost.theme (sincroniza por conta)', () => {
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setMode('dark'))
    expect(localStorage.getItem('pleitost.theme')).toBeTruthy()
  })

  it('migra a chave antiga pleitost-theme → pleitost.theme e a remove', () => {
    localStorage.setItem('pleitost-theme', JSON.stringify({ mode: 'dark', aesthetic: 'cyberpunk' }))
    __resetThemeForTests()
    const { result } = renderHook(() => useTheme())
    expect(result.current.mode).toBe('dark')
    expect(result.current.aesthetic).toBe('cyberpunk')
    expect(result.current.accent).toBe('padrao') // shape antigo ganha o default
    expect(localStorage.getItem('pleitost-theme')).toBeNull()
    expect(JSON.parse(localStorage.getItem('pleitost.theme') as string).mode).toBe('dark')
  })

  it('normalize rejeita lixo persistido e cai nos defaults', () => {
    localStorage.setItem(
      'pleitost.theme',
      JSON.stringify({ mode: 'x', aesthetic: 9, accent: 'nope', customAccent: 'not-a-color' }),
    )
    __resetThemeForTests()
    const { result } = renderHook(() => useTheme())
    expect(result.current.mode).toBe('light')
    expect(result.current.aesthetic).toBe('medieval')
    expect(result.current.accent).toBe('padrao')
    expect(result.current.customAccent).toBeNull()
  })
})
