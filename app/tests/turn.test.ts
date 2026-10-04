// #291: avanço de turno como contador monotônico — PRÓXIMO e ANTERIOR são
// inversos exatos (inclusive na virada de rodada), e a `order` vazia / o começo
// são tratados sem desincronizar o round.
import { describe, expect, it } from 'vitest'
import { advanceTurn, reorderTurnState, type TurnLike } from '../src/data/session-repo/turn'

const ts = (currentIndex: number, round: number, n = 3): TurnLike => ({
  order: Array.from({ length: n }, (_, i) => `c${i}`),
  currentIndex,
  round,
})

describe('advanceTurn (#291)', () => {
  it('avança dentro da rodada', () => {
    expect(advanceTurn(ts(0, 1), +1)).toEqual({ currentIndex: 1, round: 1 })
  })

  it('vira a rodada no fim (idx último → idx 0, round+1)', () => {
    expect(advanceTurn(ts(2, 1), +1)).toEqual({ currentIndex: 0, round: 2 })
  })

  it('PRÓXIMO e ANTERIOR são inversos EXATOS na virada de rodada', () => {
    const after = advanceTurn(ts(2, 1), +1) // → {0, 2}
    const back = advanceTurn({ ...ts(2, 1), ...after }, -1) // volta
    expect(back).toEqual({ currentIndex: 2, round: 1 })
  })

  it('no começo (idx 0, rodada 1) ANTERIOR trava (não vai pra antes)', () => {
    expect(advanceTurn(ts(0, 1), -1)).toEqual({ currentIndex: 0, round: 1 })
  })

  it('order vazia não quebra o round', () => {
    expect(advanceTurn({ order: [], currentIndex: 0, round: 3 }, +1)).toEqual({ currentIndex: 0, round: 3 })
  })

  it('ida e volta completas mantêm a posição', () => {
    const start = ts(1, 2)
    let cur = { currentIndex: start.currentIndex, round: start.round }
    for (let i = 0; i < 5; i++) cur = advanceTurn({ ...start, ...cur }, +1)
    for (let i = 0; i < 5; i++) cur = advanceTurn({ ...start, ...cur }, -1)
    expect(cur).toEqual({ currentIndex: 1, round: 2 })
  })
})

describe('reorderTurnState (#324 — drag-and-drop da iniciativa)', () => {
  it('move o combatente pra nova posição', () => {
    // [c0,c1,c2] mover c0 → índice 2 = [c1,c2,c0]
    expect(reorderTurnState(ts(0, 1), 'c0', 2).order).toEqual(['c1', 'c2', 'c0'])
  })
  it('PRESERVA o combatente do turno atual (currentIndex acompanha)', () => {
    // turno atual = c1 (idx 1); mover c0 pro fim → c1 continua sendo o atual
    const r = reorderTurnState(ts(1, 2), 'c0', 2)
    expect(r.order).toEqual(['c1', 'c2', 'c0'])
    expect(r.order[r.currentIndex]).toBe('c1')
    expect(r.round).toBe(2)
  })
  it('mover pra cima também funciona e mantém o atual', () => {
    const r = reorderTurnState(ts(0, 1), 'c2', 0) // [c2,c0,c1], atual era c0
    expect(r.order).toEqual(['c2', 'c0', 'c1'])
    expect(r.order[r.currentIndex]).toBe('c0')
  })
  it('no-op quando o id não está na ordem', () => {
    const t = ts(0, 1)
    expect(reorderTurnState(t, 'xx', 1)).toBe(t)
  })
})

// Batch 2 (morto pula a vez): advanceTurn com `isSkipped` — anda ±1 até cair
// num combatente NÃO pulado (no máximo `len` passos por unidade de delta);
// todos pulados → fica onde está; trava continua na rodada 1.
describe('advanceTurn com mortos pulados', () => {
  const t = (currentIndex: number, round: number, n = 4): TurnLike => ({
    order: Array.from({ length: n }, (_, i) => `c${i}`),
    currentIndex,
    round,
  })
  const pula = (...ids: string[]) => (id: string) => ids.includes(id)

  it('pula UM morto', () => {
    expect(advanceTurn(t(0, 1), +1, pula('c1'))).toEqual({ currentIndex: 2, round: 1 })
  })

  it('pula mortos CONSECUTIVOS', () => {
    expect(advanceTurn(t(0, 1), +1, pula('c1', 'c2'))).toEqual({ currentIndex: 3, round: 1 })
  })

  it('vira a rodada pulando os mortos do fim e do começo', () => {
    expect(advanceTurn(t(2, 1), +1, pula('c3', 'c0'))).toEqual({ currentIndex: 1, round: 2 })
  })

  it('todos mortos → não anda', () => {
    expect(advanceTurn(t(1, 3), +1, pula('c0', 'c1', 'c2', 'c3'))).toEqual({ currentIndex: 1, round: 3 })
    expect(advanceTurn(t(1, 3), -1, pula('c0', 'c1', 'c2', 'c3'))).toEqual({ currentIndex: 1, round: 3 })
  })

  it('PRÓXIMO e ANTERIOR inversos com o mesmo conjunto de mortos (inclusive na virada)', () => {
    const skip = pula('c1', 'c3')
    for (const [i, r] of [
      [0, 1],
      [2, 1],
      [0, 2],
      [2, 4],
    ] as const) {
      const after = advanceTurn(t(i, r), +1, skip)
      expect(advanceTurn({ ...t(i, r), ...after }, -1, skip)).toEqual({ currentIndex: i, round: r })
    }
  })

  it('ANTERIOR no começo com mortos antes trava (não volta pra rodada 0)', () => {
    expect(advanceTurn(t(1, 1), -1, pula('c0'))).toEqual({ currentIndex: 1, round: 1 })
  })

  it('sem isSkipped o comportamento é o antigo', () => {
    expect(advanceTurn(t(0, 1), +1)).toEqual({ currentIndex: 1, round: 1 })
  })
})
