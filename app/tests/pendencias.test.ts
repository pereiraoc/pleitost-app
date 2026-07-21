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

  // #328: Mago SECUNDÁRIO com todos os slots preenchidos NÃO deve mais mostrar
  // "Magia a aprender". Caso do bug (Bazuquer): primário Quasi-Mago tem um slot B
  // SOLTO sem escola proficiente (inpreenchível) e o secundário Mago tem 4 slots A
  // todos preenchidos. Antes freeMagiaSlot só olhava o primário e via o B livre.
  it('#328 Mago secundário cheio (+ slot B solto inpreenchível no primário) → sem pendência de magia', () => {
    const fm = {
      Classe: '[[Guerreiro|Quasi-Mago]]',
      nome: 'Bazuquer',
      Pericias: { Slots: zeroSlots, Lista: [] },
      Tecnicas: { Slots: zeroSlots, Lista: [] },
      Magias: {
        Slots: { B: 1, A: 0, E: 0, M: 0 },
        Lista: [
          { Nome: 'Arcana Negra', Proficiencia: 'N', Lista: [] },
          { Nome: 'Arcana Branca', Proficiencia: 'N', Lista: [] },
          { Nome: 'Tesouros', Proficiencia: 'N', Lista: [{ '[[Visão no Escuro]]': 'Regra' }] },
        ],
        Secundaria: {
          Slots: { B: 0, A: 4, E: 0, M: 0 },
          Lista: [
            { Nome: 'Arcana Negra', Proficiencia: 'E', Lista: [{ '[[Aterrorizar]]': 'Slot.A' }, { '[[Míssil Mágico]]': 'Slot.A' }] },
            { Nome: 'Arcana Branca', Proficiencia: 'E', Lista: [{ '[[Encantar Arma]]': 'Slot.A' }, { '[[Fluxo de Vida]]': 'Slot.A' }] },
          ],
        },
      },
    }
    const pend = heroPendencias(fm, { subclassChoices: [], sintonias: [] }, CAPS)
    expect(pend.get('habilidades') ?? []).not.toContain('Magia a aprender (slot livre)')
  })

  it('#328 slot A livre numa escola PROFICIENTE (primário) → pendência (controle positivo)', () => {
    const fm = {
      Classe: '[[Mago]]',
      nome: 'Erin',
      Pericias: { Slots: zeroSlots, Lista: [] },
      Tecnicas: { Slots: zeroSlots, Lista: [] },
      Magias: {
        Slots: { B: 0, A: 2, E: 0, M: 0 },
        Lista: [{ Nome: 'Arcana Negra', Proficiencia: 'E', Lista: [{ '[[Míssil Mágico]]': 'Slot.A' }] }],
      },
    }
    const pend = heroPendencias(fm, { subclassChoices: [], sintonias: [] }, CAPS)
    expect(pend.get('habilidades')).toContain('Magia a aprender (slot livre)')
  })

  it('#328 slot A livre no Mago SECUNDÁRIO (escola proficiente) → pendência', () => {
    const fm = {
      Classe: '[[Guerreiro|Quasi-Mago]]',
      nome: 'Bazuquer',
      Pericias: { Slots: zeroSlots, Lista: [] },
      Tecnicas: { Slots: zeroSlots, Lista: [] },
      Magias: {
        Slots: { B: 0, A: 0, E: 0, M: 0 },
        Lista: [{ Nome: 'Arcana Negra', Proficiencia: 'N', Lista: [] }],
        Secundaria: {
          Slots: { B: 0, A: 4, E: 0, M: 0 },
          Lista: [{ Nome: 'Arcana Negra', Proficiencia: 'E', Lista: [{ '[[Aterrorizar]]': 'Slot.A' }] }],
        },
      },
    }
    const pend = heroPendencias(fm, { subclassChoices: [], sintonias: [] }, CAPS)
    expect(pend.get('habilidades')).toContain('Magia a aprender (slot livre)')
  })

  it('#13b: seleção de habilidade não feita (Instrumentos de Guerra, source default) vira pendência', () => {
    const fm = {
      Classe: '[[Bardo]]',
      nome: 'X',
      Pericias: { Slots: zeroSlots, Lista: [] },
      Tecnicas: { Slots: zeroSlots, Lista: [] },
      Magias: { Slots: { B: 0, A: 0, E: 0, M: 0 }, Lista: [] },
    }
    const rules = {
      subclassChoices: [],
      sintonias: [],
      habilidadeChoices: [
        { options: ['[[Cordas]]', '[[Percussão]]'], source: 'default' }, // não escolhida
        { options: ['[[Sopro]]', '[[Metais]]'], source: 'persisted' }, // escolhida → não conta
        { options: ['[[Único]]'], source: 'default' }, // 1 opção → não é escolha real
      ],
    }
    expect(heroPendencias(fm, rules, CAPS).get('habilidades')).toContain('Seleção de habilidade não escolhida')
    const rules2 = {
      habilidadeChoices: [
        { options: ['a', 'b'], source: 'default' },
        { options: ['c', 'd'], source: 'none' },
      ],
    }
    expect(heroPendencias(fm, rules2, CAPS).get('habilidades')).toContain('2 seleções não escolhidas')
  })
})
