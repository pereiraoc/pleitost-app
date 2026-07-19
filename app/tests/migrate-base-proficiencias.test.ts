// @vitest-environment jsdom
// Bug: proficiências-base universais (Armas Simples, Defesa Sem Armadura) nasciam
// 'N' num skeleton antigo → herói local aparecia sem elas. Todo personagem É
// proficiente. A migração sobe N→P ao carregar.
import { describe, expect, it } from 'vitest'
import { migrateBaseProficiencias } from '../src/data/local-entities'

describe('migrateBaseProficiencias', () => {
  it('sobe Armas Simples e Defesa Sem Armadura de N para P', () => {
    const fm = {
      Inventario: {
        Armas: { Proficiencia: { Simples: 'N', Marciais: 'N', Especificas: [] } },
        Armadura: { Proficiencia: { Sem: 'N', Leve: 'N', Pesada: 'N' } },
      },
    }
    const out = migrateBaseProficiencias(fm) as Record<string, any>
    expect(out.Inventario.Armas.Proficiencia.Simples).toBe('P')
    expect(out.Inventario.Armadura.Proficiencia.Sem).toBe('P')
    // NÃO mexe nas específicas (vêm das regras de classe)
    expect(out.Inventario.Armas.Proficiencia.Marciais).toBe('N')
    expect(out.Inventario.Armadura.Proficiencia.Leve).toBe('N')
  })

  it('idempotente (já P → mesma referência) e ignora FM sem Inventario', () => {
    const jaP = {
      Inventario: {
        Armas: { Proficiencia: { Simples: 'P' } },
        Armadura: { Proficiencia: { Sem: 'P' } },
      },
    }
    expect(migrateBaseProficiencias(jaP)).toBe(jaP)
    const semInv = { foo: 1 }
    expect(migrateBaseProficiencias(semInv)).toBe(semInv)
  })
})
