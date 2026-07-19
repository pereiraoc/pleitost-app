// #318: o display do dano JUNTA os flats num só e AGRUPA dados de mesma face;
// o tooltip é que segue listando as fontes separadas.
import { describe, expect, it } from 'vitest'
import { composeDanoDisplay } from '../src/interativa/dano'

describe('composeDanoDisplay (#318 — junta flats, agrupa dados)', () => {
  it('junta os flats num trailing só (base + dado extra com flat próprio)', () => {
    // 3d4+2 + "1d12+5" → 3d4+1d12+7 (flats 2+5)
    expect(composeDanoDisplay(3, 4, 2, ['1d12+5'])).toBe('3d4+1d12+7')
    // caso Carlos: Encantar Arma pot 9 = "1d12+3" → 3d4+1d12+5
    expect(composeDanoDisplay(3, 4, 2, ['1d12+3'])).toBe('3d4+1d12+5')
  })

  it('agrupa dados de MESMA face somando as contagens', () => {
    // 3d4 + 1d12 + 1d12 → 3d4+2d12+7
    expect(composeDanoDisplay(3, 4, 7, ['1d12', '1d12'])).toBe('3d4+2d12+7')
    // extra que repete a face BASE agrupa no base: 3d4 + "1d4" → 4d4
    expect(composeDanoDisplay(3, 4, 2, ['1d4'])).toBe('4d4+2')
  })

  it('ordena os termos por CONTAGEM desc (mais dados primeiro)', () => {
    // 1d4 base + 2d12 extra → 2d12 (2 dados) antes de 1d4 (1 dado)
    expect(composeDanoDisplay(1, 4, 0, ['2d12'])).toBe('2d12+1d4')
  })

  it('flats negativos somam (Enfraquecido: base 3d4-2 + 1d12+3)', () => {
    expect(composeDanoDisplay(3, 4, -2, ['1d12+3'])).toBe('3d4+1d12+1')
  })

  it('sem dado extra fica igual ao base; sem dado nenhum vira só o flat', () => {
    expect(composeDanoDisplay(3, 6, 3, [])).toBe('3d6+3')
    expect(composeDanoDisplay(0, 0, 5, [])).toBe('5')
    expect(composeDanoDisplay(2, 6, 0, [])).toBe('2d6')
  })
})
