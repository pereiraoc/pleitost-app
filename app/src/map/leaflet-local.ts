// Mapa local do template POA (bloco ```leaflet``` da nota, #519): regras de
// CAMADA POR ZOOM e o registro de ícone por tipo de marker.
//
// A fonte de verdade das camadas é a PRÓPRIA NOTA (report 2026-08-31): no
// formato do obsidian-leaflet, `marker: tipo,lat,long,nome,desc,minZoom,maxZoom`
// — Bairros levam maxZoom (aparecem só no zoom afastado) e pontos de
// interesse levam minZoom (só no aproximado). O app converte a escala do
// viewer (useMapView, 1..8) pro zoom do leaflet ancorado no defaultZoom do
// bloco: zoom = defaultZoom + log2(escala).
import type { VaultDoc } from '../data/types'

export type LeafletMarker = NonNullable<
  NonNullable<VaultDoc['locationBody']>['leaflet']
>['markers'][number]

/** Zoom leaflet equivalente à escala atual do viewer. */
export function leafletZoom(defaultZoom: number | null, scale: number): number {
  return (defaultZoom ?? 0) + Math.log2(scale)
}

/** Gate de camada do marker — a semântica do obsidian-leaflet. */
export function markerVisivel(
  m: Pick<LeafletMarker, 'minZoom' | 'maxZoom'>,
  zoom: number,
): boolean {
  if (m.minZoom != null && zoom < m.minZoom) return false
  if (m.maxZoom != null && zoom > m.maxZoom) return false
  return true
}

/** Registro central tipo-de-marker → ícone (os tipos são o dado da nota;
 *  o config do plugin leaflet da vault não define ícone pra eles — só os
 *  tipos da era fantasia — então o display vive aqui, num lugar só). */
export const MARKER_ICONS: Record<string, string> = {
  Bairro: '🏙️',
  Bar: '🍸',
  Mercado: '🛒',
  Parque: '🌳',
  Industrial: '🏭',
  Porto: '⚓',
  Hotel: '🏨',
  Radioativo: '☢️',
}

export function markerIcon(tipo: string): string {
  return MARKER_ICONS[tipo] ?? '📍'
}
