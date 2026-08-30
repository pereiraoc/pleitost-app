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

/** Registro central tipo-de-marker → glifo SVG monocromático (paths de traço
 *  em viewBox 24×24, cor via currentColor — o visual sutil dos markers
 *  FontAwesome cinza-claro que o plugin leaflet usa no Obsidian; report
 *  2026-08-31 rejeitou emojis coloridos). Os TIPOS são o dado da nota. */
export const MARKER_GLYPHS: Record<string, string[]> = {
  // skyline de três prédios
  Bairro: ['M3 21V10h5v11', 'M8 21V5h7v16', 'M15 21v-8h6v8', 'M2 21h20'],
  // taça martini
  Bar: ['M5 5h14l-7 8z', 'M12 13v6', 'M8 19h8'],
  // cesta de feira com alça
  Mercado: ['M4 9h16l-2 11H6z', 'M8.5 9L12 3.5 15.5 9'],
  // pinheiro de dois andares
  Parque: ['M12 2l5.5 8h-3.5l4.5 7H5.5L10 10H6.5z', 'M12 17v5'],
  // galpão com chaminé
  Industrial: ['M3 21V12l6-3v3l6-3v3l6-3v12z', 'M6 9V4h3v4', 'M3 21h18'],
  // âncora
  Porto: ['M12 7a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4', 'M12 7v15', 'M8.5 10h7', 'M5 14a7 7 0 0 0 14 0'],
  // cama
  Hotel: ['M2 19v-9', 'M2 15h20v4', 'M2 12h11a4 4 0 0 1 4 3', 'M6.5 10a1.8 1.8 0 1 0 0 .01'],
  // trifólio: círculo + núcleo + três raios
  Radioativo: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18', 'M12 13.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3', 'M12 10.5V5', 'M13.3 14.2l4.4 3.3', 'M10.7 14.2l-4.4 3.3'],
}

/** Pin genérico (gota de mapa) pra tipo fora do registro. */
const PIN_GENERICO = ['M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z', 'M12 11.5a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4']

export function markerGlyph(tipo: string): string[] {
  return MARKER_GLYPHS[tipo] ?? PIN_GENERICO
}
