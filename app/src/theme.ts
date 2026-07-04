import { useEffect, useState } from 'react'

// Defaults do design (data-props do Companion App.dc.html): medieval + light.
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

export function useTheme() {
  const [theme, setTheme] = useState<ThemeState>(loadTheme)

  useEffect(() => {
    document.documentElement.dataset.mode = theme.mode
    document.documentElement.dataset.aesthetic = theme.aesthetic
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(theme))
    } catch {
      /* storage indisponível */
    }
  }, [theme])

  return {
    ...theme,
    toggleMode: () =>
      setTheme((t) => ({ ...t, mode: t.mode === 'dark' ? 'light' : 'dark' })),
    setAesthetic: (aesthetic: Aesthetic) => setTheme((t) => ({ ...t, aesthetic })),
  }
}
