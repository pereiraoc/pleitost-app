// Tema do app — TRÊS eixos independentes (pedido do usuário):
//   • TEMA (paleta completa de cor): aco-solar, ferro-frio, safira, rubi, ambar,
//     esmeralda. Seleciona a paleta INTEIRA (fundo/painéis/texto/…) via data-theme.
//   • CONTEXTO (vibe + fontes): fantasia | cyberpunk. Troca as fontes/estilo via
//     data-context, ortogonal à cor.
//   • COR DE DESTAQUE: as mesmas 6 cores + Customizada. Sobrepõe --accent/--accent2/
//     --sb inline QUANDO difere do tema (quando coincide, deixa a paleta mandar).
//
// Tudo em styles/theme.css (data-theme = paletas, data-context = fontes). Estado
// de módulo via useSyncExternalStore. Persiste em `pleitost.theme` (sincroniza por
// conta via remote-persist #239); migra shapes antigos.
import { useSyncExternalStore } from 'react'

/** Tema = paleta de cor nomeada. */
export type ThemeName = 'aco-solar' | 'ferro-frio' | 'safira' | 'rubi' | 'ambar' | 'esmeralda'
/** Contexto = vibe/fontes. */
export type ContextName = 'fantasia' | 'cyberpunk'
/** Cor de destaque = uma das 6 cores, ou 'custom'. */
export type AccentId = ThemeName | 'custom'

/** Temas (rótulo + se é escuro, pro toggle claro/escuro da topbar). */
export const THEMES: { id: ThemeName; label: string; dark: boolean }[] = [
  { id: 'aco-solar', label: 'AÇO SOLAR', dark: false },
  { id: 'ambar', label: 'ÂMBAR', dark: false },
  { id: 'ferro-frio', label: 'FERRO FRIO', dark: true },
  { id: 'safira', label: 'SAFIRA', dark: true },
  { id: 'rubi', label: 'RUBI', dark: true },
  { id: 'esmeralda', label: 'ESMERALDA', dark: true },
]
export const CONTEXTS: { id: ContextName; label: string; ic: string }[] = [
  { id: 'fantasia', label: 'FANTASIA', ic: '🏰' },
  { id: 'cyberpunk', label: 'CYBERPUNK', ic: '🌃' },
]

/** Cores de destaque — ESPELHAM os --accent/--accent2 das paletas em theme.css
 *  (mesma cor, pra a seleção de destaque bater com o tema homônimo). */
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
function isContext(v: unknown): v is ContextName {
  return v === 'fantasia' || v === 'cyberpunk'
}
function isAccentId(v: unknown): v is AccentId {
  return v === 'custom' || isThemeName(v)
}
function isDarkTheme(id: ThemeName): boolean {
  return THEMES.find((t) => t.id === id)?.dark ?? false
}

const STORAGE_KEY = 'pleitost.theme'
const OLD_STORAGE_KEY = 'pleitost-theme'

export interface ThemeState {
  theme: ThemeName
  context: ContextName
  accent: AccentId
  customAccent: string | null
}

const DEFAULT: ThemeState = { theme: 'aco-solar', context: 'fantasia', accent: 'aco-solar', customAccent: null }

/** Sanitiza qualquer JSON persistido (inclusive shapes antigos) num ThemeState. */
function normalize(p: unknown): { state: ThemeState; legacy: boolean } {
  const o = (typeof p === 'object' && p !== null ? p : {}) as Record<string, unknown>
  let legacy = false
  // TEMA: novo direto; senão deriva do antigo (medieval/cyberpunk viraram
  // contexto → tema neutro claro/escuro).
  let theme: ThemeName
  if (isThemeName(o.theme)) theme = o.theme
  else if (o.theme === 'cyberpunk' || o.aesthetic === 'cyberpunk') {
    theme = 'ferro-frio'
    legacy = true
  } else {
    theme = DEFAULT.theme
    if (o.theme !== undefined || o.aesthetic !== undefined) legacy = true
  }
  // CONTEXTO: novo direto; senão deriva (cyberpunk antigo → cyberpunk).
  let context: ContextName
  if (isContext(o.context)) context = o.context
  else {
    context = o.theme === 'cyberpunk' || o.aesthetic === 'cyberpunk' ? 'cyberpunk' : DEFAULT.context
    if (o.context === undefined) legacy = true
  }
  // DESTAQUE: novo direto; 'padrao' antigo → segue o tema; 'ametista' antigo →
  // ferro-frio (roxo). Senão default = o tema.
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
  return { state: { theme, context, accent, customAccent }, legacy }
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
      if (legacy) needsPersist = true // shape antigo → re-persiste o formato novo
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
  root.dataset.context = t.context
  const s = root.style
  // Custom → sobrepõe só --accent (+ --sb); --accent2 fica do tema.
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
  // Destaque = o do próprio tema → sem override (deixa a paleta mandar).
  if (t.accent === t.theme) {
    s.removeProperty('--accent')
    s.removeProperty('--accent2')
    s.removeProperty('--sb')
    return
  }
  // Destaque de OUTRA cor → sobrepõe.
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
    isDark: isDarkTheme(theme.theme),
    /** Escolhe o TEMA (paleta). Coordena o destaque com ele (a cor homônima),
     *  mantendo os dois selecionáveis à parte depois. */
    setTheme: (t: ThemeName) => writeTheme((s) => ({ ...s, theme: t, accent: t })),
    /** Escolhe o CONTEXTO (vibe/fontes). */
    setContext: (c: ContextName) => writeTheme((s) => ({ ...s, context: c })),
    /** Escolhe a COR DE DESTAQUE (independente do tema). */
    setAccent: (accent: AccentId) => writeTheme((s) => ({ ...s, accent })),
    /** Cor de destaque livre. */
    setCustomAccent: (hex: string) => writeTheme((s) => ({ ...s, accent: 'custom', customAccent: hex })),
    /** Atalho claro/escuro da topbar: pula pro tema-assinatura oposto. */
    toggleLightDark: () =>
      writeTheme((s) => {
        const t: ThemeName = isDarkTheme(s.theme) ? 'aco-solar' : 'ferro-frio'
        return { ...s, theme: t, accent: t }
      }),
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
