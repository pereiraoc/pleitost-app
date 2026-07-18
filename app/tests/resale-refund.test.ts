// @vitest-environment node
// #300: ao VENDER um item (arma/tesouro) o herói recebe uma FRAÇÃO (taxa de
// revenda, default 0.5) do valor de mercado — base × taxa, arredondado.
import { describe, expect, it } from 'vitest'
import { resaleRefund } from '../src/data/commerce'
import { sistemaConfig } from '../src/data/system-config'

describe('resaleRefund (#300)', () => {
  it('metade do valor, arredondado', () => {
    expect(resaleRefund(100, 0.5)).toBe(50)
    expect(resaleRefund(25, 0.5)).toBe(13) // 12.5 → 13
    expect(resaleRefund(0, 0.5)).toBe(0) // arma-base sem imbuição
  })

  it('taxa configurável e nunca negativa', () => {
    expect(resaleRefund(100, 1)).toBe(100)
    expect(resaleRefund(100, 0)).toBe(0)
    expect(resaleRefund(100, -1)).toBe(0)
  })
})

describe('sistemaConfig.revenda (#300)', () => {
  it('default 0.5, setter/reset funcionam', () => {
    sistemaConfig.__resetForTests()
    expect(sistemaConfig.getRevenda()).toBe(0.5)
    sistemaConfig.setRevenda(0.25)
    expect(sistemaConfig.getRevenda()).toBe(0.25)
    sistemaConfig.resetRevenda()
    expect(sistemaConfig.getRevenda()).toBe(0.5)
    expect(sistemaConfig.defaults.revenda).toBe(0.5)
  })
})
