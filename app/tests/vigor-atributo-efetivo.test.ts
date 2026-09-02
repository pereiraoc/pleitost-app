// Report dd26e913 ("vigor não está considerando presença"): as resistências
// usam o MAIOR entre dois atributos — Vigor = max(FOR, PRE), Reflexo =
// max(AGI, INT), Ímpeto = max(INT, PRE); empate preserva o atributo cadastrado
// no FM (espelho de resolveResistenciaAttr, plugin util/modificadores.ts:
// 143-167). Herói LOCAL criado no wizard fica com o placeholder do skeleton
// (Vigor→FOR) e o app calculava direto do FM — um herói de PRE via o Vigor
// sem a Presença. Heróis da vault não mudam: o plugin grava o atributo já
// resolvido, e o max() coincide com o cadastrado.
import { describe, expect, it } from 'vitest'
import { memberStats, resolveResistenciaAttr } from '../src/grupo/stats'
import { resistenciaRow, rowMod } from '../src/components/ficha/hero-model'
import type { ProfRow } from '../src/components/ficha/hero-model'
import { resistenciaBreakdown } from '../src/components/ficha/tooltips'

// Atributos do reporter (herói de PRE): FOR 0, AGI 2, INT 1, PRE 3.
const ATTRS = { FOR: 0, AGI: 2, INT: 1, PRE: 3 }

describe('resolveResistenciaAttr — espelho do plugin', () => {
  it('Vigor com PRE > FOR resolve pra PRE', () => {
    expect(resolveResistenciaAttr('Vigor', 'FOR', ATTRS)).toBe('PRE')
  })
  it('Vigor com FOR > PRE resolve pra FOR', () => {
    expect(resolveResistenciaAttr('Vigor', 'FOR', { ...ATTRS, FOR: 4 })).toBe('FOR')
  })
  it('empate preserva o atributo cadastrado', () => {
    expect(resolveResistenciaAttr('Vigor', 'FOR', { ...ATTRS, FOR: 3 })).toBe('FOR')
    expect(resolveResistenciaAttr('Vigor', 'PRE', { ...ATTRS, FOR: 3 })).toBe('PRE')
  })
  it('Ímpeto (acentuado, como o FM grava) = max(INT, PRE)', () => {
    expect(resolveResistenciaAttr('Ímpeto', 'PRE', ATTRS)).toBe('PRE')
    expect(resolveResistenciaAttr('Ímpeto', 'PRE', { ...ATTRS, INT: 4 })).toBe('INT')
  })
  it('Reflexo = max(AGI, INT)', () => {
    expect(resolveResistenciaAttr('Reflexo', 'AGI', ATTRS)).toBe('AGI')
    expect(resolveResistenciaAttr('Reflexo', 'AGI', { ...ATTRS, INT: 4 })).toBe('INT')
  })
  it('Defesa NÃO entra no best-of (rule de armadura decide) — mantém o cadastrado', () => {
    expect(resolveResistenciaAttr('Defesa', 'AGI', { ...ATTRS, FOR: 5 })).toBe('AGI')
  })
})

describe('resistenciaRow — linha com o atributo efetivo (ficha do herói)', () => {
  const vigorSkeleton: ProfRow = {
    Nome: 'Vigor',
    Atributo: 'FOR',
    Proficiencia: 'N',
    Bonus_Item: 0,
    Bonus_Especial: 0,
  }
  it('herói local de PRE: Vigor soma a Presença (10+3=13, não 10+0)', () => {
    const efetiva = resistenciaRow(vigorSkeleton, ATTRS)
    expect(efetiva.Atributo).toBe('PRE')
    expect(10 + rowMod(efetiva, ATTRS)).toBe(13)
  })
  it('tooltip mostra a linha do atributo efetivo (PRE +3)', () => {
    const bd = resistenciaBreakdown(vigorSkeleton, ATTRS)
    expect(bd.total).toBe(13)
    const attrPart = bd.parts.find((p) => p.label === 'PRE')
    expect(attrPart?.value).toBe(3)
  })
})

describe('memberStats — grupo/sessão com herói local de PRE', () => {
  // FM skeleton do wizard (defaultDefesasLista de local-entities.ts).
  const fm = {
    Atributos: { ...ATTRS },
    Defesas_Resistencias: {
      Lista: [
        { Nome: 'Defesa', Atributo: 'AGI', Proficiencia: 'N', Bonus_Item: 0, Bonus_Especial: 0 },
        { Nome: 'Vigor', Atributo: 'FOR', Proficiencia: 'N', Bonus_Item: 0, Bonus_Especial: 0 },
        { Nome: 'Reflexo', Atributo: 'AGI', Proficiencia: 'N', Bonus_Item: 0, Bonus_Especial: 0 },
        { Nome: 'Ímpeto', Atributo: 'PRE', Proficiencia: 'N', Bonus_Item: 0, Bonus_Especial: 0 },
      ],
    },
  }
  it('Vigor considera a Presença; Reflexo/Ímpeto seguem o best-of', () => {
    const stats = memberStats(fm)
    expect(stats.defs['Vigor']).toBe(13) // 10 + PRE 3 (era 10 + FOR 0)
    expect(stats.defs['Reflexo']).toBe(12) // 10 + AGI 2
    expect(stats.defs['Ímpeto']).toBe(13) // 10 + PRE 3
    expect(stats.defs['Defesa']).toBe(12) // cadastrado (AGI)
  })
})
