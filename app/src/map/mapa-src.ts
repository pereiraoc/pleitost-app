// Qual imagem o viewer de mapa mostra (#572 "pinch lerdo"): o mapa do Mundo
// Livre tem 4352×5888 px (26 Mpx) — acima do limite de textura de GPU de
// celular (4096 px), e o navegador re-decodifica/re-rasteriza um bitmap desse
// tamanho a cada escala nova da pinça. Imagem GIGANTE usa SÓ a versão MÉDIA
// (lado maior 4000 px, gerada no deploy), sempre — sem trocar de src no gesto
// e sem camada de detalhe por cima: no trace do site publicado (Pixel 7,
// CPU 4×) cada variante com a cheia entrando/saindo custava um buraco de
// 0,3–0,9 s sem quadros exatamente na fronteira do gesto, e a cheia só rende
// mais resolução que a média a partir de ~2,4× no celular (e nem isso no
// desktop). Sem médio (dev, ou imagem que não é gigante → 404 → onError) a
// cheia é a imagem, e fica.
export function srcDoMapa(args: { cheia: string; medio: string | null; medioFalhou: boolean; prod: boolean }): string {
  const { cheia, medio, medioFalhou, prod } = args
  return !prod || !medio || medioFalhou ? cheia : medio
}
