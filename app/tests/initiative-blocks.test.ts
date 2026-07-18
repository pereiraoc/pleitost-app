// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { ladoDe, agruparEmBlocos, SPEED_ORDER, blocoLabel } from '../src/data/initiative-blocks'

type C = { id: string; family: string; tier: 'super' | 'rapido' | 'lento' | null }
const key = (c: C) => ({ tier: c.tier, lado: ladoDe(c.family) })

describe('initiative-blocks', () => {
  it('ladoDe: heroi/jogador → jogador, resto → inimigo', () => {
    expect(ladoDe('Heroi')).toBe('jogador')
    expect(ladoDe('Jogador')).toBe('jogador')
    expect(ladoDe('Monstro')).toBe('inimigo')
    expect(ladoDe('Criatura')).toBe('inimigo')
  })

  it('SPEED_ORDER é super, rapido, lento', () => {
    expect(SPEED_ORDER).toEqual(['super', 'rapido', 'lento'])
  })

  it('agrupa nos 6 blocos na ordem canônica e monta a sequência flat', () => {
    const itens: C[] = [
      { id: 'm-lento', family: 'Monstro', tier: 'lento' },
      { id: 'j-super', family: 'Heroi', tier: 'super' },
      { id: 'm-super', family: 'Monstro', tier: 'super' },
      { id: 'j-rapido', family: 'Jogador', tier: 'rapido' },
      { id: 'sem', family: 'Heroi', tier: null },
    ]
    const { blocos, semBloco, sequencia } = agruparEmBlocos(itens, key)
    // ordem: Jog Super, Ini Super, Jog Rápido, Ini Lento (só os não-vazios)
    expect(blocos.map((b) => b.label)).toEqual([
      blocoLabel('super', 'jogador'),
      blocoLabel('super', 'inimigo'),
      blocoLabel('rapido', 'jogador'),
      blocoLabel('lento', 'inimigo'),
    ])
    expect(sequencia.map((c) => c.id)).toEqual(['j-super', 'm-super', 'j-rapido', 'm-lento'])
    expect(semBloco.map((c) => c.id)).toEqual(['sem'])
  })

  it('preserva ordem de inserção dentro de um bloco', () => {
    const itens: C[] = [
      { id: 'a', family: 'Monstro', tier: 'rapido' },
      { id: 'b', family: 'Monstro', tier: 'rapido' },
    ]
    expect(agruparEmBlocos(itens, key).sequencia.map((c) => c.id)).toEqual(['a', 'b'])
  })
})
