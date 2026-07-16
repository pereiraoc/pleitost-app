// Tema do app — QUATRO eixos (pedido do usuário):
//   • TEMA (cor): aco-solar, ferro-frio, safira, rubi, ambar, esmeralda.
//   • MODO (claro/escuro): CADA tema tem variante clara e escura (data-mode). O
//     toggle da topbar (☀️/🌙) alterna o modo do tema atual.
//   • CONTEXTO (vibe/fontes): fantasia | cyberpunk (data-context).
//   • COR DE DESTAQUE: as 6 cores + Customizada (override inline quando difere
//     do tema).
//
// Paletas em styles/theme.css: [data-theme='X'][data-mode='Y']. Estado de módulo
// via useSyncExternalStore; persiste em `pleitost.theme` (sincroniza por conta
// via remote-persist #239); migra shapes antigos.
import { useSyncExternalStore } from 'react'

export type ThemeName = 'aco-solar' | 'ferro-frio' | 'safira' | 'rubi' | 'ambar' | 'esmeralda'
export type Mode = 'dark' | 'light'
export type ContextName = 'fantasia' | 'cyberpunk'
export type AccentId = ThemeName | 'custom'

/** Temas (só a cor). O MODO (claro/escuro) é um eixo INDEPENDENTE — trocar de
 *  tema NÃO mexe no modo (e vice-versa). */
export const THEMES: { id: ThemeName; label: string }[] = [
  { id: 'aco-solar', label: 'AÇO SOLAR' },
  { id: 'ambar', label: 'ÂMBAR' },
  { id: 'ferro-frio', label: 'FERRO FRIO' },
  { id: 'safira', label: 'SAFIRA' },
  { id: 'rubi', label: 'RUBI' },
  { id: 'esmeralda', label: 'ESMERALDA' },
]
export const CONTEXTS: { id: ContextName; label: string; ic: string }[] = [
  { id: 'fantasia', label: 'FANTASIA', ic: '🏰' },
  { id: 'cyberpunk', label: 'CYBERPUNK', ic: '🌃' },
]
export const MODES: { id: Mode; label: string; ic: string }[] = [
  { id: 'light', label: 'CLARO', ic: '☀️' },
  { id: 'dark', label: 'ESCURO', ic: '🌙' },
]

/** Cores de destaque — ESPELHAM os --accent das paletas (mesma cor, pra a seleção
 *  de destaque bater com o tema homônimo). */
export const ACCENT_COLORS: Record<ThemeName, { label: string; accent: string; accent2: string }> = {
  'aco-solar': { label: 'AÇO SOLAR', accent: '#c68a1e', accent2: '#4f7d84' },
  'ferro-frio': { label: 'FERRO FRIO', accent: '#9a7fd6', accent2: '#6f8a9e' },
  safira: { label: 'SAFIRA', accent: '#4a86e8', accent2: '#46b0c0' },
  rubi: { label: 'RUBI', accent: '#e0503f', accent2: '#d99a3a' },
  ambar: { label: 'ÂMBAR', accent: '#d99a2b', accent2: '#7a8a55' },
  esmeralda: { label: 'ESMERALDA', accent: '#35b87a', accent2: '#c2a24a' },
}

const THEME_IDS = THEMES.map((t) => t.id)
function isThemeName(v: unknown): v is ThemeName {
  return typeof v === 'string' && (THEME_IDS as string[]).includes(v)
}
function isMode(v: unknown): v is Mode {
  return v === 'dark' || v === 'light'
}
function isContext(v: unknown): v is ContextName {
  return v === 'fantasia' || v === 'cyberpunk'
}
function isAccentId(v: unknown): v is AccentId {
  return v === 'custom' || isThemeName(v)
}

const STORAGE_KEY = 'pleitost.theme'
const OLD_STORAGE_KEY = 'pleitost-theme'

export interface ThemeState {
  theme: ThemeName
  mode: Mode
  context: ContextName
  accent: AccentId
  customAccent: string | null
}

const DEFAULT: ThemeState = {
  theme: 'aco-solar',
  mode: 'light',
  context: 'fantasia',
  accent: 'aco-solar',
  customAccent: null,
}

