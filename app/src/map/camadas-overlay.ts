// CAMADAS DO MAPA COM OVERLAY ANTI-SPOILER (#573) — a regra, por construção:
// o mapa base NUNCA fica visível sem o overlay das regiões desabilitadas.
//
// Duas corridas que vazavam spoiler (relato 2026-09-29: "aparece o mapa por
// baixo primeiro antes de carregar o overlay"):
//   1. carga inicial: o <img> base (2 MB) e o <image> do overlay no SVG
//      (0,6 MB) carregam em paralelo e o base pode chegar antes → o base fica
//      `visibility: hidden` até o load do overlay;
//   2. troca pro bitmap ASSADO: o src novo entra no <img> mas o navegador
//      mostra o base até decodificar o bitmap; tirar o SVG nesse commit
//      deixava o base nu por alguns quadros → o SVG só sai depois que o
//      PRÓPRIO <img> disparou `load` com o src assado.
// Quando o overlay deixa de ser necessário (mestre; tudo habilitado) nada é
// gateado. Reavaliação do modelo é pura (estadoDasCamadas); o hook só guarda
// os dois fatos que chegam por evento (overlay carregou; assado está na tela).
import { useCallback, useLayoutEffect, useState } from 'react'

export interface EntradaCamadas {
  precisaOverlay: boolean
  srcBase: string | null
  srcAssado: string | null
  /** src assado que o <img> já carregou (evento load com esse src). */
  assadoNaTela: string | null
  /** o <image> do overlay montado agora já disparou load. */
  overlayCarregado: boolean
}

export interface EstadoCamadas {
  imgSrc: string | null
  imgVisivel: boolean
  mostrarOverlaySvg: boolean
}

export function estadoDasCamadas(e: EntradaCamadas): EstadoCamadas {
  if (!e.precisaOverlay) return { imgSrc: e.srcBase, imgVisivel: true, mostrarOverlaySvg: false }
  if (e.srcAssado && e.assadoNaTela === e.srcAssado) return { imgSrc: e.srcAssado, imgVisivel: true, mostrarOverlaySvg: false }
  // ainda sem assado na tela: o SVG cobre; o <img> (base, ou o assado
  // carregando por cima do base) só aparece com o overlay carregado
  return { imgSrc: e.srcAssado ?? e.srcBase, imgVisivel: e.overlayCarregado, mostrarOverlaySvg: true }
}

export interface UseCamadasOverlay {
  estado: EstadoCamadas
  /** onLoad do <image> do overlay no SVG. */
  onOverlayLoad: () => void
  /** onLoad do <img> do mapa (passa o currentSrc/src que carregou). */
  onImgLoad: (src: string) => void
}

export function useCamadasOverlay(args: {
  precisaOverlay: boolean
  srcBase: string | null
  srcOverlay: string | null
  srcAssado: string | null
}): UseCamadasOverlay {
  const { precisaOverlay, srcBase, srcOverlay, srcAssado } = args
  const [assadoNaTela, setAssadoNaTela] = useState<string | null>(null)
  const [overlayCarregado, setOverlayCarregado] = useState(false)
  const estado = estadoDasCamadas({ precisaOverlay, srcBase, srcAssado, assadoNaTela, overlayCarregado })

  // Cada (re)montagem do <image> do overlay — ou troca do seu src — zera o
  // "carregou": em layout effect, antes de qualquer evento load chegar.
  const montado = estado.mostrarOverlaySvg
  useLayoutEffect(() => {
    setOverlayCarregado(false)
  }, [montado, srcOverlay])

  const onOverlayLoad = useCallback(() => setOverlayCarregado(true), [])
  const onImgLoad = useCallback((src: string) => {
    if (src && src.startsWith('blob:')) setAssadoNaTela(src)
  }, [])
  return { estado, onOverlayLoad, onImgLoad }
}
