// Tema do app — base (aesthetic × mode) + COR DE DESTAQUE customizável.
//
// Base: aesthetic ('medieval'/'cyberpunk') × mode ('dark'/'light') seleciona a
// paleta em styles/theme.css via data-aesthetic/data-mode no <html> (essas 4
// paletas são DERIVADAS do design — não mexer aqui). Sobre elas, o usuário
// escolhe uma COR DE DESTAQUE: um preset nomeado (Esmeralda/Rubi/…) ou uma cor
// própria. O destaque é aplicado como override INLINE de custom properties no
// :root (`--accent`/`--accent2`/`--sb`), que vence a folha de estilo — então
// recolore realces/botões/ativos sem tocar na theme.css do design.
//
// Estado de MÓDULO via useSyncExternalStore (mesmo padrão de settings/hero-store):
// topbar (AppShell) e CONFIG leem/escrevem a MESMA fonte, refletindo sem reload.
//
// Persistência: chave `pleitost.theme` — casa com o SYNCED de remote-persist
// (/^(pleitost\.|local:)/), então o tema ESPELHA por conta (Supabase user_state)
// e acompanha o usuário entre dispositivos, de graça (#239). Migra da chave
// antiga `pleitost-theme` (hífen, não sincronizava).
import { useSyncExternalStore } from 'react'

export type Mode = 'dark' | 'light'
export type Aesthetic = 'cyberpunk' | 'medieval'
/** Cor de destaque: 'padrao' = a do tema base (sem override); 'custom' = cor
 *  livre do usuário; os demais são presets nomeados (ACCENT_PRESETS). */
export type AccentId = 'padrao' | 'esmeralda' | 'rubi' | 'safira' | 'ametista' | 'custom'

/** Presets de destaque — recolorem `--accent`/`--accent2` (e `--sb`, derivada).
 *  Cores de luminância média, legíveis tanto no claro quanto no escuro. */
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
  mode: Mode
  aesthetic: Aesthetic
  accent: AccentId
  /** Cor hex livre — usada só quando accent === 'custom'. */
  customAccent: string | null
}

const DEFAULT: ThemeState = { mode: 'light', aesthetic: 'medieval', accent: 'padrao', customAccent: null }

function isAccentId(v: unknown): v is AccentId {
  return v === 'padrao' || v === 'custom' || (typeof v === 'string' && v in ACCENT_PRESETS)
}

/** Sanitiza qualquer JSON persistido (inclusive o shape antigo só com mode/
 *  aesthetic) num ThemeState completo — nunca confia no que veio do storage. */
function normalize(p: unknown): ThemeState {
  const o = (typeof p === 'object' && p !== null ? p : {}) as Record<string, unknown>
  const hex = typeof o.customAccent === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(o.customAccent) ? o.customAccent : null
  return {
    mode: o.mode === 'dark' || o.mode === 'light' ? o.mode : DEFAULT.mode,
    aesthetic: o.aesthetic === 'cyberpunk' || o.aesthetic === 'medieval' ? o.aesthetic : DEFAULT.aesthetic,
    accent: isAccentId(o.accent) ? o.accent : 'padrao',
    customAccent: hex,
  }
}

function loadTheme(): ThemeState {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
    if (raw == null) {
      // migração: chave antiga (hífen) não casava com o SYNCED → não sincronizava.
      const old = localStorage.getItem(OLD_STORAGE_KEY)
      if (old != null) {
        raw = old
        try {
          localStorage.setItem(STORAGE_KEY, old)
          localStorage.removeItem(OLD_STORAGE_KEY)
        } catch {
          /* storage read-only: segue com o valor migrado em memória */
        }
      }
    }
  } catch {
    /* primeira visita / storage indisponível */
  }
  if (raw != null) {
    try {
      return normalize(JSON.parse(raw))
    } catch {
      /* corrompido → defaults */
    }
  }
  return { ...DEFAULT }
}

let state: ThemeState | null = null
const listeners = new Set<() => void>()

/** Resolve o override de destaque efetivo (ou null = usar o do tema base). */
function accentOverride(theme: ThemeState): { accent: string; accent2: string | null } | null {
  if (theme.accent === 'custom') {
    return theme.customAccent ? { accent: theme.customAccent, accent2: null } : null
  }
  if (theme.accent === 'padrao') return null
  const p = ACCENT_PRESETS[theme.accent]
  return p ? { accent: p.accent, accent2: p.accent2 } : null
}

function applyDom(theme: ThemeState) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.dataset.mode = theme.mode
  root.dataset.aesthetic = theme.aesthetic
  const ov = accentOverride(theme)
  const s = root.style
  if (!ov) {
    // 'padrão' → remove os overrides, deixa a paleta base (theme.css) aparecer.
    s.removeProperty('--accent')
    s.removeProperty('--accent2')
    s.removeProperty('--sb')
    return
  }
  s.setProperty('--accent', ov.accent)
  if (ov.accent2) s.setProperty('--accent2', ov.accent2)
  else s.removeProperty('--accent2') // custom só define accent; accent2 fica do base
  // --sb (scrollbar/realce translúcido) acompanha o destaque.
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
    toggleMode: () => writeTheme((t) => ({ ...t, mode: t.mode === 'dark' ? 'light' : 'dark' })),
    setMode: (mode: Mode) => writeTheme((t) => ({ ...t, mode })),
    setAesthetic: (aesthetic: Aesthetic) => writeTheme((t) => ({ ...t, aesthetic })),
    /** Escolhe um preset nomeado (ou 'padrao'). Não mexe em customAccent. */
    setAccent: (accent: AccentId) => writeTheme((t) => ({ ...t, accent })),
    /** Define a cor livre e já muda para o modo 'custom'. */
    setCustomAccent: (hex: string) => writeTheme((t) => ({ ...t, accent: 'custom', customAccent: hex })),
  }
}

/** Snapshot não-reativo (para módulos fora de React). */
export function getThemeSnapshot(): ThemeState {
  return getTheme()
}

/** SÓ testes: zera o cache em memória e limpa os overrides do DOM. */
export function __resetThemeForTests(): void {
  state = null
  if (typeof document !== 'undefined') {
    const s = document.documentElement.style
    s.removeProperty('--accent')
    s.removeProperty('--accent2')
    s.removeProperty('--sb')
  }
}