/** Sanitiza qualquer JSON persistido (inclusive shapes antigos) num ThemeState. */
function normalize(p: unknown): { state: ThemeState; legacy: boolean } {
  const o = (typeof p === 'object' && p !== null ? p : {}) as Record<string, unknown>
  let legacy = false
  // TEMA (medieval/cyberpunk antigos viraram contexto → tema neutro).
  let theme: ThemeName
  if (isThemeName(o.theme)) theme = o.theme
  else if (o.theme === 'cyberpunk' || o.aesthetic === 'cyberpunk') {
    theme = 'ferro-frio'
    legacy = true
  } else {
    theme = DEFAULT.theme
    if (o.theme !== undefined || o.aesthetic !== undefined) legacy = true
  }
  // MODO: eixo independente do tema; direto ou o default global.
  let mode: Mode
  if (isMode(o.mode)) mode = o.mode
  else {
    mode = DEFAULT.mode
    if (o.mode === undefined && (o.theme !== undefined || o.aesthetic !== undefined)) legacy = true
  }
  // CONTEXTO.
  let context: ContextName
  if (isContext(o.context)) context = o.context
  else {
    context = o.theme === 'cyberpunk' || o.aesthetic === 'cyberpunk' ? 'cyberpunk' : DEFAULT.context
    if (o.context === undefined) legacy = true
  }
  // DESTAQUE: 'padrao' antigo → segue o tema; 'ametista' → ferro-frio.
  let accent: AccentId
  if (isAccentId(o.accent)) accent = o.accent
  else if (o.accent === 'padrao') {
    accent = theme
    legacy = true
  } else if (o.accent === 'ametista') {
    accent = 'ferro-frio'
    legacy = true
  } else {
    accent = theme
    if (o.accent !== undefined) legacy = true
  }
  const customAccent =
    typeof o.customAccent === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(o.customAccent) ? o.customAccent : null
  return { state: { theme, mode, context, accent, customAccent }, legacy }
}

function loadTheme(): ThemeState {
  let raw: string | null = null
  let needsPersist = false
  try {
    raw = localStorage.getItem(STORAGE_KEY)
    if (raw == null) {
      const old = localStorage.getItem(OLD_STORAGE_KEY)
      if (old != null) {
        raw = old
        needsPersist = true
        try {
          localStorage.removeItem(OLD_STORAGE_KEY)
        } catch {
          /* storage read-only */
        }
      }
    }
  } catch {
    /* primeira visita / storage indisponível */
  }
  let result: ThemeState = { ...DEFAULT }
  if (raw != null) {
    try {
      const { state, legacy } = normalize(JSON.parse(raw))
      result = state
      if (legacy) needsPersist = true
    } catch {
      needsPersist = true
    }
  }
  if (needsPersist) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(result))
    } catch {
      /* storage indisponível */
    }
  }
  return result
}

let state: ThemeState | null = null
const listeners = new Set<() => void>()

function applyDom(t: ThemeState) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.dataset.theme = t.theme
  root.dataset.mode = t.mode
  root.dataset.context = t.context
  const s = root.style
  if (t.accent === 'custom') {
    if (t.customAccent) {
      s.setProperty('--accent', t.customAccent)
      s.removeProperty('--accent2')
      s.setProperty('--sb', `color-mix(in srgb, ${t.customAccent} 30%, transparent)`)
    } else {
      s.removeProperty('--accent')
      s.removeProperty('--accent2')
      s.removeProperty('--sb')
    }
    return
  }
  // Destaque = o do próprio tema → sem override (a paleta do modo atual manda).
  if (t.accent === t.theme) {
    s.removeProperty('--accent')
    s.removeProperty('--accent2')
    s.removeProperty('--sb')
    return
  }
  const c = ACCENT_COLORS[t.accent]
  s.setProperty('--accent', c.accent)
  s.setProperty('--accent2', c.accent2)
  s.setProperty('--sb', `color-mix(in srgb, ${c.accent} 30%, transparent)`)
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
    isDark: theme.mode === 'dark',
    /** Troca só o TEMA (cor) — NÃO mexe no modo (eixo independente). Coordena o
     *  destaque com a cor (dá pra trocar o destaque à parte depois). */
    setTheme: (t: ThemeName) => writeTheme((s) => ({ ...s, theme: t, accent: t })),
    /** Define o MODO (claro/escuro) do tema atual. */
    setMode: (mode: Mode) => writeTheme((s) => ({ ...s, mode })),
    /** Alterna claro/escuro (toggle da topbar), mantendo tema/contexto/destaque. */
    toggleLightDark: () => writeTheme((s) => ({ ...s, mode: s.mode === 'dark' ? 'light' : 'dark' })),
    /** Troca o CONTEXTO (fontes/vibe). */
    setContext: (c: ContextName) => writeTheme((s) => ({ ...s, context: c })),
    /** COR DE DESTAQUE (independente do tema). */
    setAccent: (accent: AccentId) => writeTheme((s) => ({ ...s, accent })),
    setCustomAccent: (hex: string) => writeTheme((s) => ({ ...s, accent: 'custom', customAccent: hex })),
  }
}

/** Snapshot não-reativo (para módulos fora de React). */
export function getThemeSnapshot(): ThemeState {
  return getTheme()
}

/** SÓ testes: zera o cache em memória e limpa overrides do DOM. */
export function __resetThemeForTests(): void {
  state = null
  if (typeof document !== 'undefined') {
    const s = document.documentElement.style
    s.removeProperty('--accent')
    s.removeProperty('--accent2')
    s.removeProperty('--sb')
  }
}
