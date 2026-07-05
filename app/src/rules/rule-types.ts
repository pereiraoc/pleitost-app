// Tipos da avaliação de regras — ESPELHO do contrato ParsedRule do plugin
// pleitost-autosheet (src/extract/rule-parser.ts:21-129). O app NÃO reparsa
// a DSL: a AST já vem pronta em `doc.ruleElements[].parsed` do vault-data
// (extractor/extract-vault.mjs reusa o rule-parser do plugin read-only).
// Este arquivo só declara os shapes + o reviver que clona a AST por run
// (injectPicks muta `scope[].pick`, então cada extract precisa de cópia).
import type { RuleElement, VaultDoc } from '../data/types'

/** Espelho de RuleScope (plugin rule-parser.ts:21-31). */
export type RuleScope =
  | { kind: 'nivel-min'; min: number }
  | { kind: 'tier-min'; min: number }
  | { kind: 'categoria'; value: 'Adepto' | 'Experiente' | 'Mestre' }
  | {
      kind: 'escolha'
      label: string
      choiceKey: string
      pick: string | null
      occurrence?: number
    }

/** Espelho de RuleCondition (plugin rule-parser.ts:33-41). */
export type RuleCondition =
  | { kind: 'none' }
  | { kind: 'attr-compare'; left: string; op: '>' | '>=' | '<' | '<=' | '==' | '!='; right: string }
  | { kind: 'attr-min'; attr: string; min: number }
  | { kind: 'prof-min'; prop: string; min: 'N' | 'A' | 'E' | 'M' | 'P' }
  | { kind: 'bonus-min'; prop: string; min: number }
  | { kind: 'props-contains'; slotProp: string; needle: string }
  | { kind: 'name-contains'; slotProp: string; needle: string }
  | { kind: 'unknown'; raw: string }

export type RuleChannel = 'editable' | 'interactive-only'

/** Espelho de RuleAction (plugin rule-parser.ts:45-63). */
export type RuleAction =
  | { kind: 'definir'; targetRaw: string; valueRaw: string }
  | { kind: 'somar'; targetRaw: string; valueRaw: string }
  | { kind: 'multiplicar'; targetRaw: string; valueRaw: string }
  | { kind: 'sobrescrever'; targetRaw: string; valueRaw: string }
  | { kind: 'complementar'; targetRaw: string; valueRaw: string }
  | { kind: 'escolher'; targetRaw: string; allowed: string[] }
  | { kind: 'restringir'; targetRaw: string; allowed: string[] }
  | { kind: 'prof-definir'; minRank: 'N' | 'A' | 'E' | 'M' | 'P'; targetRaw: string; valueRaw: string }
  | { kind: 'alias'; targetRaw: string; aliasRaw: string }
  | { kind: 'alias-compor'; targetRaw: string; order: number; fragment: string }
  | { kind: 'requisito'; targetRaw: string; valueRaw: string }
  | { kind: 'requisito-contem'; targetRaw: string; valueRaw: string }
  | { kind: 'movimento-lista-complementar'; nome: string }
  | {
      kind: 'movimento-lista-definir'
      nome: string
      field: 'Atributo' | 'Bonus_Item' | 'Bonus_Especial'
      valueRaw: string
    }
  | { kind: 'complementar-sel'; targetRaw: string; options: string[]; label: string | null }
  | {
      kind: 'escolha-prop-map'
      label: string
      propMap: Array<{ label: string; targetRaw: string }>
      valueRaw: string
    }
  | { kind: 'escolha-pericia-especial'; label: string | null; valueRaw: string }
  | { kind: 'interativa'; efeitoLabel: string; targetRaw: string; valueRaw: string; innerCondition?: RuleCondition }

/** Espelho de ChoiceProvenance (plugin rule-parser.ts:69-72). */
export interface ChoiceProvenance {
  choiceKey: string
  expectedPick: string
}

/** Espelho de InheritedConstraint (plugin rule-parser.ts:87-94). */
export interface InheritedConstraint {
  scope: RuleScope[]
  fromChoice?: ChoiceProvenance
  condition?: RuleCondition
}

/** Espelho de ParsedRule (plugin rule-parser.ts:96-129) — campos usados
 *  pela avaliação do canal editable (sharedFrom* de aliado fica fora:
 *  o app só projeta a ficha do próprio herói). */
export interface ParsedRule {
  sourceNote: string
  occurrenceIndex: number
  scope: RuleScope[]
  condition: RuleCondition
  conditionNegated?: boolean
  stableCheck?: boolean
  channel: RuleChannel
  action: RuleAction
  raw: string
  provenance: InheritedConstraint[]
}

/** AST de um doc do vault-data: cada linha do `Elementos_de_Regra` vira
 *  1..2 ParsedRule (`parsed` é o retorno de parseRuleLineMulti do plugin,
 *  rule-parser.ts:661 — 2 entradas quando há `Senao`). Clona por chamada:
 *  o loop de convergência injeta picks mutando `scope[].pick`
 *  (extractor do plugin, rule-elements-extractor.ts:391-404). */
export function parsedRulesOf(doc: VaultDoc): ParsedRule[] {
  const out: ParsedRule[] = []
  for (const el of doc.ruleElements ?? []) {
    for (const rule of parsedListOf(el)) {
      out.push(structuredClone(rule))
    }
  }
  return out
}

function parsedListOf(el: RuleElement): ParsedRule[] {
  const p = el.parsed
  if (Array.isArray(p)) return p as ParsedRule[]
  if (p && typeof p === 'object') return [p as ParsedRule]
  return []
}
