// @vitest-environment jsdom
// #329: o selo de custo das Ações de Habilidade mostrava um quadradinho VAZIO
// pra custo de REAÇÃO ("R") porque custoDigits só extraía dígitos. Agora cai no
// CÓDIGO do custo quando não é numérico ("R"/"L"/"P"/"Min").
import { describe, expect, it } from 'vitest'
import { custoDigits } from '../src/components/ficha/HabilidadesTab'

describe('#329 custoDigits (selo de custo)', () => {
  it('ações numéricas → dígito', () => {
    expect(custoDigits('1A')).toBe('1')
    expect(custoDigits('2A')).toBe('2')
    expect(custoDigits('3A')).toBe('3')
  })
  it('reação → "R" (não mais vazio)', () => {
    expect(custoDigits('R')).toBe('R')
  })
  it('outros códigos não-numéricos passam como estão', () => {
    expect(custoDigits('L')).toBe('L')
    expect(custoDigits('P')).toBe('P')
    expect(custoDigits('Min')).toBe('Min')
  })
  it('vazio/nulo → vazio', () => {
    expect(custoDigits('')).toBe('')
    expect(custoDigits(null)).toBe('')
    expect(custoDigits(undefined)).toBe('')
  })
})
