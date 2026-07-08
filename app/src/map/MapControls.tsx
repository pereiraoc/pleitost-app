// CONTROLES DO MAPA (issue #80) — botões sobrepostos (canto) pra TELA CHEIA e
// zoom +/−/reset, no skin do design (mono, painel de canto cortado). Alvos
// grandes (36px) pra dedo no celular. Ícones em SVG (não dependem de glifo de
// fonte — evita tofu). Compartilhado pelo editor de regiões e pela exploração.
import type { CSSProperties } from 'react'
import type { UseMapView } from './useMapView'

function clip(n: number): NonNullable<CSSProperties['clipPath']> {
  return `polygon(0 0,calc(100% - ${n}px) 0,100% ${n}px,100% 100%,${n}px 100%,0 calc(100% - ${n}px))`
}

const btnStyle: CSSProperties = {
  width: 36,
  height: 36,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'color-mix(in srgb,var(--panel) 88%,transparent)',
  border: '1px solid var(--line2)',
  color: 'var(--text)',
  fontFamily: 'var(--mono)',
  fontSize: 11,
  letterSpacing: '.06em',
  lineHeight: 1,
  cursor: 'pointer',
  clipPath: clip(6),
  backdropFilter: 'blur(2px)',
}

const ICON = { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none' as const, stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

function IconMinus() {
  return (
    <svg {...ICON} aria-hidden>
      <line x1="3" y1="8" x2="13" y2="8" />
    </svg>
  )
}
function IconPlus() {
  return (
    <svg {...ICON} aria-hidden>
      <line x1="8" y1="3" x2="8" y2="13" />
      <line x1="3" y1="8" x2="13" y2="8" />
    </svg>
  )
}
/** Setas divergindo pros 4 cantos (entrar em tela cheia). */
function IconExpand() {
  return (
    <svg {...ICON} aria-hidden>
      <path d="M6 2H2v4M14 6V2h-4M10 14h4v-4M2 10v4h4" />
    </svg>
  )
}
/** Setas convergindo (sair da tela cheia). */
function IconCompress() {
  return (
    <svg {...ICON} aria-hidden>
      <path d="M2 6h4V2M10 2v4h4M14 10h-4v4M6 14v-4H2" />
    </svg>
  )
}

/** Estilo do CONTÊINER quando em tela cheia: overlay fixo cobrindo a viewport
 *  em qualquer orientação (dvh/dvw acompanham a rotação do celular). Fora da
 *  tela cheia devolve `base` intacto. */
export function fullscreenContainerStyle(base: CSSProperties, fullscreen: boolean): CSSProperties {
  if (!fullscreen) return base
  return {
    ...base,
    position: 'fixed',
    inset: 0,
    zIndex: 1000,
    width: '100dvw',
    height: '100dvh',
    maxWidth: 'none',
    borderRadius: 0,
    clipPath: 'none',
    padding: 8,
    background: 'var(--bg, #12121a)',
  }
}

/** Botões flutuantes de tela cheia + zoom. `extra` entra à esquerda dos zooms
 *  (ex.: o toggle de LAÇO do editor de regiões). */
export function MapControls({
  map,
  extra,
}: {
  map: Pick<UseMapView, 'fullscreen' | 'toggleFullscreen' | 'zoomBy' | 'resetView' | 'view'>
  extra?: React.ReactNode
}) {
  return (
    <div
      data-map-controls=""
      style={{
        position: 'absolute',
        top: 14,
        right: 14,
        zIndex: 5,
        display: 'flex',
        gap: 6,
        alignItems: 'center',
      }}
    >
      {extra}
      <button type="button" data-zoom-out="" aria-label="Diminuir zoom" onClick={() => map.zoomBy(1 / 1.3)} style={btnStyle}>
        <IconMinus />
      </button>
      <button type="button" data-zoom-in="" aria-label="Aumentar zoom" onClick={() => map.zoomBy(1.3)} style={btnStyle}>
        <IconPlus />
      </button>
      {map.view.scale !== 1 || map.view.tx !== 0 || map.view.ty !== 0 ? (
        <button type="button" data-zoom-reset="" aria-label="Enquadrar mapa" onClick={() => map.resetView()} style={btnStyle}>
          1:1
        </button>
      ) : null}
      <button
        type="button"
        data-fullscreen-toggle=""
        aria-pressed={map.fullscreen}
        aria-label={map.fullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
        onClick={() => map.toggleFullscreen()}
        style={btnStyle}
      >
        {map.fullscreen ? <IconCompress /> : <IconExpand />}
      </button>
    </div>
  )
}
