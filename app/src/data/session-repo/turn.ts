// #291: avanço de turno como CONTADOR MONOTÔNICO. O `mover` antigo tratava o
// wrap de forma assimétrica (PRÓXIMO e ANTERIOR não eram inversos exatos na
// virada de rodada) e não lidava com `order` vazia. Aqui a posição vira um
// índice absoluto (round 1-based × tamanho + índice), aplica o delta e deriva de
// volta — então PRÓXIMO∘ANTERIOR = identidade, e no início trava (não vai antes
// da rodada 1). Puro/testável.
export interface TurnLike {
  order: string[]
  currentIndex: number
  round: number
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

export function advanceTurn(ts: TurnLike, delta: number): { currentIndex: number; round: number } {
  const len = ts.order.length
  const round = Math.max(1, ts.round)
  if (len === 0) return { currentIndex: 0, round } // encontro sem combatentes
  const abs = (round - 1) * len + clamp(ts.currentIndex, 0, len - 1) + delta
  const absClamped = Math.max(0, abs) // não retrocede antes do começo (rodada 1, idx 0)
  return { currentIndex: absClamped % len, round: Math.floor(absClamped / len) + 1 }
}
