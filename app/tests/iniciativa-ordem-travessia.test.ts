// Report 2026-10-01 (user, GM na mesa): "fui passando a vez e não fez na
// ordem certa — mostrou inimigos lentos antes dos jogadores lentos, mesmo
// que visualmente tava certo". Causa: o DISPLAY agrupa por speedOf (sem
// velocidade explícita → bloco Lento do lado), mas a TRAVESSIA (advanceTurn)
// anda sobre ts.order cru — quem entrou no meio do combate (reconcile de
// herói, monstro do bestiário) é appendado no FIM, e blockSortOrder mandava
// "sem velocidade" pro fim (semBloco). Visual certo, vez errada.
// Fix: ordemDeTurnoEfetiva — a MESMA ordem do display (default 'lento',
// blocos canônicos Jog/Ini × Super/Rápido/Lento/SuperLento) vira a ordem de
// travessia, com normalização idempotente preservando o combatente da vez.
import { describe, expect, it } from 'vitest'
import {
  normalizaTurnState,
  ordemDeTurnoEfetiva,
  type Lado,
  type SpeedTier,
} from '../src/data/initiative-blocks'

const ladoOf = (id: string): Lado => (id.startsWith('j') ? 'jogador' : 'inimigo')

describe('ordem de travessia = ordem do display (report 2026-10-01)', () => {
  it('o CASO DO BUG: jogador lento appendado no fim anda ANTES dos inimigos lentos', () => {
    // combate começou com j1 (rápido) e dois inimigos lentos; j2 entrou
    // depois (reconcile → append) SEM velocidade explícita → display o mostra
    // em "Jogadores Lentos" (antes de "Inimigos Lentos"); a travessia tem
    // que seguir o display.
    const order = ['j1', 'i1', 'i2', 'j2']
    const speeds: Record<string, SpeedTier> = { j1: 'rapido', i1: 'lento', i2: 'lento' }
    expect(ordemDeTurnoEfetiva(order, speeds, ladoOf)).toEqual(['j1', 'j2', 'i1', 'i2'])
  })

  it('sem velocidade nenhuma: todo mundo é Lento, jogadores antes de inimigos', () => {
    expect(ordemDeTurnoEfetiva(['i1', 'j1', 'i2'], {}, ladoOf)).toEqual(['j1', 'i1', 'i2'])
  })

  it('ordem já normalizada é estável (idempotente)', () => {
    const order = ['j1', 'j2', 'i1', 'i2']
    const speeds: Record<string, SpeedTier> = { j1: 'rapido', i1: 'lento', i2: 'lento' }
    const uma = ordemDeTurnoEfetiva(order, speeds, ladoOf)
    expect(ordemDeTurnoEfetiva(uma, speeds, ladoOf)).toEqual(uma)
  })

  it('normalizaTurnState preserva QUEM está na vez e não mexe no round', () => {
    // i1 está jogando (índice 1 da ordem crua); após normalizar, o ponteiro
    // tem que continuar no i1, onde quer que ele tenha ido parar.
    const ts = {
      order: ['j1', 'i1', 'i2', 'j2'],
      currentIndex: 1,
      round: 3,
      speeds: { j1: 'rapido', i1: 'lento', i2: 'lento' } as Record<string, SpeedTier>,
    }
    const n = normalizaTurnState(ts, ladoOf)
    expect(n.order).toEqual(['j1', 'j2', 'i1', 'i2'])
    expect(n.order[n.currentIndex]).toBe('i1')
    expect(n.round).toBe(3)
  })

  it('normalizaTurnState é no-op estrutural quando já está normalizado', () => {
    const ts = {
      order: ['j1', 'j2', 'i1'],
      currentIndex: 0,
      round: 1,
      speeds: { j1: 'rapido' } as Record<string, SpeedTier>,
    }
    const n = normalizaTurnState(ts, ladoOf)
    expect(n.order).toEqual(ts.order)
    expect(n.currentIndex).toBe(0)
  })
})
