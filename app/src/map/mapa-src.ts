// Quais imagens o viewer de mapa mostra (#572 "pinch lerdo"): o mapa do Mundo
// Livre tem 4352×5888 px (26 Mpx) — acima do limite de textura de GPU de
// celular (4096 px), e o navegador re-decodifica um bitmap desse tamanho a
// cada escala nova da pinça. A camada BASE é sempre a versão MÉDIA (lado
// maior 4000 px, gerada no deploy só pras gigantes): fica montada o tempo
// todo, então nunca é re-decodificada no começo de um gesto. A CHEIA entra
// só como camada de DETALHE por cima, parada em zoom alto — trocar o src
// de uma <img> só (medir no trace: buraco de ~0,9 s no fim de cada zoom-in
// e outro no começo do gesto seguinte) era pior que não ter detalhe.
// Sem médio (dev, ou imagem que não é gigante → 404) a cheia é a base.
export const ZOOM_CHEIA = 2

export interface CamadasDoMapa {
  /** Imagem sempre montada. */
  base: string
  /** Imagem de detalhe por cima da base, ou null (gesto, zoom baixo, sem médio). */
  detalhe: string | null
}

export function camadasDoMapa(args: {
  cheia: string
  medio: string | null
  gesto: boolean
  scale: number
  medioFalhou: boolean
  prod: boolean
}): CamadasDoMapa {
  const { cheia, medio, gesto, scale, medioFalhou, prod } = args
  if (!prod || !medio || medioFalhou) return { base: cheia, detalhe: null }
  return { base: medio, detalhe: !gesto && scale >= ZOOM_CHEIA ? cheia : null }
}
