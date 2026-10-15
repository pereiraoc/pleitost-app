// Report 95b2e420 (2026-10-15, @thallesagm): "toda vez que o Samuel abre o
// planejamento, as perícias ficam incorretas e o aviso de quantidades
// incorretas aparece". O plano guardava Enganação A/E/M (N1/N4/N7); o jogador
// trocou pra Diplomacia NA FICHA. A cada abertura o sync reaplicava a
// Enganação e o auto-seed ainda registrava a Diplomacia (o M empurrado pro
// N8, acima do nível — e o sync "desfazia" o M real). Contrato: no passado já
// sincronizado a FICHA é a verdade.
import { describe, expect, it } from 'vitest'
import {
  fichaTemGasto,
  nivelSincronizado,
  semRegistrosContraditos,
  type GastoRegistrado,
} from '../src/rules/level-timeline'

const pericia = (Nome: string, ranks: string[], extra: Record<string, unknown> = {}) => ({
  Nome,
  Incrementos: ranks.map((r) => ({ [r]: `Slot.${r}` })),
  ...extra,
})

// recorte do Samuel: Diplomacia A/E/M na ficha, Enganação zerada
const fm = {
  'Nível': 7,
  Pericias: {
    Lista: [
      pericia('Enganação', []),
      pericia('Diplomacia', ['A', 'E', 'M'], { Especializacao: '[[Encorajamento]]', Maestria: '[[Apoio]]' }),
    ],
  },
}
const regs: GastoRegistrado[] = [
  { nivel: 1, tipo: 'pericia', rank: 'A', alvo: 'Enganação' },
  { nivel: 4, tipo: 'pericia', rank: 'E', alvo: 'Enganação' },
  { nivel: 4, tipo: 'especialidade', alvo: '[[Distração]]', contexto: 'Enganação' },
  { nivel: 7, tipo: 'pericia', rank: 'M', alvo: 'Enganação' },
  { nivel: 7, tipo: 'maestria', alvo: '[[Fascinante]]', contexto: 'Enganação' },
  { nivel: 1, tipo: 'pericia', rank: 'A', alvo: 'Diplomacia' },
  { nivel: 4, tipo: 'pericia', rank: 'E', alvo: 'Diplomacia' },
  { nivel: 4, tipo: 'especialidade', alvo: '[[Encorajamento]]', contexto: 'Diplomacia' },
  { nivel: 8, tipo: 'pericia', rank: 'M', alvo: 'Diplomacia' },
  { nivel: 7, tipo: 'maestria', alvo: '[[Apoio]]', contexto: 'Diplomacia' },
]

describe('a ficha é a verdade no passado sincronizado (report 95b2e420)', () => {
  it('herói sem o marcador conta como sincronizado no nível atual', () => {
    expect(nivelSincronizado(fm, 7)).toBe(7)
    expect(nivelSincronizado({ Planejamento: { nivelSincronizado: 5 } }, 7)).toBe(5)
  })

  it('fichaTemGasto lê o FM cru: perícia por rank, especialização/maestria pelo alvo', () => {
    expect(fichaTemGasto(fm, regs[0]!)).toBe(false)
    expect(fichaTemGasto(fm, regs[5]!)).toBe(true)
    expect(fichaTemGasto(fm, regs[2]!)).toBe(false)
    expect(fichaTemGasto(fm, regs[7]!)).toBe(true)
  })

  it('caso do Samuel: cai toda a trilha da Enganação e o M de Diplomacia fora de lugar; o resto fica', () => {
    const { mudou, registros } = semRegistrosContraditos(fm, regs, 7, 7)
    expect(mudou).toBe(true)
    expect(registros.some((r) => r.contexto === 'Enganação' || r.alvo === 'Enganação')).toBe(false)
    // M@8 com o gasto já na ficha: o nível do registro é que está errado
    expect(registros.some((r) => r.alvo === 'Diplomacia' && r.rank === 'M')).toBe(false)
    expect(registros.filter((r) => r.alvo === 'Diplomacia').map((r) => r.rank)).toEqual(['A', 'E'])
    expect(registros.some((r) => r.alvo === '[[Apoio]]')).toBe(true)
  })

  it('DESCIDA de nível não é contradição: registro acima do atual mas já sincronizado fica (o sync desfaz)', () => {
    const r: GastoRegistrado = { nivel: 7, tipo: 'pericia', rank: 'M', alvo: 'Diplomacia' }
    expect(semRegistrosContraditos(fm, [r], 6, 7).mudou).toBe(false)
  })

  it('SUBIDA de nível não é contradição: registro entre o marcador e o atual ainda vai materializar', () => {
    const r: GastoRegistrado = { nivel: 7, tipo: 'pericia', rank: 'M', alvo: 'Enganação' }
    expect(semRegistrosContraditos(fm, [r], 7, 6).mudou).toBe(false)
  })

  it('plano futuro de verdade (gasto ainda não feito) nunca cai', () => {
    const r: GastoRegistrado = { nivel: 9, tipo: 'pericia', rank: 'M', alvo: 'Enganação' }
    expect(semRegistrosContraditos(fm, [r], 7, 7).mudou).toBe(false)
  })
})
