// @vitest-environment jsdom
// #497 — o pick ATUAL da escolha nunca pode ser filtrado como "já tem":
// no Leonel, [[Forma Caçadora]] está gravada com fonte Escolha.[[Forma Feral]]
// (pai diferente do sourceNote da escolha) → o filtro taken removia a opção e
// o withCurrent reapresentava o valor CRU com colchetes.
import { describe, expect, it } from 'vitest'
import { choiceOptionsSiblingAware, type HabChoice } from '../src/components/ficha/HabilidadesTab'

describe('choiceOptionsSiblingAware — pick atual sobrevive ao filtro taken', () => {
  it('entrada da lista-alvo com pai divergente não some das opções', () => {
    const c: HabChoice = {
      choiceKey: 'Tradição Druídica (Guardião)|Forma|01',
      label: 'Forma',
      options: ['[[Forma Caçadora]]', '[[Forma Espreitadora]]', '[[Forma Brutal]]'],
      pick: '[[Forma Caçadora]]',
      kind: 'complementar-sel',
      targetRaw: 'Acoes.Lista',
    }
    const fm = {
      Acoes: { Lista: [{ '[[Forma Caçadora]]': 'Escolha.[[Forma Feral]]' }] },
    }
    const opts = choiceOptionsSiblingAware(c, [], fm, 'Tradição Druídica (Guardião)')
    expect(opts.map((o) => o.value)).toContain('[[Forma Caçadora]]')
  })
})
