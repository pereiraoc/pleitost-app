// #572 — o viewer de mapa mantém a imagem MÉDIA sempre montada (nunca
// re-decodifica no começo de um gesto) e só põe a CHEIA por cima, parada em
// zoom alto; sem médio (dev, imagem não-gigante → onError) a cheia é a base.
import { describe, expect, it } from 'vitest'
import { camadasDoMapa, ZOOM_CHEIA } from '../src/map/mapa-src'
import { medioCopiedTo } from '../src/data/assets'

describe('#572 — camadas do mapa por gesto/zoom', () => {
  const base = { cheia: 'a/cheia.webp', medio: 'a/medio.webp', medioFalhou: false, prod: true }
  it('base é sempre a média; detalhe só parado em zoom alto', () => {
    expect(camadasDoMapa({ ...base, gesto: true, scale: 6 })).toEqual({ base: 'a/medio.webp', detalhe: null })
    expect(camadasDoMapa({ ...base, gesto: false, scale: 1 })).toEqual({ base: 'a/medio.webp', detalhe: null })
    expect(camadasDoMapa({ ...base, gesto: false, scale: ZOOM_CHEIA })).toEqual({ base: 'a/medio.webp', detalhe: 'a/cheia.webp' })
    expect(camadasDoMapa({ ...base, gesto: false, scale: 8 })).toEqual({ base: 'a/medio.webp', detalhe: 'a/cheia.webp' })
  })
  it('sem médio (dev, 404 do médio, imagem sem versão) → cheia como base, sem detalhe', () => {
    expect(camadasDoMapa({ ...base, gesto: true, scale: 1, prod: false })).toEqual({ base: 'a/cheia.webp', detalhe: null })
    expect(camadasDoMapa({ ...base, gesto: false, scale: 8, medioFalhou: true })).toEqual({ base: 'a/cheia.webp', detalhe: null })
    expect(camadasDoMapa({ ...base, gesto: false, scale: 8, medio: null })).toEqual({ base: 'a/cheia.webp', detalhe: null })
  })
  it('medioCopiedTo espelha o gen-thumbs (assets/ → assets-medio/….webp; svg/gif ficam)', () => {
    expect(medioCopiedTo('assets/Recursos e Mídia/Imagens/Mapas/Mapa do Mundo Livre.webp')).toBe(
      'assets-medio/Recursos e Mídia/Imagens/Mapas/Mapa do Mundo Livre.webp.webp',
    )
    expect(medioCopiedTo('assets/x/y.svg')).toBe('assets/x/y.svg')
  })
})
