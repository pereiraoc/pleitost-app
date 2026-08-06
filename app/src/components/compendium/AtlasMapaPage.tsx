// MAPA DO MUNDO (fase 1 do atlas completo) — visualizador pan/zoom do mapa
// novo que cobre o mundo inteiro (Mundo Livre + Magna Pátria), pedido do
// mestre: "primeiro o deploy desse mapa e aí eu vou marcar as regiões".
// O AtlasNav já anunciava esperar este mapa-raiz ("o mapa navegável espera o
// mapa-raiz da vault").
//
// Interação = useMapView/MapControls (issue #80), os MESMOS da exploração e do
// editor de regiões (pan 1 dedo, pinça, roda, tela cheia). NÃO toca o mapa de
// hexcrawl do Mundo Livre (region-maps/exploracao.ts): a grade calibrada e as
// trilhas dos grupos seguem no mapa antigo até a migração das fases seguintes.
//
// FASE 2 (planejada): o overlay (atlas-overlay.webp, mesma resolução) cobre as
// regiões DESABILITADAS pelo GM — nada clicável/sem info por baixo. O asset já
// é deployado junto; `MOSTRAR_OVERLAY` liga o render quando o gating por
// região existir.
import { useAssetIndex, assetUrl, resolveAsset } from '../../data/assets'
import { useMapView } from '../../map/useMapView'
import { MapControls, fullscreenContainerStyle } from '../../map/MapControls'

/** Paths EXATOS dos assets no manifest (byPath — sem resolução por basename). */
export const ATLAS_MAPA_ASSET = 'Recursos e Mídia/Imagens/Mapas/atlas.webp'
export const ATLAS_OVERLAY_ASSET = 'Recursos e Mídia/Imagens/Mapas/atlas-overlay.webp'

/** Fase 2: vira o gating por região do GM; por ora o overlay só é deployado. */
const MOSTRAR_OVERLAY = false

function clip(n: number): string {
  return `polygon(0 0,calc(100% - ${n}px) 0,100% ${n}px,100% 100%,${n}px 100%,0 calc(100% - ${n}px))`
}

export function AtlasMapaPage() {
  const assets = useAssetIndex()
  const map = useMapView()
  const mapEntry = assets ? resolveAsset(assets, ATLAS_MAPA_ASSET) : null
  const overlayEntry = assets ? resolveAsset(assets, ATLAS_OVERLAY_ASSET) : null

  return (
    <section className="page" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '.12em',
          color: 'var(--muted)',
        }}
      >
        {'// MAPA DO MUNDO'}
      </div>
      <div
        ref={map.containerRef}
        style={fullscreenContainerStyle(
          {
            position: 'relative',
            background: 'var(--panel)',
            border: '1px solid var(--line2)',
            clipPath: map.fullscreen ? 'none' : clip(14),
            overflow: 'hidden',
          },
          map.fullscreen,
        )}
      >
        {mapEntry ? (
          <div
            ref={map.viewportRef}
            data-mapa-viewport=""
            onPointerDown={map.onPointerDown}
            onPointerMove={map.onPointerMove}
            onPointerUp={map.onPointerUp}
            onPointerCancel={map.onPointerUp}
            style={{
              height: map.fullscreen ? '100%' : 'min(74vh, 720px)',
              display: 'flex',
              justifyContent: 'center',
              overflow: 'hidden',
              touchAction: 'none',
              cursor: map.dragging ? 'grabbing' : 'grab',
              userSelect: 'none',
            }}
          >
            <div
              ref={map.mapRef}
              data-mapa=""
              style={{
                position: 'relative',
                height: '100%',
                flex: 'none',
                transform: map.transform,
                transformOrigin: '0 0',
              }}
            >
              <img
                src={assetUrl(mapEntry)}
                alt="Mapa do mundo"
                draggable={false}
                style={{ height: '100%', width: 'auto', display: 'block' }}
              />
              {MOSTRAR_OVERLAY && overlayEntry ? (
                <img
                  src={assetUrl(overlayEntry)}
                  alt=""
                  aria-hidden
                  draggable={false}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    height: '100%',
                    width: '100%',
                    display: 'block',
                    pointerEvents: 'none',
                  }}
                />
              ) : null}
            </div>
          </div>
        ) : (
          <div
            style={{
              padding: '48px 16px',
              textAlign: 'center',
              fontFamily: 'var(--mono)',
              fontSize: 12,
              color: 'var(--muted)',
            }}
          >
            mapa indisponível no vault-data
          </div>
        )}
        <MapControls map={map} />
      </div>
    </section>
  )
}
