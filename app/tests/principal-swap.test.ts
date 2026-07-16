// #291: swap de Atributo Principal no MODELO DE TRABALHO (projectWorkingModel) —
// entre iterações, a restrição de Principal precisa mexer nos ranks pra que
// condições/Propriedade que leem INT/FOR vejam o valor pós-swap. Testa a lógica
// pura do swap (espelho do plugin/merge-calculated).
import { describe, expect, it } from 'vitest'
import { applyPrincipalToModel } from '../src/rules/extract'
import type { RulesModel } from '../src/rules/rules-model'

const model = (ranks: { FOR: number; AGI: number; INT: number; PRE: number }, principal: string | null) =>
  ({ atributos: { ...ranks }, atributoPrincipal: principal }) as unknown as RulesModel

describe('applyPrincipalToModel (#291)', () => {
  it('rank 3 NÃO permitido → allowed[0] assume o 3 e o antigo troca de rank', () => {
    const m = model({ FOR: 3, AGI: 2, INT: 1, PRE: 0 }, 'FOR')
    applyPrincipalToModel(m, ['INT'])
    expect(m.atributos.INT).toBe(3) // novo principal no rank 3
    expect(m.atributos.FOR).toBe(1) // o antigo do 3 recebe o rank de INT (era 1)
    expect(m.atributos.AGI).toBe(2) // preservado
    expect(m.atributoPrincipal).toBe('INT')
  })

  it('rank 3 JÁ permitido → só sincroniza atributoPrincipal (sem swap)', () => {
    const m = model({ FOR: 3, AGI: 2, INT: 1, PRE: 0 }, null)
    applyPrincipalToModel(m, ['FOR', 'INT'])
    expect(m.atributos.FOR).toBe(3)
    expect(m.atributos.INT).toBe(1)
    expect(m.atributoPrincipal).toBe('FOR')
  })

  it('allowed null/vazio → no-op', () => {
    const m = model({ FOR: 3, AGI: 2, INT: 1, PRE: 0 }, 'FOR')
    applyPrincipalToModel(m, null)
    applyPrincipalToModel(m, [])
    expect(m.atributos).toEqual({ FOR: 3, AGI: 2, INT: 1, PRE: 0 })
    expect(m.atributoPrincipal).toBe('FOR')
  })
})
