// @vitest-environment node
// #296: o Bardo (proficiência Arcana Branca/Negra, mas NÃO-Arcanista) estava
// recebendo Magia Essencial no catálogo de não-aprendidas. As Essenciais só
// entram: no escopo PRIMÁRIO se a classe é Arcanista; no SECUNDÁRIO sempre (a
// prof secundária filtra). Sem prof Arcana → nunca.
import { describe, expect, it } from 'vitest'
import { shouldOfferEssenciais } from '../src/rules/projection'

describe('shouldOfferEssenciais (#296)', () => {
  it('Bardo (prof Arcana, não-Arcanista, primário) → NÃO oferece Essencial', () => {
    expect(shouldOfferEssenciais(false, true, false)).toBe(false)
  })

  it('Arcanista (primário) → oferece', () => {
    expect(shouldOfferEssenciais(false, true, true)).toBe(true)
  })

  it('secundário (Treinamento de Arcanista) com prof Arcana → oferece mesmo sem classe Arcanista', () => {
    expect(shouldOfferEssenciais(true, true, false)).toBe(true)
  })

  it('sem proficiência Arcana → nunca oferece (nem primário nem secundário)', () => {
    expect(shouldOfferEssenciais(false, false, true)).toBe(false)
    expect(shouldOfferEssenciais(true, false, false)).toBe(false)
  })
})
