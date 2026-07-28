// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { ladoDe, agruparEmBlocos, SPEED_ORDER, blocoLabel, blockSortOrder, dropOrder, tiersFor } from '../src/data/initiative-blocks'

type C = { id: string; family: string; tier: 'super' | 'rapido' | 'lento' | null }
const key = (c: C) => ({ tier: c.tier, lado: ladoDe(c.family) })

describe('initiative-blocks', () => {
  it('ladoDe: heroi/jogador → jogador, resto → inimigo', () => {
    expect(ladoDe('Heroi')).toBe('jogador')
    expect(ladoDe('Jogador')).toBe('jogador')
    expect(ladoDe('Monstro')).toBe('inimigo')
    expect(ladoDe('Criatura')).toBe('inimigo')
  })

  it('SPEED_ORDER é super, rapido, lento, superLento', () => {
    expect(SPEED_ORDER).toEqual(['super', 'rapido', 'lento', 'superLento'])
  })

  it('tiersFor: herói tem Super Lento; inimigo não', () => {
    expect(tiersFor('jogador')).toEqual(['super', 'rapido', 'lento', 'superLento'])
    expect(tiersFor('inimigo')).toEqual(['super', 'rapido', 'lento'])
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

  it('blockSortOrder: reordena os ids na ordem dos blocos + sem-velocidade no fim', () => {
    const fam: Record<string, string> = {
      'j-super': 'Heroi', 'm-super': 'Monstro', 'j-rapido': 'Heroi', 'm-lento': 'Monstro', sem: 'Heroi',
    }
    const speeds = { 'm-lento': 'lento', 'j-super': 'super', 'm-super': 'super', 'j-rapido': 'rapido' } as const
    const ladoOf = (id: string) => ladoDe(fam[id] ?? '')
    // ordem inicial embaralhada; blockSortOrder → blocos canônicos, `sem` no fim
    expect(blockSortOrder(['m-lento', 'sem', 'j-super', 'm-super', 'j-rapido'], speeds, ladoOf)).toEqual([
      'j-super', 'm-super', 'j-rapido', 'm-lento', 'sem',
    ])
  })

  // #400: soltar o drag numa posição exata (antes/depois de uma linha) dentro do
  // bloco — reordena DENTRO da mesma categoria pelo próprio drag.
  describe('dropOrder (#400)', () => {
    const fam: Record<string, string> = { a: 'Heroi', b: 'Heroi', c: 'Heroi', m: 'Monstro' }
    const ladoOf = (id: string) => ladoDe(fam[id] ?? '')
    // 3 heróis rápidos (a,b,c) + 1 monstro lento
    const speeds = { a: 'rapido', b: 'rapido', c: 'rapido', m: 'lento' } as const
    const base = ['a', 'b', 'c', 'm']

    it('reordena DENTRO do bloco: soltar `c` ANTES de `a`', () => {
      expect(dropOrder(base, speeds, ladoOf, 'c', 'rapido', { id: 'a', before: true })).toEqual([
        'c', 'a', 'b', 'm',
      ])
    })

    it('reordena DENTRO do bloco: soltar `a` DEPOIS de `b`', () => {
      expect(dropOrder(base, speeds, ladoOf, 'a', 'rapido', { id: 'b', before: false })).toEqual([
        'b', 'a', 'c', 'm',
      ])
    })

    it('sem linha-alvo: só reagrupa nos blocos (blockSortOrder preserva ordem relativa)', () => {
      // move `a` pro bloco lento sem alvo → blockSortOrder mantém `a` antes de
      // `m` (ordem relativa do input); o posicionamento fino é via linha-alvo.
      expect(dropOrder(base, speeds, ladoOf, 'a', 'lento', null)).toEqual(['b', 'c', 'a', 'm'])
    })

    it('muda de bloco E posiciona: soltar `a` (vira lento) ANTES de `m`', () => {
      expect(dropOrder(base, speeds, ladoOf, 'a', 'lento', { id: 'm', before: true })).toEqual([
        'b', 'c', 'a', 'm',
      ])
    })

    it('soltar sobre si mesmo é no-op de posição (só reagrupa)', () => {
      expect(dropOrder(base, speeds, ladoOf, 'b', 'rapido', { id: 'b', before: true })).toEqual(base)
    })
  })
})
