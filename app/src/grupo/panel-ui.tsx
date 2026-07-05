// Peças compartilhadas das tabelas da ficha de grupo — markup/estilos
// VERBATIM da seção ===== GRUPOS ===== do design puxado
// (design/pulled/Companion App.dc.html, linhas ~1133-1201): linha recortada
// com fator --g (linha "Grupo"), célula de cabeçalho com emoji + sigla e
// célula de nome com 👤.
import type { CSSProperties } from 'react'

export const ROW_CLIP = 'polygon(0 0,calc(100% - 9px) 0,100% 9px,100% 100%,9px 100%,0 calc(100% - 9px))'

/** Cor do rótulo da linha "Grupo" — mesma convenção já validada no BalRow. */
export const GROUP_NAME_COLOR = '#ca8a04'
/** Valor das células da linha "Grupo" (mesmo mix do tier no BalRow). */
export const GROUP_VALUE_COLOR = 'color-mix(in srgb,var(--accent) 55%,var(--text))'

/** Título "// SEÇÃO" (mono, .16em) — verbatim do design. */
export const sectionTitleStyle: CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 11,
  letterSpacing: '.16em',
  color: 'var(--muted)',
}

/** Casca da linha (bg/borda/clip com fator --g do design), sem o grid. */
export function rowShellStyle(isGroup: boolean): CSSProperties {
  const g = isGroup ? 1 : 0
  return {
    boxSizing: 'border-box',
    minHeight: 42,
    padding: '9px 4px',
    alignItems: 'center',
    background: `color-mix(in srgb,var(--accent) ${g * 13}%,color-mix(in srgb,var(--accent) 3%,var(--panel)))`,
    border: `1px solid color-mix(in srgb,var(--accent) ${g * 45}%,var(--line))`,
    borderTop: `${1 + g * 1.5}px solid color-mix(in srgb,var(--accent) ${g * 85}%,var(--line))`,
    clipPath: ROW_CLIP,
  }
}

/** Cabeçalho de coluna (emoji em cima, sigla embaixo) — verbatim do design. */
export function HeadCell({
  ic,
  label,
  fontSize = 8.5,
  letterSpacing = '.02em',
  icColor,
}: {
  ic: string
  label: string
  fontSize?: number
  letterSpacing?: string
  icColor?: string
}) {
  return (
    <div
      style={{
        textAlign: 'center',
        fontFamily: 'var(--mono)',
        fontSize,
        letterSpacing,
        color: 'var(--muted)',
        lineHeight: 1.3,
      }}
    >
      <div style={{ fontSize: 12, ...(icColor ? { color: icColor } : {}) }}>{ic}</div>
      {label}
    </div>
  )
}

/** Célula de nome com 👤 (vazio na linha Grupo) — verbatim do design. */
export function NameCell({
  name,
  em,
  isGroup,
}: {
  name: string
  em?: string | null
  isGroup?: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
      <span style={{ fontSize: 12, flex: 'none' }}>{isGroup ? '' : '👤'}</span>
      <span
        style={{
          fontWeight: isGroup ? 800 : 600,
          fontSize: 13,
          color: isGroup ? GROUP_NAME_COLOR : 'var(--text)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {name}
      </span>
      {em ? <span style={{ flex: 'none', fontSize: 12 }}>{em}</span> : null}
    </div>
  )
}

/** Célula de valor mono (fontSize 14) — verbatim do design. */
export function ValueCell({
  value,
  isGroup,
  color,
}: {
  value: string
  isGroup?: boolean
  color?: string
}) {
  return (
    <div
      style={{
        textAlign: 'center',
        fontFamily: 'var(--mono)',
        fontSize: 14,
        fontWeight: isGroup ? 800 : 600,
        color: color ?? (isGroup ? GROUP_VALUE_COLOR : 'var(--text)'),
      }}
    >
      {value}
    </div>
  )
}
