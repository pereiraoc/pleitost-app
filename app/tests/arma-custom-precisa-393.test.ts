// @vitest-environment node
// #393 — "garras do rei-mago não estão considerando AGI (propriedade precisa)."
// A propriedade Precisa ("pode usar Agilidade em vez de Força na jogada de
// ataque" — Sistema/Regras/Propriedades/Precisa) faz o ataque usar max(FOR,
// AGI) com empate em FOR — espelho de deriveArmaAtributo do plugin
// (extract/apply-armas-edit.ts:44-59). O ataque custom `tipo: Arma` (Garras do
// Rei-Mago) ignorava isso e ficava sempre em FOR. O nível do porFor
// RESOLVIDO decide: as Garras têm Precisa nos degraus 1/2 mas NÃO no 3, então
// com FOR alto (degrau 3) volta a ser FOR puro.
import { describe, expect, it } from 'vitest'
import { collectCustomAtaques } from '../src/interativa/arma-custom'
import type { EffectDescriptor } from '../src/interativa/descriptor'

// Espelha os Efeitos_Interativos reais de
// vault-data/Sistema/Equipamento/Tesouros/Artefatos/Garras do Rei-Mago.json
// (Mão Primária): Precisa nos degraus 1 e 2, sem propriedade no degrau 3.
function garrasPrimaria(): EffectDescriptor {
  return {
    label: 'Garras do Rei-Mago (Mão Primária)',
    sourceNote: 'Sistema/Equipamento/Tesouros/Artefatos/Garras do Rei-Mago.md',
    tipo: 'Arma',
    link: '[[Garras do Rei-Mago]]',
    bonusItem: 3,
    grupoAtaque: 'cac-marcial',
    selectors: [],
    parameters: {},
    modifiers: [],
    porFor: {
      1: { dano: 'd6+3', tipo: 'corte', propriedades: ['[[Precisa]]'] },
      2: { dano: 'd6+3', tipo: 'corte', propriedades: ['[[Precisa]]', '[[Apunhalante]]'] },
      3: { dano: 'd8+4', tipo: 'corte', propriedades: [] },
    },
  }
}

describe('#393 — Precisa: ataque custom usa max(FOR, AGI)', () => {
  it('AGI > FOR no degrau com Precisa → atributo AGI', () => {
    const [atk] = collectCustomAtaques([garrasPrimaria()], /*FOR*/ 2, /*AGI*/ 5)
    expect(atk).toBeTruthy()
    expect(atk!.atributo).toBe('AGI')
  })

  it('FOR ≥ AGI no degrau com Precisa → atributo FOR (empate em FOR)', () => {
    const [atk] = collectCustomAtaques([garrasPrimaria()], /*FOR*/ 2, /*AGI*/ 2)
    expect(atk!.atributo).toBe('FOR')
  })

  it('degrau SEM Precisa (FOR alto → porFor 3) → atributo FOR mesmo com AGI maior', () => {
    const [atk] = collectCustomAtaques([garrasPrimaria()], /*FOR*/ 3, /*AGI*/ 9)
    // degrau 3 não tem Precisa → sempre FOR
    expect(atk!.atributo).toBe('FOR')
  })

  it('sem AGI informado (default) preserva FOR — retrocompat', () => {
    const [atk] = collectCustomAtaques([garrasPrimaria()], /*FOR*/ 1)
    expect(atk!.atributo).toBe('FOR')
  })
})
