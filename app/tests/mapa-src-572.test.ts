// #572 — imagem gigante mostra SÓ a versão média, sempre (nada de trocar src
// na fronteira do gesto — era um buraco de 0,3–0,9 s sem quadros); sem médio
// (dev, imagem não-gigante → onError) a cheia é a imagem.
import { describe, expect, it } from 'vitest'
import { srcDoMapa } from '../src/map/mapa-src'
import { medioCopiedTo } from '../src/data/assets'

describe('#572 — src do mapa', () => {
  const base = { cheia: 'a/cheia.webp', medio: 'a/medio.webp', medioFalhou: false, prod: true }
  it('em produção, com médio disponível, é a média', () => {
    expect(srcDoMapa(base)).toBe('a/medio.webp')
  })
  it('sem médio (dev, 404 do médio, imagem sem versão) → cheia', () => {
    expect(srcDoMapa({ ...base, prod: false })).toBe('a/cheia.webp')
    expect(srcDoMapa({ ...base, medioFalhou: true })).toBe('a/cheia.webp')
    expect(srcDoMapa({ ...base, medio: null })).toBe('a/cheia.webp')
  })
  it('medioCopiedTo espelha o gen-thumbs (assets/ → assets-medio/….webp; svg/gif ficam)', () => {
    expect(medioCopiedTo('assets/Recursos e Mídia/Imagens/Mapas/Mapa do Mundo Livre.webp')).toBe(
      'assets-medio/Recursos e Mídia/Imagens/Mapas/Mapa do Mundo Livre.webp.webp',
    )
    expect(medioCopiedTo('assets/x/y.svg')).toBe('assets/x/y.svg')
  })
})
