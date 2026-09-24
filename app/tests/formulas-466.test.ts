// #466 — DANO FINAL com os valores do personagem. Módulo PURO: reconhece as
// fórmulas em PROSA das notas (vocabulário levantado em
// docs/plano-dano-final-466.md) e troca pelo valor do herói, mantendo a
// expressão original entre parênteses: "1d6×potência" com potência 4 →
// "4d6 (potência × 1d6)" (decisão do mestre 2026-09-24: multiplica a
// QUANTIDADE de dados, não o resultado). Sem valor no contexto, nada muda.
import { describe, expect, it } from 'vitest'
import { interpolarFormulas, ocorrenciasNaoReconhecidas } from '../src/interativa/formulas'
import { atributoDaEscola, formulaCtxDeMagia } from '../src/interativa/formula-ctx'

const ctx = { potencia: 4, mod: 3 }
const t = (s: string, c = ctx) => interpolarFormulas(s, c).texto

describe('×potência', () => {
  it('NdM×potência multiplica a quantidade de dados', () => {
    expect(t('A criatura recebe 1d6×potência de dano de fogo')).toBe(
      'A criatura recebe 4d6 (potência × 1d6) de dano de fogo',
    )
    expect(t('1d8×potência de dano de raio')).toBe('4d8 (potência × 1d8) de dano de raio')
    expect(t('metade de 1d4×potência')).toBe('metade de 4d4 (potência × 1d4)')
  })
  it('aceita x/X/* e espaços como multiplicação', () => {
    expect(t('1d6 x potência')).toBe('4d6 (potência × 1d6)')
    expect(t('1d6*potência')).toBe('4d6 (potência × 1d6)')
  })
  it('[expr]×potência distribui: dados ×k e constantes ×k, com MOD e (MOD/2)', () => {
    expect(t('Cura [1d6+(MOD/2)]×potência de EH')).toBe('Cura 4d6+4 (potência × [1d6+(MOD/2)]) de EH')
    expect(t('igual a [3+(MOD/2)]×potência por 10 turnos')).toBe('igual a 16 (potência × [3+(MOD/2)]) por 10 turnos')
    expect(t('[1d6+MOD]×potência', { potencia: 2, mod: 3 })).toBe('2d6+6 (potência × [1d6+MOD])')
  })
  it('N×potência sem dado vira o produto, inclusive com unidade', () => {
    expect(t('EV 5×potência')).toBe('EV 20 (potência × 5)')
    expect(t('Você recebe 2×potência EH temporário')).toBe('Você recebe 8 (potência × 2) EH temporário')
    expect(t('por 30 minutos×potência')).toBe('por 120 minutos (potência × 30 minutos)')
    expect(t('em 2 minutos×potência via conversação')).toBe('em 8 minutos (potência × 2 minutos) via conversação')
  })
  it('(expr)×potência e ½×potência (Míssil Mágico, Aterrorizar)', () => {
    expect(t('(1d4+1)×potência de dano de força')).toBe('4d4+4 (potência × (1d4+1)) de dano de força')
    expect(t('causam ½×potência de dano mental')).toBe('causam 2 (potência × ½) de dano mental')
  })
  it('×(potência+N) soma antes de multiplicar', () => {
    expect(t('recebe 1d4×(potência+2) de dano')).toBe('recebe 6d4 (potência+2 × 1d4) de dano')
  })
  it('"potência mágica N maior" ganha o valor ao lado', () => {
    expect(t('Como sucesso, mas considere sua potência mágica 2 maior e a criatura fica Caída')).toBe(
      'Como sucesso, mas considere sua potência mágica 2 maior (6) e a criatura fica Caída',
    )
  })
})

describe('MOD solto', () => {
  it('X+MOD calcula e guarda o original', () => {
    expect(t('causa 2d6+MOD de dano')).toBe('causa 2d6+3 (2d6+MOD) de dano')
    expect(t('CD 13+MOD')).toBe('CD 16 (13+MOD)')
  })
})

describe('contexto incompleto e registro', () => {
  it('sem potência: texto intacto; sem MOD: só o que não depende de MOD', () => {
    expect(t('1d6×potência de dano', { potencia: null, mod: 3 })).toBe('1d6×potência de dano')
    expect(t('[1d6+(MOD/2)]×potência e 1d8×potência', { potencia: 4, mod: null })).toBe(
      '[1d6+(MOD/2)]×potência e 4d8 (potência × 1d8)',
    )
    expect(t('2d6+MOD', { potencia: 4, mod: null })).toBe('2d6+MOD')
  })
  it('substituições vêm listadas (de → para, motivo com os valores)', () => {
    const r = interpolarFormulas('1d6×potência e [1d6+(MOD/2)]×potência', ctx)
    expect(r.substituicoes).toEqual([
      { de: '1d6×potência', para: '4d6', motivo: 'potência 4' },
      { de: '[1d6+(MOD/2)]×potência', para: '4d6+4', motivo: 'potência 4 · MOD 3' },
    ])
  })
  it('texto sem fórmula volta igual, sem substituições', () => {
    const r = interpolarFormulas('Alcance 6q, dura 10 turnos.', ctx)
    expect(r.texto).toBe('Alcance 6q, dura 10 turnos.')
    expect(r.substituicoes).toEqual([])
  })
})

describe('ocorrenciasNaoReconhecidas', () => {
  it('lista "potência" fora dos padrões (ignora wikilinks e os padrões reconhecidos)', () => {
    expect(ocorrenciasNaoReconhecidas('Reduz dano em 2×potência de você ou aliado')).toEqual([])
    expect(ocorrenciasNaoReconhecidas('considere sua potência mágica 2 maior')).toEqual([])
    expect(ocorrenciasNaoReconhecidas('ver [[Potência Mágica|potência mágica]] pra detalhes')).toEqual([])
    const r = ocorrenciasNaoReconhecidas('O dano dobra se a sua potência for maior que 5.')
    expect(r).toHaveLength(1)
    expect(r[0]).toContain('potência for maior')
  })
})


describe('formulaCtxDeMagia (valores do FM derivado)', () => {
  const fm = {
    Atributos: { FOR: 0, AGI: 2, INT: 1, PRE: 3 },
    Magias: {
      Potencia: 8,
      Lista: [
        { Nome: 'Arcana Negra', Atributo: 'INT', Lista: [] },
        { Nome: 'Arcana Branca', Atributo: 'PRE', Lista: [] },
      ],
      Secundaria: { Potencia: 3, Lista: [{ Nome: 'Anima', Atributo: 'PRE', Lista: [] }] },
    },
  }
  it('bloco primário: potência do bloco + MOD do atributo da escola', () => {
    expect(atributoDaEscola(fm, 'Arcana Branca')).toBe('PRE')
    expect(formulaCtxDeMagia(fm, 'Arcana Branca')).toEqual({ potencia: 8, mod: 3 })
    expect(formulaCtxDeMagia(fm, 'Arcana Negra')).toEqual({ potencia: 8, mod: 1 })
  })
  it('bloco secundário: o chamador passa o fm do bloco (Magias = Secundaria)', () => {
    const sec = { ...fm, Magias: fm.Magias.Secundaria }
    expect(formulaCtxDeMagia(sec, 'Anima')).toEqual({ potencia: 3, mod: 3 })
  })
  it('escola desconhecida/Tesouros → sem MOD; potência 0 → null', () => {
    expect(formulaCtxDeMagia(fm, 'Tesouros')).toEqual({ potencia: 8, mod: null })
    expect(formulaCtxDeMagia({ Magias: { Potencia: 0 } }, null)).toEqual({ potencia: null, mod: null })
  })
})
