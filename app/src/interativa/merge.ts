// Merge entre 2 ConditionContexts — soma vetorizada. ESPELHO do plugin
// pleitost-autosheet src/runtime/condicoes/merge.ts (mesma semântica:
// Somar soma, Sobrescrever last-wins com `b` vencendo, Definir max-merge,
// Multiplicar produto, typed concat com stacking on-resolve).
import {
  createEmptyConditionContext,
  emptyTypedBuckets,
  BONUS_TYPES,
  CONDITION_NUMBER_KEYS,
  type AtributoId,
  type PericiaId,
  type AttackDamageContext,
  type AttackSourceBucket,
  type ConditionContext,
} from './condition-context'

const ATTRS: readonly AtributoId[] = ['FOR', 'AGI', 'INT', 'PRE']

export function mergeContexts(a: ConditionContext, b: ConditionContext): ConditionContext {
  const out = createEmptyConditionContext()

  for (const k of CONDITION_NUMBER_KEYS) {
    out.numbers[k] = a.numbers[k] + b.numbers[k]
    out.numberBreakdowns[k] = [...a.numberBreakdowns[k], ...b.numberBreakdowns[k]]
  }
  for (const k of CONDITION_NUMBER_KEYS) {
    if (b.numberOverrides[k] !== undefined) {
      out.numberOverrides[k] = b.numberOverrides[k]
    } else if (a.numberOverrides[k] !== undefined) {
      out.numberOverrides[k] = a.numberOverrides[k]
    }
    const bda = a.numberOverrideBreakdowns[k] ?? []
    const bdb = b.numberOverrideBreakdowns[k] ?? []
    if (bda.length || bdb.length) out.numberOverrideBreakdowns[k] = [...bda, ...bdb]
  }
  for (const k of CONDITION_NUMBER_KEYS) {
    const av = a.numberDefines[k]
    const bv = b.numberDefines[k]
    if (av !== undefined && bv !== undefined) out.numberDefines[k] = Math.max(av, bv)
    else if (av !== undefined) out.numberDefines[k] = av
    else if (bv !== undefined) out.numberDefines[k] = bv
    const bda = a.numberDefineBreakdowns[k] ?? []
    const bdb = b.numberDefineBreakdowns[k] ?? []
    if (bda.length || bdb.length) out.numberDefineBreakdowns[k] = [...bda, ...bdb]
  }
  for (const k of CONDITION_NUMBER_KEYS) {
    out.numberMultipliers[k] = a.numberMultipliers[k] * b.numberMultipliers[k]
    out.numberMultiplierBreakdowns[k] = [
      ...a.numberMultiplierBreakdowns[k],
      ...b.numberMultiplierBreakdowns[k],
    ]
  }
  for (const k of CONDITION_NUMBER_KEYS) {
    for (const t of BONUS_TYPES) {
      out.numberTyped[k][t] = [...a.numberTyped[k][t], ...b.numberTyped[k][t]]
    }
  }

  // skills
  out.skills.all = a.skills.all + b.skills.all
  out.skills.breakdowns.all = [...a.skills.breakdowns.all, ...b.skills.breakdowns.all]
  for (const t of BONUS_TYPES) {
    out.skills.typed.all[t] = [...a.skills.typed.all[t], ...b.skills.typed.all[t]]
  }
  for (const attr of ATTRS) {
    out.skills.byAttr[attr] = a.skills.byAttr[attr] + b.skills.byAttr[attr]
    out.skills.breakdowns.byAttr[attr] = [
      ...a.skills.breakdowns.byAttr[attr],
      ...b.skills.breakdowns.byAttr[attr],
    ]
    for (const t of BONUS_TYPES) {
      out.skills.typed.byAttr[attr][t] = [
        ...a.skills.typed.byAttr[attr][t],
        ...b.skills.typed.byAttr[attr][t],
      ]
    }
  }
  const periciaKeys = new Set<PericiaId>([
    ...(Object.keys(a.skills.byName) as PericiaId[]),
    ...(Object.keys(b.skills.byName) as PericiaId[]),
  ])
  for (const p of periciaKeys) {
    out.skills.byName[p] = (a.skills.byName[p] ?? 0) + (b.skills.byName[p] ?? 0)
    const merged = [
      ...(a.skills.breakdowns.byName[p] ?? []),
      ...(b.skills.breakdowns.byName[p] ?? []),
    ]
    if (merged.length > 0) out.skills.breakdowns.byName[p] = merged
  }
  const periciaKeysTyped = new Set<PericiaId>([
    ...(Object.keys(a.skills.typed.byName) as PericiaId[]),
    ...(Object.keys(b.skills.typed.byName) as PericiaId[]),
  ])
  for (const p of periciaKeysTyped) {
    const merged = emptyTypedBuckets()
    for (const t of BONUS_TYPES) {
      merged[t] = [
        ...(a.skills.typed.byName[p]?.[t] ?? []),
        ...(b.skills.typed.byName[p]?.[t] ?? []),
      ]
    }
    if (Object.values(merged).some((arr) => arr.length > 0)) {
      out.skills.typed.byName[p] = merged
    }
  }

  // attacks
  out.attacks.all = a.attacks.all + b.attacks.all
  out.attacks.breakdowns.all = [...a.attacks.breakdowns.all, ...b.attacks.breakdowns.all]
  for (const t of BONUS_TYPES) {
    out.attacks.typed.all[t] = [...a.attacks.typed.all[t], ...b.attacks.typed.all[t]]
  }
  for (const attr of ATTRS) {
    out.attacks.byAttr[attr] = a.attacks.byAttr[attr] + b.attacks.byAttr[attr]
    out.attacks.breakdowns.byAttr[attr] = [
      ...a.attacks.breakdowns.byAttr[attr],
      ...b.attacks.breakdowns.byAttr[attr],
    ]
    for (const t of BONUS_TYPES) {
      out.attacks.typed.byAttr[attr][t] = [
        ...a.attacks.typed.byAttr[attr][t],
        ...b.attacks.typed.byAttr[attr][t],
      ]
    }
  }

  const sourceIds = new Set<string>([
    ...Object.keys(a.attacks.bySource),
    ...Object.keys(b.attacks.bySource),
  ])
  for (const sid of sourceIds) {
    out.attacks.bySource[sid] = mergeSourceBucket(a.attacks.bySource[sid], b.attacks.bySource[sid])
  }

  out.attacks.damage = mergeDamage(a.attacks.damage, b.attacks.damage)

  // iconOverrides — b vence colisão (mesma convenção last-wins).
  out.iconOverrides = new Map([...a.iconOverrides, ...b.iconOverrides])

  return out
}

