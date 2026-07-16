// Parser das `Elementos_de_Regra` do FM das notas Sistema/Regras/Condições/*.
// ESPELHO do plugin pleitost-autosheet src/runtime/condicoes/parse-condition-rule.ts
// (mesma gramática: "Escalavel N" / "Somar Condicao.<target> ±N" /
// "Derivar Condicao X"; targets → buckets idênticos; strings desconhecidas
// preservadas como `unknown`; NUNCA throw).
import { slugify } from '../components/ficha/registry'
import type { AtributoId, ConditionNumberGroup, ConditionNumberKey, PericiaId } from './condition-context'

export type ParsedConditionRule =
  | { kind: 'number'; key: ConditionNumberKey; value: number }
  | { kind: 'number_group'; group: ConditionNumberGroup; value: number }
  | { kind: 'skill_all'; value: number }
  | { kind: 'skill_name'; pericia: PericiaId; value: number }
  | { kind: 'skill_attr'; attr: AtributoId; value: number }
  | { kind: 'attack_all'; value: number }
  | { kind: 'attack_attr'; attr: AtributoId; value: number }
  | { kind: 'damage_fixed'; value: number }
  | { kind: 'damage_per_die'; value: number }
  | { kind: 'derive'; condicaoId: string }
  | { kind: 'unknown'; raw: string }

export interface ParsedConditionEntry {
  id: string
  /** Quando >0, condição escala 1..scaleMax (ex Lento 3). */
  scaleMax: number
  rules: ParsedConditionRule[]
  /** `Derivar Condicao X` — DEFERIDO (paridade: plugin também não consome). */
  derived: string[]
}

/** Targets number diretos — lowercase pra matching (plugin :59-75). */
const NUMBER_TARGETS: Record<string, ConditionNumberKey> = {
  ataque: 'ataque',
  manobra: 'manobra',
  defesa: 'defesa',
  vigor: 'vigor',
  impeto: 'impeto',
  reflexo: 'reflexo',
  percepcao: 'percepcao',
  intuicao: 'intuicao',
  movimento: 'movimento',
  potenciamagica: 'potenciaMagica',
  potencia_magica: 'potenciaMagica',
  magiaataque: 'magiaAtaque',
  magia_ataque: 'magiaAtaque',
  magiacd: 'magiaCD',
  magia_cd: 'magiaCD',
}

const NUMBER_GROUPS: Record<string, ConditionNumberGroup> = {
  resistencias: 'resistencias',
  resistências: 'resistencias',
  sentidos: 'sentidos',
}

const VALID_ATTRS: readonly AtributoId[] = ['FOR', 'AGI', 'INT', 'PRE']

export function parseConditionRules(id: string, rawRules: readonly unknown[]): ParsedConditionEntry {
  let scaleMax = 1
  const rules: ParsedConditionRule[] = []
  const derived: string[] = []

  for (const raw of rawRules) {
    const line = String(raw ?? '').trim()
    if (!line) continue

    const escMatch = /^Escal[aá]vel\s+(\d+)$/i.exec(line)
    if (escMatch) {
      scaleMax = Math.max(scaleMax, parseInt(escMatch[1]!, 10) || 1)
      continue
    }

    const derMatch = /^Derivar\s+Condi(?:c|ç)ao\s+(.+)$/i.exec(line)
    if (derMatch) {
      derived.push(derMatch[1]!.trim())
      continue
    }

    const somMatch = /^Somar\s+Condi(?:c|ç)ao\.([^\s]+)\s+([+-]?\d+)$/i.exec(line)
    if (somMatch) {
      const targetRaw = somMatch[1]!
      const value = parseInt(somMatch[2]!, 10)
      if (Number.isFinite(value)) {
        const parsed = parseTarget(targetRaw, value)
        if (parsed) {
          rules.push(parsed)
          continue
        }
      }
    }

    rules.push({ kind: 'unknown', raw: line })
  }

  return { id, scaleMax, rules, derived }
}

function parseTarget(targetRaw: string, value: number): ParsedConditionRule | null {
  const target = targetRaw.trim()
  const lower = target.toLowerCase()

  if (NUMBER_TARGETS[lower]) {
    return { kind: 'number', key: NUMBER_TARGETS[lower], value }
  }
  if (NUMBER_GROUPS[lower]) {
    return { kind: 'number_group', group: NUMBER_GROUPS[lower], value }
  }
  if (lower === 'pericias' || lower === 'perícias') {
    return { kind: 'skill_all', value }
  }
  if (lower === 'ataques') {
    return { kind: 'attack_all', value }
  }
  const skillAttrMatch = /^Per[ií]cias?DeAtributo\(([A-Za-z]+)\)$/i.exec(target)
  if (skillAttrMatch) {
    const attr = skillAttrMatch[1]!.toUpperCase() as AtributoId
    if (VALID_ATTRS.includes(attr)) {
      return { kind: 'skill_attr', attr, value }
    }
  }
  const attackAttrMatch = /^AtaquesDeAtributo\(([A-Za-z]+)\)$/i.exec(target)
  if (attackAttrMatch) {
    const attr = attackAttrMatch[1]!.toUpperCase() as AtributoId
    if (VALID_ATTRS.includes(attr)) {
      return { kind: 'attack_attr', attr, value }
    }
  }
  const skillNameMatch = /^Per[ií]cia\(([^)]+)\)$/i.exec(target)
  if (skillNameMatch) {
    const pericia = slugify(skillNameMatch[1]!.trim())
    return { kind: 'skill_name', pericia, value }
  }
  if (lower === 'danoarmafixo' || lower === 'dano_arma_fixo') {
    return { kind: 'damage_fixed', value }
  }
  if (lower === 'danoarmapordado' || lower === 'dano_arma_por_dado') {
    return { kind: 'damage_per_die', value }
  }
  return null
}
