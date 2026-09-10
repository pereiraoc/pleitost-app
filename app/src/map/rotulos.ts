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

/** Um rótulo a posicionar: a âncora (onde ele quer ficar) e o tamanho da
 *  caixa de texto, tudo em px da FONTE. */
export interface RotuloPedido {
  nome: string
  x: number
  y: number
  largura: number
  altura: number
}

export interface RotuloPosto extends RotuloPedido {
  /** Centro final do texto, em px da fonte. */
  tx: number
  ty: number
  /** Saiu de cima da âncora — precisa de linha-guia até ela. */
  deslocado: boolean
}

const DIRECOES = [
  [0, -1],
  [0, 1],
  [1, 0],
  [-1, 0],
  [1, -1],
  [-1, -1],
  [1, 1],
  [-1, 1],
] as const

function colide(a: RotuloPosto, b: RotuloPosto): boolean {
  return (
    Math.abs(a.tx - b.tx) < (a.largura + b.largura) / 2 &&
    Math.abs(a.ty - b.ty) < (a.altura + b.altura) / 2
  )
}

/**
 * Posiciona rótulos SEM esconder nenhum: cada um tenta a própria âncora e, se
 * a caixa dele bate na de alguém já posto, vai saindo em anéis (cima, baixo,
 * lados, diagonais) até achar espaço — e aí ganha `deslocado`, pra quem
 * desenha ligar o rótulo à âncora com um fio.
 *
 * A ORDEM importa: quem vem primeiro fica com o lugar de honra. O chamador
 * manda os bairros grandes na frente, que são os que têm espaço de sobra
 * dentro da própria mancha.
 */
export function posicionarRotulos(
  pedidos: readonly RotuloPedido[],
  opts: { passo?: number; aneis?: number } = {},
): RotuloPosto[] {
  const passo = opts.passo ?? 0.6
  const aneis = opts.aneis ?? 14
  const postos: RotuloPosto[] = []
  for (const p of pedidos) {
    let escolhido: RotuloPosto = { ...p, tx: p.x, ty: p.y, deslocado: false }
    if (postos.some((o) => colide(escolhido, o))) {
      busca: for (let anel = 1; anel <= aneis; anel++) {
        for (const [dx, dy] of DIRECOES) {
          const cand: RotuloPosto = {
            ...p,
            tx: p.x + dx * anel * passo * p.largura,
            ty: p.y + dy * anel * passo * p.altura * 2,
            deslocado: true,
          }
          if (!postos.some((o) => colide(cand, o))) {
            escolhido = cand
            break busca
          }
          escolhido = cand // pior caso: o último candidato, mas nunca some
        }
      }
    }
    postos.push(escolhido)
  }
  return postos
}