function mergeSourceBucket(
  a: AttackSourceBucket | undefined,
  b: AttackSourceBucket | undefined,
): AttackSourceBucket {
  return {
    attack: (a?.attack ?? 0) + (b?.attack ?? 0),
    damage: mergeDamage(a?.damage, b?.damage),
    breakdowns: {
      attack: [...(a?.breakdowns.attack ?? []), ...(b?.breakdowns.attack ?? [])],
    },
  }
}

function mergeDamage(
  a: AttackDamageContext | undefined,
  b: AttackDamageContext | undefined,
): AttackDamageContext {
  const mergeTypedKey = (k: 'fixed' | 'perDie' | 'dieStep') => {
    const out = emptyTypedBuckets()
    for (const t of BONUS_TYPES) {
      out[t] = [...(a?.typed?.[k]?.[t] ?? []), ...(b?.typed?.[k]?.[t] ?? [])]
    }
    return out
  }
  return {
    fixed: (a?.fixed ?? 0) + (b?.fixed ?? 0),
    perDie: (a?.perDie ?? 0) + (b?.perDie ?? 0),
    dieStep: (a?.dieStep ?? 0) + (b?.dieStep ?? 0),
    baseDiceCount: (a?.baseDiceCount ?? 0) + (b?.baseDiceCount ?? 0),
    extraDice: [...(a?.extraDice ?? []), ...(b?.extraDice ?? [])],
    ado: [...(a?.ado ?? []), ...(b?.ado ?? [])],
    adoFixo: [...(a?.adoFixo ?? []), ...(b?.adoFixo ?? [])],
    breakdowns: {
      fixed: [...(a?.breakdowns.fixed ?? []), ...(b?.breakdowns.fixed ?? [])],
      perDie: [...(a?.breakdowns.perDie ?? []), ...(b?.breakdowns.perDie ?? [])],
      dieStep: [...(a?.breakdowns.dieStep ?? []), ...(b?.breakdowns.dieStep ?? [])],
      baseDiceCount: [...(a?.breakdowns.baseDiceCount ?? []), ...(b?.breakdowns.baseDiceCount ?? [])],
      extraDice: [...(a?.breakdowns.extraDice ?? []), ...(b?.breakdowns.extraDice ?? [])],
    },
    typed: {
      fixed: mergeTypedKey('fixed'),
      perDie: mergeTypedKey('perDie'),
      dieStep: mergeTypedKey('dieStep'),
    },
  }
}
