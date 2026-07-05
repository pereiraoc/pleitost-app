// Builder: `Condicoes_Ativas` × catálogo de condições parsed → ConditionContext.
// ESPELHO do plugin pleitost-autosheet src/runtime/condicoes/build-condition-context.ts
// (multiplier true→1 / number / {value:N}; clamp em scaleMax; cada rule
// aplicada ×multiplier com source="condicao").
import {
  createEmptyConditionContext,
  addNumber,
  addNumberGroup,
  addSkillAll,
  addSkillByName,
  addSkillByAttr,
  addAttackAll,
  addAttackByAttr,
  addDamageFixed,
  addDamagePerDie,
  type ConditionContext,
} from './condition-context'
import { toMultiplier } from './state'
import type { ParsedConditionEntry } from './parse-condition-rule'

export type ConditionCatalog = Map<string, ParsedConditionEntry>

export function buildCatalog(entries: readonly ParsedConditionEntry[]): ConditionCatalog {
  const map = new Map<string, ParsedConditionEntry>()
  for (const e of entries) map.set(e.id, e)
  return map
}

export function buildConditionContext(
  condicoesAtivas: Record<string, unknown>,
  catalog: ConditionCatalog,
): ConditionContext {
  const ctx = createEmptyConditionContext()

  for (const [id, raw] of Object.entries(condicoesAtivas ?? {})) {
    const multiplier = toMultiplier(raw)
    if (multiplier <= 0) continue
    const entry = catalog.get(id)
    if (!entry) continue

    const m = Math.min(multiplier, Math.max(1, entry.scaleMax))
    applyEntry(ctx, entry, id, m)
  }

  return ctx
}

function applyEntry(
  ctx: ConditionContext,
  entry: ParsedConditionEntry,
  label: string,
  multiplier: number,
): void {
  const src = 'condicao' as const
  for (const rule of entry.rules) {
    switch (rule.kind) {
      case 'number':
        addNumber(ctx, rule.key, label, rule.value * multiplier, src)
        break
      case 'number_group':
        addNumberGroup(ctx, rule.group, label, rule.value * multiplier, src)
        break
      case 'skill_all':
        addSkillAll(ctx, label, rule.value * multiplier, src)
        break
      case 'skill_name':
        addSkillByName(ctx, rule.pericia, label, rule.value * multiplier, src)
        break
      case 'skill_attr':
        addSkillByAttr(ctx, rule.attr, label, rule.value * multiplier, src)
        break
      case 'attack_all':
        addAttackAll(ctx, label, rule.value * multiplier, src)
        break
      case 'attack_attr':
        addAttackByAttr(ctx, rule.attr, label, rule.value * multiplier, src)
        break
      case 'damage_fixed':
        addDamageFixed(ctx, label, rule.value * multiplier, undefined, src)
        break
      case 'damage_per_die':
        addDamagePerDie(ctx, label, rule.value * multiplier, undefined, src)
        break
      // `derive` e `unknown` = no-op no contexto numérico (paridade plugin).
    }
  }
}
