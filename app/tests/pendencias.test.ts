// @vitest-environment node
// #302: pendências por aba (o que falta preencher) reusando as contas dos
// painéis — slots livres, classe/especialidade/maestria não escolhidas. Cada
// aba carrega a LISTA de motivos (usada no tooltip do indicador). Biografia
// NÃO tem pendência: o nome sempre existe (basename), então flaggar `fm.nome`
// vazio era falso-positivo pra todo herói real.
import { describe, expect, it } from 'vitest'
import { heroPendencias } from '../src/rules/pendencias'
import type { FichaFamilia } from '../src/data/familia'

const CAPS = {
  classe: { rotulo: 'Classe', editavel: true },
  biografia: true,
  especializacoes: true,
  tecnicas: true,
  magias: true,
} as unknown as FichaFamilia

const zeroSlots = { A: 0, E: 0, M: 0 }

describe('heroPendencias (#302)', () => {
  it('herói novo: sem classe e slot de perícia livre → Competências (com motivos); Biografia nunca', () => {
    const fm = {
      Classe: '',
      nome: '',
      Pericias: { Slots: { A: 1, E: 0, M: 0 }, Lista: [] },
      Tecnicas: { Slots: zeroSlots, Lista: [] },
      Magias: { Slots: {}, Lista: [] },
    }
    const pend = heroPendencias(fm, null, CAPS)
    expect(pend.get('habilidades')).toEqual(['Classe não escolhida', 'Perícia adicional disponível'])
    expect(pend.has('perfil')).toBe(false) // Biografia não é falso-positivo (nome cai no basename)
  })

  it('Carlos-like: herói completo sem `fm.nome` próprio → NENHUMA pendência de Biografia', () => {
    const fm = {
      Classe: '[[Bardo]]',
      nome: '', // usa o basename como nome — não é pendência
      Pericias: { Slots: zeroSlots, Lista: [] },
      Tecnicas: { Slots: zeroSlots, Lista: [] },
      Magias: { Slots: { B: 0, A: 0, E: 0, M: 0 }, Lista: [] },
    }
    const pend = heroPendencias(fm, { subclassChoices: [], sintonias: [] }, CAPS)
    expect(pend.size).toBe(0)
  })

  it('perícia elegível (rank E) sem Especialização → Competências pendente', () => {
    const fm = {
      Classe: '[[Bardo]]',
      nome: 'Érico',
      Pericias: { Slots: zeroSlots, Lista: [{ Nome: 'Atletismo', Proficiencia: 'E', Especializacao: '' }] },
      Tecnicas: { Slots: zeroSlots, Lista: [] },
      Magias: { Slots: {}, Lista: [] },
    }
    expect(heroPendencias(fm, null, CAPS).get('habilidades')).toContain('Especialidade não escolhida')
  })

  it('tudo preenchido (classe, nome, sem slot livre, especialização feita) → sem pendência', () => {
    const fm = {
      Classe: '[[Bardo]]',
      nome: 'Érico',
      Pericias: {
        Slots: zeroSlots,
        Lista: [{ Nome: 'Atletismo', Proficiencia: 'E', Especializacao: '[[Impulso]]' }],
      },
      Tecnicas: { Slots: zeroSlots, Lista: [] },
      Magias: { Slots: { B: 0, A: 0, E: 0, M: 0 }, Lista: [] },
    }
    const pend = heroPendencias(fm, { subclassChoices: [], sintonias: [] }, CAPS)
    expect(pend.size).toBe(0)
  })

  it('subclasse não escolhida → Competências pendente', () => {
    const fm = { Classe: '[[Bardo]]', nome: 'X', Pericias: { Slots: zeroSlots, Lista: [] }, Tecnicas: { Slots: zeroSlots, Lista: [] }, Magias: { Slots: {}, Lista: [] } }
    const pend = heroPendencias(fm, { subclassChoices: [{ pick: null }], sintonias: [] }, CAPS)
    expect(pend.has('habilidades')).toBe(true)
  })
})
