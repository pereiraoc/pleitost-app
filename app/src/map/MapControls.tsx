// CONTROLES DO MAPA (issue #80) — botões sobrepostos (canto) pra TELA CHEIA e
// zoom +/−/reset, no skin do design (mono, painel de canto cortado). Alvos
// grandes (36px) pra dedo no celular. Compartilhado pelo editor de regiões e
// pela exploração do grupo.
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
  fontSize: 16,
  lineHeight: 1,
  cursor: 'pointer',
  clipPath: clip(6),
  backdropFilter: 'blur(2px)',
}

/** Estilo do CONTÊINER do mapa quando em tela cheia: overlay fixo cobrindo a
 *  viewport em qualquer orientação (dvh/dvw acompanham a rotação do celular).
 *  Fora da tela cheia devolve `base` intacto. */
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
        top: 10,
        right: 10,
        zIndex: 5,
        display: 'flex',
        gap: 6,
        alignItems: 'center',
      }}
    >
      {extra}
      <button
        type="button"
        data-zoom-out=""
        aria-label="Diminuir zoom"
        onClick={() => map.zoomBy(1 / 1.3)}
        style={btnStyle}
      >
        −
      </button>
      <button
        type="button"
        data-zoom-in=""
        aria-label="Aumentar zoom"
        onClick={() => map.zoomBy(1.3)}
        style={btnStyle}
      >
        ＋
      </button>
      {map.view.scale !== 1 || map.view.tx !== 0 || map.view.ty !== 0 ? (
        <button
          type="button"
          data-zoom-reset=""
          aria-label="Enquadrar mapa"
          onClick={() => map.resetView()}
          style={{ ...btnStyle, fontSize: 11, letterSpacing: '.08em' }}
        >
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
        {map.fullscreen ? '⤡' : '⤢'}
      </button>
    </div>
  )
}
