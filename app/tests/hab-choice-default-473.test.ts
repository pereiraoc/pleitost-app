// @vitest-environment jsdom
// #473: escolha de habilidade DEFAULTADA aparecia como escolhida no dropdown
// de Competências — a aba parecia completa com a bolinha de pendência acesa
// (e re-selecionar o mesmo valor não dispara onChange, então a pendência era
// impossível de limpar). O valor do dropdown agora espelha o critério da
// pendência #302: source default/none abre VAZIO.
import { describe, expect, it } from 'vitest'
import { choicePickValue } from '../src/components/ficha/HabilidadesTab'

const base = {
  choiceKey: 'k',
  label: 'Escolha',
  options: ['[[X]]', '[[Y]]'],
  kind: 'escolha-prop-map' as const,
  pick: 'X',
}

describe('#473 — pick defaultado abre vazio no dropdown', () => {
  it('default/none → vazio (espelha a pendência); explicit/inferred → pick', () => {
    expect(choicePickValue({ ...base, source: 'default' })).toBe('')
    expect(choicePickValue({ ...base, source: 'none' })).toBe('')
    expect(choicePickValue({ ...base, source: 'inferred' })).toBe('[[X]]')
    expect(choicePickValue({ ...base, source: 'explicit' })).toBe('[[X]]')
    // legado sem source segue mostrando o pick (não muda comportamento)
    expect(choicePickValue(base)).toBe('[[X]]')
    // sem pick nenhum, vazio como sempre
    expect(choicePickValue({ ...base, pick: null })).toBe('')
  })
})
