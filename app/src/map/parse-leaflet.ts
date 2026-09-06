// PORT 1:1 de extractor/parse-location-body.mjs:parseLeafletBlock — o bloco
// ```leaflet``` do obsidian-leaflet (image/bounds/defaultZoom/markers com gates
// de camada). O extractor só o roda pra Localização; a Aventura carrega o seu
// no corpo (seção Mapa) e o app parseia aqui com a MESMA gramática. Paridade
// garantida por teste contra a função do extractor.
import type { LocationBody } from '../data/types'

export type LeafletBlock = NonNullable<LocationBody['leaflet']>

export function parseLeafletBlock(body: string): LeafletBlock | null {
  const m = /```leaflet\r?\n([\s\S]*?)```/.exec(body)
  if (!m) return null
  const num = (s: string | undefined): number | null => {
    const t = (s ?? '').trim()
    const n = Number(t)
    return t !== '' && Number.isFinite(n) ? n : null
  }
  const out: LeafletBlock = { image: '', bounds: null, defaultZoom: null, markers: [] }
  for (const raw of m[1]!.split(/\r?\n/)) {
    const linha = raw.trim()
    const img = /^image:\s*\[\[(.+?)\]\]/.exec(linha)
    if (img) out.image = img[1]!.trim()
    const b =
      /^bounds:\s*\[\[\s*([\d.]+)\s*,\s*([\d.]+)\s*\]\s*,\s*\[\s*([\d.]+)\s*,\s*([\d.]+)\s*\]\]/.exec(linha)
    if (b) out.bounds = [[Number(b[1]), Number(b[2])], [Number(b[3]), Number(b[4])]]
    const dz = /^defaultZoom:\s*(-?[\d.]+)/.exec(linha)
    if (dz) out.defaultZoom = Number(dz[1])
    const mk = /^marker:\s*(.+)$/.exec(linha)
    if (mk) {
      const partes = mk[1]!.split(',')
      const lat = Number(partes[1])
      const long = Number(partes[2])
      const nome = (partes[3] ?? '').trim()
      if (Number.isFinite(lat) && Number.isFinite(long) && nome !== '') {
        out.markers.push({
          tipo: (partes[0] ?? '').trim(),
          lat,
          long,
          nome,
          minZoom: num(partes[5]),
          maxZoom: num(partes[6]),
        })
      }
    }
  }
  return out.image ? out : null
}
