// @vitest-environment jsdom
// #573 — ANTI-SPOILER por construção: o mapa base NUNCA fica visível sem o
// overlay das regiões desabilitadas. Duas corridas fechadas aqui:
//   1. carga inicial: o <img> base pode chegar antes do <image> do overlay no
//      SVG → o base fica visibility:hidden até o load do overlay;
//   2. troca pro bitmap assado: o SVG só sai depois que o PRÓPRIO <img>
//      disparou load com o src assado (antes, o navegador mostrava o base
//      sem overlay enquanto decodificava o bitmap novo).
import { describe, expect, it } from 'vitest'
import { act } from '@testing-library/react'
import { renderHook } from '@testing-library/react'
import { estadoDasCamadas, useCamadasOverlay } from '../src/map/camadas-overlay'

describe('#573 — estadoDasCamadas (puro)', () => {
  const base = '/m.webp'
  it('sem overlay necessário: base visível, sem SVG', () => {
    expect(estadoDasCamadas({ precisaOverlay: false, srcBase: base, srcAssado: null, assadoNaTela: null, overlayCarregado: false })).toEqual({ imgSrc: base, imgVisivel: true, mostrarOverlaySvg: false })
  })
  it('precisa overlay, sem assado: SVG montado; base ESCONDIDO até o overlay carregar', () => {
    expect(estadoDasCamadas({ precisaOverlay: true, srcBase: base, srcAssado: null, assadoNaTela: null, overlayCarregado: false })).toEqual({ imgSrc: base, imgVisivel: false, mostrarOverlaySvg: true })
    expect(estadoDasCamadas({ precisaOverlay: true, srcBase: base, srcAssado: null, assadoNaTela: null, overlayCarregado: true })).toEqual({ imgSrc: base, imgVisivel: true, mostrarOverlaySvg: true })
  })
  it('assado pronto mas ainda não na tela: src já vai pro <img>, SVG continua montado e a visibilidade segue o overlay', () => {
    expect(estadoDasCamadas({ precisaOverlay: true, srcBase: base, srcAssado: 'blob:1', assadoNaTela: null, overlayCarregado: true })).toEqual({ imgSrc: 'blob:1', imgVisivel: true, mostrarOverlaySvg: true })
    expect(estadoDasCamadas({ precisaOverlay: true, srcBase: base, srcAssado: 'blob:1', assadoNaTela: null, overlayCarregado: false })).toEqual({ imgSrc: 'blob:1', imgVisivel: false, mostrarOverlaySvg: true })
  })
  it('assado NA TELA: só ele, visível, sem SVG; assado antigo na tela com src novo → volta a gatear', () => {
    expect(estadoDasCamadas({ precisaOverlay: true, srcBase: base, srcAssado: 'blob:1', assadoNaTela: 'blob:1', overlayCarregado: false })).toEqual({ imgSrc: 'blob:1', imgVisivel: true, mostrarOverlaySvg: false })
    expect(estadoDasCamadas({ precisaOverlay: true, srcBase: base, srcAssado: 'blob:2', assadoNaTela: 'blob:1', overlayCarregado: false })).toEqual({ imgSrc: 'blob:2', imgVisivel: false, mostrarOverlaySvg: true })
  })
  it('sem base ainda: nada visível', () => {
    expect(estadoDasCamadas({ precisaOverlay: true, srcBase: null, srcAssado: null, assadoNaTela: null, overlayCarregado: true }).imgSrc).toBeNull()
  })
})

describe('#573 — useCamadasOverlay (transições)', () => {
  it('overlay carrega → base aparece; assado chega → SVG fica até o load do <img> com o src assado; remontar o SVG zera o carregado', () => {
    const { result, rerender } = renderHook((p: { srcAssado: string | null; precisaOverlay: boolean }) => useCamadasOverlay({ precisaOverlay: p.precisaOverlay, srcBase: '/m.webp', srcOverlay: '/o.webp', srcAssado: p.srcAssado }), { initialProps: { srcAssado: null, precisaOverlay: true } })
    expect(result.current.estado).toEqual({ imgSrc: '/m.webp', imgVisivel: false, mostrarOverlaySvg: true })
    act(() => result.current.onOverlayLoad())
    expect(result.current.estado.imgVisivel).toBe(true)
    // assado pronto: src vai pro img, SVG continua
    rerender({ srcAssado: 'blob:1', precisaOverlay: true })
    expect(result.current.estado).toEqual({ imgSrc: 'blob:1', imgVisivel: true, mostrarOverlaySvg: true })
    // load do <img> com OUTRO src (o base, atrasado) não conta
    act(() => result.current.onImgLoad('/m.webp'))
    expect(result.current.estado.mostrarOverlaySvg).toBe(true)
    act(() => result.current.onImgLoad('blob:1'))
    expect(result.current.estado).toEqual({ imgSrc: 'blob:1', imgVisivel: true, mostrarOverlaySvg: false })
    // regiões mudam → assado some por um instante → SVG remonta e o base volta a esperar o overlay
    rerender({ srcAssado: null, precisaOverlay: true })
    expect(result.current.estado).toEqual({ imgSrc: '/m.webp', imgVisivel: false, mostrarOverlaySvg: true })
    act(() => result.current.onOverlayLoad())
    expect(result.current.estado.imgVisivel).toBe(true)
    // overlay deixa de ser necessário (mestre, ou tudo habilitado): base direto
    rerender({ srcAssado: null, precisaOverlay: false })
    expect(result.current.estado).toEqual({ imgSrc: '/m.webp', imgVisivel: true, mostrarOverlaySvg: false })
  })
})
