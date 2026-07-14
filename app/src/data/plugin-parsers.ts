// Fachada TIPADA sobre os parsers do plugin gerados em src/generated (via
// `npm run parsers`). O app chama a DSL de regras SÓ por aqui — assinaturas
// mínimas e estáveis; a saída é tratada como os mesmos dados que o extractor já
// produz (RuleElement.parsed / ConditionParse). Isto é o que habilita a
// validação viva do editor de regras (F9) reusando a gramática real, sem
// reimplementar nada no app (no_invented_strings).
//
// Os módulos gerados são `@ts-nocheck` (código do plugin), então seus exports
// chegam como `any` — a tipagem correta é imposta AQUI.
import { parseRuleLineMulti } from '../generated/rule-parser'
import { parseConditionRules } from '../generated/parse-condition-rule'
import type { ConditionParse } from './types'

/** Parseia UMA linha de Elemento de Regra genérico → array de regras (o mesmo
 *  shape de `RuleElement.parsed` do extractor). Vazio quando a linha não parseia
 *  (o F7 trata raw não-vazio + parsed vazio como erro de sintaxe). Nunca lança. */
export function parseRuleElementLine(line: string, sourceNote = 'app', index = 0): unknown[] {
  try {
    return (parseRuleLineMulti(line, sourceNote, index) as unknown[]) ?? []
  } catch {
    return []
  }
}

/** Parseia UMA linha de Elementos_de_Regra de uma nota de Condição → o mesmo
 *  `condition` que o extractor funde (scaleMax/rules/derived). Nunca lança. */
export function parseConditionLine(id: string, line: string): ConditionParse {
  const { scaleMax, rules, derived } = parseConditionRules(id, [line]) as ConditionParse
  return { scaleMax, rules, derived }
}
