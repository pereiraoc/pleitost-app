// @vitest-environment jsdom
// Filtro "já tem" nos dropdowns de Escolha_Habilidades (pedido junto do
// redesign da Essência Invertida): opção cujo alvo JÁ está na lista-alvo por
// OUTRA fonte (outra escolha, regra, slot) some das opções — só a pick da
// PRÓPRIA escolha continua visível (senão o valor salvo sumia do dropdown).
// Complementa o filtro de irmãs (#484), que só olhava picks transientes.
import { describe, expect, it } from 'vitest'
import { choiceOptionsSiblingAware } from '../src/components/ficha/HabilidadesTab'

const baseChoice = {
  choiceKey: 'k1',
  label: 'Essência Invertida',
  options: [
    '[[Essência Enraizante Adepta]]',
    '[[Essência Mineral Adepta]]',
    '[[Essência Flamejante Adepta]]',
    '[[Essência Sísmica Adepta]]',
  ],
  pick: '[[Essência Enraizante Adepta]]',
  kind: 'complementar-sel' as const,
  targetRaw: 'Habilidades.Lista',
  source: 'persisted',
}

const fm = {
  Habilidades: {
    Lista: [
      // pick da PRÓPRIA escolha — tem que continuar aparecendo
      { '[[Essência Enraizante Adepta]]': 'Escolha.[[Essência Invertida]]' },
      // já tem por OUTRA escolha — some
      { '[[Essência Flamejante Adepta]]': 'Escolha.01.[[Magias Anima]]' },
      // já tem por REGRA de OUTRA nota — some
      { '[[Essência Sísmica Adepta]]': 'Regra.[[Alguma Nota]]' },
    ],
  },
}

const values = (opts: Array<{ value: string }>) => opts.map((o) => o.value)

describe('filtro "já tem" nas opções de escolha', () => {
  it('esconde opções já na lista por outra fonte; mantém a própria pick e as livres', () => {
    const opts = values(choiceOptionsSiblingAware(baseChoice, [baseChoice], fm, 'Essência Invertida'))
    expect(opts).toContain('[[Essência Enraizante Adepta]]') // própria pick
    expect(opts).toContain('[[Essência Mineral Adepta]]') // livre
    expect(opts).not.toContain('[[Essência Flamejante Adepta]]') // outra escolha
    expect(opts).not.toContain('[[Essência Sísmica Adepta]]') // regra
  })

  it('pick LEGADO gravado como Regra.[[pai]] (formato antigo) também conta como próprio', () => {
    // Drauzio: '[[Especialista em Caçada]]': 'Regra.[[Explorador Nato]]' —
    // o pick antigo era tagueado Regra., não Escolha.; some só o de OUTRA nota.
    const c = {
      ...baseChoice,
      options: ['[[Especialista em Caçada]]', '[[Ambidestria]]'],
      pick: '[[Especialista em Caçada]]',
      targetRaw: 'Tecnicas.Lista',
    }
    const fmLegado = {
      Tecnicas: { Lista: [{ '[[Especialista em Caçada]]': 'Regra.[[Explorador Nato]]' }] },
    }
    const opts = values(choiceOptionsSiblingAware(c, [c], fmLegado, 'Explorador Nato'))
    expect(opts).toContain('[[Especialista em Caçada]]')
    expect(opts).toContain('[[Ambidestria]]')
  })

  it('sem fm (call sites antigos), comportamento intacto: só filtro de irmãs', () => {
    const irma = { ...baseChoice, choiceKey: 'k2', pick: '[[Essência Mineral Adepta]]' }
    const opts = values(choiceOptionsSiblingAware(baseChoice, [baseChoice, irma]))
    expect(opts).toContain('[[Essência Enraizante Adepta]]')
    expect(opts).not.toContain('[[Essência Mineral Adepta]]') // pick da irmã
    expect(opts).toContain('[[Essência Flamejante Adepta]]') // sem fm → sem filtro de lista
  })

  it('lista-alvo respeita o targetRaw da escolha (Tecnicas.Lista não olha Habilidades.Lista)', () => {
    const c = { ...baseChoice, targetRaw: 'Tecnicas.Lista', pick: null, source: 'none' }
    const fmTec = {
      ...fm,
      Tecnicas: { Lista: [{ '[[Essência Mineral Adepta]]': 'Escolha.[[Outra Técnica]]' }] },
    }
    const opts = values(choiceOptionsSiblingAware(c, [c], fmTec, 'Essência Invertida'))
    expect(opts).not.toContain('[[Essência Mineral Adepta]]') // já tem na LISTA-ALVO
    expect(opts).toContain('[[Essência Flamejante Adepta]]') // Habilidades.Lista não conta aqui
  })
})
