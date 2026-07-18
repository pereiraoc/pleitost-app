// @vitest-environment node
// #66 (feedback do mestre): as invocações ativas (ex. Amálgama das Sombras do
// Pind) devem aparecer no roster de combate, aninhadas ao invocador. O resolver
// PURO casa cada label ativo com seu descriptor e resolve o stat block por
// instância (potência da instância → EV/stats), como o InstanciaCard da ficha.
import { describe, expect, it } from 'vitest'
import { resolveActiveInvocacoes } from '../src/interativa/invocacao'
import type { EffectDescriptor } from '../src/interativa/descriptor'

const desc = {
  label: 'Sombra',
  tipoEfeito: 'Invocação',
  invocacao: {
    porProficienciaEm: undefined,
    proficienciaMinima: null,
    stats: { EV: { porSeletor: 'Potência Mágica', multiplicador: 5 }, Defesa: 3 },
    ataques: [],
  },
} as unknown as EffectDescriptor

describe('resolveActiveInvocacoes (#66)', () => {
  it('casa label→descriptor; evMax = 5×potência da instância; pula label sem descriptor', () => {
    const fm = { Nível: 5 }
    const ativas = {
      Sombra: [{ id: 'a', potencia: 6, vitalidade: 30, moralTemporaria: 0 }],
      Fantasma: [{ id: 'b', potencia: 3, vitalidade: 10, moralTemporaria: 0 }],
    }
    const out = resolveActiveInvocacoes([desc], fm, ativas)
    expect(out.length).toBe(1) // 'Fantasma' sem descriptor → pulado
    expect(out[0]!.label).toBe('Sombra')
    expect(out[0]!.inst.id).toBe('a')
    expect(out[0]!.evMax).toBe(30) // 5 × 6
  })

  it('múltiplas instâncias do mesmo label = múltiplas entradas (cada uma com seu EV)', () => {
    const ativas = {
      Sombra: [
        { id: 'a', potencia: 6, vitalidade: 30, moralTemporaria: 0 },
        { id: 'b', potencia: 2, vitalidade: 10, moralTemporaria: 0 },
      ],
    }
    const out = resolveActiveInvocacoes([desc], {}, ativas)
    expect(out.map((o) => o.inst.id)).toEqual(['a', 'b'])
    expect(out.map((o) => o.evMax)).toEqual([30, 10]) // 5×6, 5×2
  })
})
