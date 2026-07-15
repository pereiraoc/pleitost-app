// AdO (#262) — o breakdown ESTRUTURADO tem que bater com o plugin
// (util/ataque-oportunidade.ts): Base = offset da arma; Mestre = +1 dado
// (separado, neutro); Apunhalante = dado migrando (d4 → d6); bônus em verde.
import { describe, expect, it } from 'vitest'
import { computeDanoAdO, type DanoAdOInput } from '../src/interativa/dano'

// Arma "1d4+2": offset 2, dado d4.
function base(prof: DanoAdOInput['prof'], over: Partial<DanoAdOInput> = {}): DanoAdOInput {
  return {
    offsetBase: 2,
    baseDieSize: 4,
    finalDieSize: 4,
    prof,
    fixed: [],
    perDie: [],
    dieStep: [],
    ado: [],
    adoFixo: [],
    ...over,
  }
}

describe('computeDanoAdO — parts (#262)', () => {
  it('arma 1d4+2, prof Adepto/Experiente → AdO só o offset base "2", sem dado', () => {
    for (const prof of ['A', 'E'] as const) {
      const r = computeDanoAdO(base(prof))
      expect(r.display).toBe('2')
      expect(r.diceCount).toBe(0)
      expect(r.parts).toEqual([{ kind: 'base', label: 'Base', value: 2, tone: 'neutral' }])
    }
  })

  it('prof Mestre → soma +1 dado SEPARADO (base 2 + mestre +1d4), display "1d4+2"', () => {
    const r = computeDanoAdO(base('M'))
    expect(r.display).toBe('1d4+2')
    expect(r.diceCount).toBe(1)
    expect(r.parts).toEqual([
      { kind: 'base', label: 'Base', value: 2, tone: 'neutral' },
      { kind: 'mestre', label: 'Mestre', value: 0, extra: '+1d4', tone: 'neutral' },
    ])
  })

  it('Apunhalante (d4 → d6) → parte passoDado mostrando o dado migrando, verde', () => {
    const r = computeDanoAdO(
      base('M', { finalDieSize: 6, dieStep: [{ label: 'Apunhalante', value: 1 }] }),
    )
    expect(r.display).toBe('1d6+2')
    const passo = r.parts.find((p) => p.kind === 'passoDado')
    expect(passo).toEqual({ kind: 'passoDado', label: 'Apunhalante', value: 0, extra: 'd4 → d6', tone: 'pos' })
  })

  it('toggle de dado (não-passivo) → parte ado em VERDE (tone pos)', () => {
    const r = computeDanoAdO(
      base('E', { ado: [{ label: 'Acerto Decisivo', value: 1, passivo: false }] }),
    )
    expect(r.diceCount).toBe(1)
    const ado = r.parts.find((p) => p.kind === 'ado')
    expect(ado).toEqual({ kind: 'ado', label: 'Acerto Decisivo', value: 0, extra: '+1d4', tone: 'pos' })
  })

  it('bônus fixo negativo → tone neg (vermelho)', () => {
    const r = computeDanoAdO(base('A', { fixed: [{ label: 'Penalidade', value: -1 }] }))
    const fixo = r.parts.find((p) => p.kind === 'fixo')
    expect(fixo).toEqual({ kind: 'fixo', label: 'Penalidade', value: -1, tone: 'neg' })
  })
})
