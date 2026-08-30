// Camadas por zoom do mapa local (report 2026-08-31): a nota Porto Alegre já
// define os gates no formato do obsidian-leaflet — Bairros com maxZoom -0.1
// aparecem só no zoom afastado, pontos de interesse com minZoom -0.1 só no
// aproximado. O viewer converte escala→zoom ancorado no defaultZoom (-1).
import { describe, it, expect } from 'vitest'
import { leafletZoom, markerVisivel, markerGlyph } from '../src/map/leaflet-local'

const BAIRRO = { minZoom: null, maxZoom: -0.1 }
const POI = { minZoom: -0.1, maxZoom: null }
const POI_FUNDO = { minZoom: 0, maxZoom: null } // Padre Chagas

describe('camadas por zoom do mapa local', () => {
  it('escala inicial (1×, zoom -1): só Bairros', () => {
    const z = leafletZoom(-1, 1)
    expect(z).toBe(-1)
    expect(markerVisivel(BAIRRO, z)).toBe(true)
    expect(markerVisivel(POI, z)).toBe(false)
    expect(markerVisivel(POI_FUNDO, z)).toBe(false)
  })

  it('zoom aproximado (2×, zoom 0): POIs entram, Bairros saem', () => {
    const z = leafletZoom(-1, 2)
    expect(z).toBe(0)
    expect(markerVisivel(BAIRRO, z)).toBe(false)
    expect(markerVisivel(POI, z)).toBe(true)
    expect(markerVisivel(POI_FUNDO, z)).toBe(true)
  })

  it('sem gates (dataset antigo): sempre visível', () => {
    expect(markerVisivel({ minZoom: null, maxZoom: null }, -1)).toBe(true)
    expect(markerVisivel({ minZoom: null, maxZoom: null }, 3)).toBe(true)
  })

  it('glifo mono por tipo do registro; desconhecido cai no pin genérico', () => {
    for (const tipo of ['Bairro', 'Bar', 'Mercado', 'Parque', 'Industrial', 'Porto', 'Hotel', 'Radioativo']) {
      expect(markerGlyph(tipo).length, tipo).toBeGreaterThan(0)
    }
    // fallback: tipo fora do registro usa o pin de gota
    expect(markerGlyph('TipoNovo')[0]).toContain('M12 21s-6.5-6')
  })
})
