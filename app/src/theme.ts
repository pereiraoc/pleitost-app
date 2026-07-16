// Tema do app — TEMA (paleta completa) + COR DE DESTAQUE (separados, pedido do
// usuário).
//
// TEMA: um nome que seleciona a PALETA INTEIRA (fundo/painéis/texto/linhas/…) em
// styles/theme.css via `data-theme` no <html>. São paletas completas e bem
// distintas (não só troca de uma cor): 'aco-solar' (padrão, aço claro e quente),
// 'ferro-frio' (bem escuro, cinza + roxo), 'medieval' (pergaminho), 'cyberpunk'
// (neon escuro).
//
// COR DE DESTAQUE: SEPARADA do tema — sobrepõe --accent/--accent2/--sb como
// override inline no :root (vence a folha), recolorindo realces/ativos sem mexer
// no resto da paleta do tema. 'padrao' = usa o destaque do próprio tema.
//
// Estado de MÓDULO via useSyncExternalStore. Persiste em `pleitost.theme` (chave
// que SINCRONIZA por conta via remote-persist #239). Migra chaves/shapes antigos.
import { useSyncExternalStore } from 'react'

/** Tema = paleta completa nomeada. */
export type ThemeName = 'aco-solar' | 'ferro-frio' | 'medieval' | 'cyberpunk'
/** Cor de destaque: 'padrao' = a do tema; 'custom' = cor livre; resto = preset. */
export type AccentId = 'padrao' | 'esmeralda' | 'rubi' | 'safira' | 'ametista' | 'custom'

/** Metadados dos temas (rótulo, ícone, se é escuro — pro toggle da topbar). */
export const THEMES: { id: ThemeName; label: string; ic: string; dark: boolean }[] = [
  { id: 'aco-solar', label: 'AÇO SOLAR', ic: '🔆', dark: false },
  { id: 'ferro-frio', label: 'FERRO FRIO', ic: '🌑', dark: true },
  { id: 'medieval', label: 'MEDIEVAL', ic: '🏰', dark: false },
  { id: 'cyberpunk', label: 'CYBERPUNK', ic: '🌃', dark: true },
]
const THEME_IDS = THEMES.map((t) => t.id)
function isThemeName(v: unknown): v is ThemeName {
  return typeof v === 'string' && (THEME_IDS as string[]).includes(v)
}
function isDarkTheme(id: ThemeName): boolean {
  return THEMES.find((t) => t.id === id)?.dark ?? false
}

/** Presets de destaque — recolorem --accent/--accent2 (e --sb, derivada). */
export const ACCENT_PRESETS: Record<
  Exclude<AccentId, 'padrao' | 'custom'>,
  { label: string; accent: string; accent2: string }
> = {
  esmeralda: { label: 'ESMERALDA', accent: '#2f9e6b', accent2: '#b3823a' },
  rubi: { label: 'RUBI', accent: '#c4433a', accent2: '#c79233' },
  safira: { label: 'SAFIRA', accent: '#3f74c9', accent2: '#3fa08f' },
  ametista: { label: 'AMETISTA', accent: '#8b5bd0', accent2: '#4fa38c' },
}

const STORAGE_KEY = 'pleitost.theme'
const OLD_STORAGE_KEY = 'pleitost-theme'

export interface ThemeState {
  theme: ThemeName
  accent: AccentId
  /** Cor hex livre — usada só quando accent === 'custom'. */
  customAccent: string | null
}

const DEFAULT: ThemeState = { theme: 'aco-solar', accent: 'padrao', customAccent: null }

function isAccentId(v: unknown): v is AccentId {
  return v === 'padrao' || v === 'custom' || (typeof v === 'string' && v in ACCENT_PRESETS)
}

/** Sanitiza qualquer JSON persistido (inclusive shapes antigos com mode/aesthetic)
 *  num ThemeState completo — nunca confia no storage. */
function normalize(p: unknown): ThemeState {
  const o = (typeof p === 'object' && p !== null ? p : {}) as Record<string, unknown>
  const hex = typeof o.customAccent === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(o.customAccent) ? o.customAccent : null
  // theme direto; senão deriva do 'aesthetic' antigo (medieval/cyberpunk); senão default.
  const theme: ThemeName = isThemeName(o.theme)
    ? o.theme
    : o.aesthetic === 'medieval' || o.aesthetic === 'cyberpunk'
      ? o.aesthetic
      : DEFAULT.theme
  return {
    theme,
    accent: isAccentId(o.accent) ? o.accent : 'padrao',
    customAccent: hex,
  }
}

function loadTheme(): ThemeState {
  let raw: string | null = null
  let needsPersist = false
  try {
    raw = localStorage.getItem(STORAGE_KEY)
    if (raw == null) {
      // migração: chave antiga (hífen) não casava com o SYNCED → não sincronizava.
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
      const parsed = JSON.parse(raw) as Record<string, unknown>
      result = normalize(parsed)
      // shape antigo ({mode,aesthetic} sem `theme` válido) → re-persistir o novo,
      // pra a conta sincronizar o formato atual (não o legado).
      if (!isThemeName(parsed?.theme)) needsPersist = true
    } catch {
      needsPersist = true // corrompido → grava o default limpo
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

/** Override de destaque efetivo (ou null = usar o do tema). */
function accentOverride(theme: ThemeState): { accent: string; accent2: string | null } | null {
  if (theme.accent === 'custom') {
    return theme.customAccent ? { accent: theme.customAccent, accent2: null } : null
  }
  if (theme.accent === 'padrao') return null
  const p = ACCENT_PRESETS[theme.accent]
  return p ? { accent: p.accent, accent2: p.accent2 } : null
}

function applyDom(t: ThemeState) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.dataset.theme = t.theme
  const ov = accentOverride(t)
  const s = root.style
  if (!ov) {
    // 'padrão' → remove overrides, deixa o destaque do tema aparecer.
    s.removeProperty('--accent')
    s.removeProperty('--accent2')
    s.removeProperty('--sb')
    return
  }
  s.setProperty('--accent', ov.accent)
  if (ov.accent2) s.setProperty('--accent2', ov.accent2)
  else s.removeProperty('--accent2') // custom só define accent; accent2 fica do tema
  s.setProperty('--sb', `color-mix(in srgb, ${ov.accent} 30%, transparent)`)
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
    /** True se o tema atual é escuro (pro ícone do toggle). */
    isDark: isDarkTheme(theme.theme),
    /** Escolhe um tema completo. */
    setTheme: (t: ThemeName) => writeTheme((s) => ({ ...s, theme: t })),
    /** Atalho claro/escuro da topbar: pula pro tema-assinatura oposto. */
    toggleLightDark: () =>
      writeTheme((s) => ({ ...s, theme: isDarkTheme(s.theme) ? 'aco-solar' : 'ferro-frio' })),
    /** Preset de destaque (ou 'padrao'). */
    setAccent: (accent: AccentId) => writeTheme((s) => ({ ...s, accent })),
    /** Cor de destaque livre — já muda para 'custom'. */
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
