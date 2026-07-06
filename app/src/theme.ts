// Tema do app (aesthetic + mode) — defaults do design (data-props do
// Companion App.dc.html): medieval + light.
//
// Estado de MÓDULO compartilhado via useSyncExternalStore (mesmo padrão do
// hero-store): o toggle da topbar (AppShell) e a tela CONFIG leem/escrevem a
// MESMA fonte — mudar numa reflete na outra sem reload (issue #35). O estado
// aplicado ao DOM (data-mode/data-aesthetic no <html>) e persistido
// (localStorage) acompanha toda escrita.
import { useSyncExternalStore } from 'react'

export type Mode = 'dark' | 'light'
export type Aesthetic = 'cyberpunk' | 'medieval'

const STORAGE_KEY = 'pleitost-theme'

interface ThemeState {
  mode: Mode
  aesthetic: Aesthetic
}

function loadTheme(): ThemeState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as ThemeState
  } catch {
    /* primeira visita / storage indisponível */
  }
  return { mode: 'light', aesthetic: 'medieval' }
}

let state: ThemeState | null = null
const listeners = new Set<() => void>()

function applyDom(theme: ThemeState) {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.mode = theme.mode
  document.documentElement.dataset.aesthetic = theme.aesthetic
}

function getTheme(): ThemeState {
  if (!state) {
    state = loadTheme()
    applyDom(state)
  }
  return state
}

function writeTheme(update: (t: ThemeState) => ThemeState) {
  state = update(getTheme())
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* storage indisponível */
  }
  applyDom(state)
  for (const cb of listeners) cb()
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getTheme)

  return {
    ...theme,
    toggleMode: () =>
      writeTheme((t) => ({ ...t, mode: t.mode === 'dark' ? 'light' : 'dark' })),
    setMode: (mode: Mode) => writeTheme((t) => ({ ...t, mode })),
    setAesthetic: (aesthetic: Aesthetic) => writeTheme((t) => ({ ...t, aesthetic })),
  }
}
