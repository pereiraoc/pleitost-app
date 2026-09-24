// Qual imagem o viewer de mapa mostra (#572 "pinch lerdo"): o mapa do Mundo
// Livre tem 4352×5888 px (26 Mpx) — uma camada maior que o limite de textura
// de GPU de celular (4096 px) o navegador fatia/rasteriza por software a cada
// frame da pinça, independente do React. Durante o GESTO e em zoom baixo vai a
// versão MÉDIA (lado maior 4000 px, gerada no deploy só pras gigantes); a cheia
// só quando o gesto termina em zoom alto (aí a resolução extra aparece). Sem
// médio (dev, ou imagem que não é gigante → 404) o onError cai no cheio e fica.
export const ZOOM_CHEIA = 2

export function escolherSrcMapa(args: {
  cheia: string
  medio: string | null
  gesto: boolean
  scale: number
  medioFalhou: boolean
  prod: boolean
}): string {
  const { cheia, medio, gesto, scale, medioFalhou, prod } = args
  if (!prod || !medio || medioFalhou) return cheia
  return gesto || scale < ZOOM_CHEIA ? medio : cheia
}
