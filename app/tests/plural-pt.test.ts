// Plural pt-BR do rótulo de subtipo (2026-09-09) — é assim que a aba dos
// lugares-filhos se chama "Bairros" sem ninguém escrever "Bairros" no código.
import { describe, expect, it } from 'vitest'
import { pluralPt } from '../src/data/plural-pt'

describe('pluralPt', () => {
  it('os subtipos que o Atlas da POA usa', () => {
    expect(pluralPt('Bairro')).toBe('Bairros')
    expect(pluralPt('Ponto de Interesse')).toBe('Pontos de Interesse')
    expect(pluralPt('Cidade')).toBe('Cidades')
  })

  it('os subtipos do Atlas da fantasia', () => {
    expect(pluralPt('Região')).toBe('Regiões')
    expect(pluralPt('Nação')).toBe('Nações')
    expect(pluralPt('Local')).toBe('Locais')
    expect(pluralPt('Continente')).toBe('Continentes')
  })

  it('terminações que pedem cuidado', () => {
    expect(pluralPt('Hotel')).toBe('Hotéis')
    expect(pluralPt('Bar')).toBe('Bares')
    expect(pluralPt('Armazém')).toBe('Armazéns')
    expect(pluralPt('Raiz')).toBe('Raizes')
    expect(pluralPt('Funil')).toBe('Funis')
    expect(pluralPt('Pais')).toBe('Pais') // já no plural: não duplica
  })

  it('preposição encerra o núcleo', () => {
    expect(pluralPt('Casa de Show')).toBe('Casas de Show')
    expect(pluralPt('Posto e Oficina')).toBe('Postos e Oficina')
  })

  it('vazio e espaços', () => {
    expect(pluralPt('')).toBe('')
    expect(pluralPt('   ')).toBe('')
  })
})
