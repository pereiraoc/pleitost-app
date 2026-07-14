// O parser do plugin empacotado pro browser (src/generated via `npm run parsers`)
// tem que parsear IGUAL ao extractor — é o que garante que a validação viva do
// editor de regras (F9) usa a MESMA gramática. Compara com os mesmos fixtures
// que o extractor cobre.
import { describe, expect, it } from 'vitest'
import { parseRuleElementLine, parseConditionLine } from '../src/data/plugin-parsers'

describe('plugin-parsers (browser) — mesma gramática do extractor', () => {
  it('regra genérica válida → parseia (não vazio)', () => {
    const parsed = parseRuleElementLine('Nivel 1 Definir Vida.Vitalidade 15')
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed.length).toBeGreaterThan(0)
  })

  it('linha inválida → vazio (o F7 marca como erro de sintaxe)', () => {
    expect(parseRuleElementLine('lixo @#$ não é regra')).toEqual([])
  })

  it('condição: Escalavel 3 → scaleMax 3', () => {
    expect(parseConditionLine('Agarrado', 'Escalavel 3').scaleMax).toBe(3)
  })

  it('condição: Derivar Condicao Preso → derived ["Preso"]', () => {
    expect(parseConditionLine('Agarrado', 'Derivar Condicao Preso').derived).toEqual(['Preso'])
  })

  it('condição: Somar Condicao.Vigor -2 → regra number', () => {
    expect(parseConditionLine('Agarrado', 'Somar Condicao.Vigor -2').rules).toEqual([
      { kind: 'number', key: 'vigor', value: -2 },
    ])
  })

  it('condição não reconhecida → rule unknown (F7 mantém como problema)', () => {
    const rules = parseConditionLine('X', 'blah blah').rules
    expect(rules.every((r) => r.kind === 'unknown')).toBe(true)
  })
})
