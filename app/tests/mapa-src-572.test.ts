// #572 — o viewer de mapa escolhe a imagem MÉDIA (3200 px) durante o gesto e em
// zoom baixo, e a cheia (7440 px) só parada em zoom alto; sem médio (dev,
// imagem não-gigante → onError) fica na cheia.
import { describe, expect, it } from 'vitest'
import { escolherSrcMapa, ZOOM_CHEIA } from '../src/map/mapa-src'
import { medioCopiedTo } from '../src/data/assets'

describe('#572 — src do mapa por gesto/zoom', () => {
  const base = { cheia: 'a/cheia.webp', medio: 'a/medio.webp', medioFalhou: false, prod: true }
  it('gesto → médio; parado em zoom baixo → médio; parado em zoom alto → cheia', () => {
    expect(escolherSrcMapa({ ...base, gesto: true, scale: 6 })).toBe('a/medio.webp')
    expect(escolherSrcMapa({ ...base, gesto: false, scale: 1 })).toBe('a/medio.webp')
    expect(escolherSrcMapa({ ...base, gesto: false, scale: ZOOM_CHEIA })).toBe('a/cheia.webp')
    expect(escolherSrcMapa({ ...base, gesto: false, scale: 8 })).toBe('a/cheia.webp')
  })
  it('sem médio (dev, 404 do médio, imagem sem versão) → cheia sempre', () => {
    expect(escolherSrcMapa({ ...base, gesto: true, scale: 1, prod: false })).toBe('a/cheia.webp')
    expect(escolherSrcMapa({ ...base, gesto: true, scale: 1, medioFalhou: true })).toBe('a/cheia.webp')
    expect(escolherSrcMapa({ ...base, gesto: true, scale: 1, medio: null })).toBe('a/cheia.webp')
  })
  it('medioCopiedTo espelha o gen-thumbs (assets/ → assets-medio/….webp; svg/gif ficam)', () => {
    expect(medioCopiedTo('assets/Recursos e Mídia/Imagens/Mapas/Mapa do Mundo Livre.webp')).toBe(
      'assets-medio/Recursos e Mídia/Imagens/Mapas/Mapa do Mundo Livre.webp.webp',
    )
    expect(medioCopiedTo('assets/x/y.svg')).toBe('assets/x/y.svg')
  })
})
