// RÓTULO CABE OU NÃO CABE (2026-09-09) — com 210 lugares no mapa de Porto
// Alegre, mostrar o nome de todos os pinos vira parede de texto, e esconder
// todos tira a leitura do mapa. A régua é o ESPAÇO: o nome entra quando o pino
// tem folga em volta na tela. Mesma ideia do rótulo de bairro (que compara a
// caixa da área com o tamanho do texto), aqui medida pela distância ao vizinho
// mais próximo — assim os nomes vão aparecendo à medida que se aproxima, e
// quem está isolado tem nome desde longe.
export interface PontoRotulado {
  nome: string
  /** px da FONTE (não da tela). */
  x: number
  y: number
}

/** Distância de cada ponto ao vizinho mais próximo, em px da fonte. Ponto
 *  único (sem vizinho) fica Infinity — sempre tem espaço. */
export function distanciaAoVizinho(pontos: readonly PontoRotulado[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const a of pontos) {
    let menor = Infinity
    for (const b of pontos) {
      if (b === a) continue
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      if (d < menor) menor = d
    }
    out.set(a.nome, menor)
  }
  return out
}

/**
 * O rótulo deste ponto cabe? `espaco` é a distância ao vizinho em px da fonte
 * e `escalaTela` quantos px de tela cada px da fonte ocupa agora; `folga` é o
 * mínimo em px de tela. Escala desconhecida (0, antes de medir o mapa) mostra
 * — melhor um nome de mais que um mapa mudo.
 */
export function rotuloCabe(espaco: number | undefined, escalaTela: number, folga: number): boolean {
  if (!escalaTela) return true
  return (espaco ?? Infinity) * escalaTela >= folga
}
