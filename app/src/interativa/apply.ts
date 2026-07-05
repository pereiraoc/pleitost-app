// Aplicação do ConditionContext num valor exibido: coleta as entries
// pertinentes do target e devolve delta + tone. ESPELHO do plugin
// pleitost-autosheet src/runtime/condicoes/apply-to-breakdown.ts
// (collectEntries/sumEntries, label das typed com prefixo "Tipo:",
// stripSharedFrom) + src/runtime/condicoes/visual.ts (valueClass/rollClass/
// suffix — aqui como tone semântico; as CORES canônicas do plugin ficam em
// COND_COLORS: styles.css .cond-bonus #22c55e / .cond-penalty #ef4444).
import {
  mergeTypedBuckets,
  winningTypedEntries,
  displayBonusType,
  type AtributoId,
  type ConditionContext,
  type ConditionEntry,
  type ConditionNumberKey,
  type PericiaId,
} from './condition-context'
import { parseStateKey } from './state'

export type ConditionTarget =
  | { kind: 'number'; key: ConditionNumberKey }
  | { kind: 'skill'; pericia: PericiaId; attr: AtributoId }
  | { kind: 'attack'; attr: AtributoId; sourceId?: string }

export interface AppliedDelta {
  /** Só os deltas das condições/efeitos (alimenta cor + tooltip). */
  entries: ConditionEntry[]
  /** Soma signed das entries. */
  delta: number
  /** True quando há QUALQUER entry negativa. */
  hasPenalty: boolean
}

/** Cores canônicas do plugin (styles.css:7802-7816). */
export const COND_COLORS = {
  bonus: '#22c55e',
  penalty: '#ef4444',
} as const

export function sumEntries(entries: readonly ConditionEntry[]): number {
  let sum = 0
  for (const e of entries) sum += e.value
  return sum
}

/** Strip do sufixo `::sharedFrom` (plugin apply-to-breakdown.ts:53-55). */
export function stripSharedFrom(label: string): string {
  return parseStateKey(label).label
}

export function applyTarget(ctx: ConditionContext, target: ConditionTarget): AppliedDelta {
  const entries = collectEntries(ctx, target)
  return {
    entries,
    delta: sumEntries(entries),
    hasPenalty: entries.some((e) => e.value < 0),
  }
}

/** Coleta as entries pertinentes (plugin collectEntries :128-199 — untyped
 *  acumulativo + typed vencedoras com label "Tipo: fonte"). */
export function collectEntries(ctx: ConditionContext, target: ConditionTarget): ConditionEntry[] {
  const out: ConditionEntry[] = []

  if (target.kind === 'number') {
    for (const e of ctx.numberBreakdowns[target.key]) out.push(e)
    for (const w of winningTypedEntries(ctx.numberTyped[target.key])) {
      out.push({
        label: `${displayBonusType(w.type)}: ${w.entry.label}`,
        value: w.entry.value,
        source: w.entry.source,
        tipoBonus: w.type,
      })
    }
    return out
  }

  if (target.kind === 'skill') {
    if (ctx.skills.all) {
      for (const e of ctx.skills.breakdowns.all) out.push(e)
    }
    if (ctx.skills.byAttr[target.attr]) {
      for (const e of ctx.skills.breakdowns.byAttr[target.attr]) out.push(e)
    }
    const byName = ctx.skills.breakdowns.byName[target.pericia]
    if (byName) for (const e of byName) out.push(e)
    const skillTyped = mergeTypedBuckets(
      ctx.skills.typed.all,
      ctx.skills.typed.byAttr[target.attr],
      ctx.skills.typed.byName[target.pericia],
    )
    for (const w of winningTypedEntries(skillTyped)) {
      out.push({
        label: `${displayBonusType(w.type)}: ${w.entry.label}`,
        value: w.entry.value,
        source: w.entry.source,
        tipoBonus: w.type,
      })
    }
    return out
  }

  if (target.kind === 'attack') {
    for (const e of ctx.numberBreakdowns.ataque) out.push(e)
    for (const e of ctx.attacks.breakdowns.all) out.push(e)
    for (const e of ctx.attacks.breakdowns.byAttr[target.attr]) out.push(e)
    if (target.sourceId) {
      const bucket = ctx.attacks.bySource[target.sourceId]
      if (bucket) {
        for (const e of bucket.breakdowns.attack) out.push(e)
      }
    }
    const attackTyped = mergeTypedBuckets(
      ctx.numberTyped.ataque,
      ctx.attacks.typed.all,
      ctx.attacks.typed.byAttr[target.attr],
    )
    for (const w of winningTypedEntries(attackTyped)) {
      out.push({
        label: `${displayBonusType(w.type)}: ${w.entry.label}`,
        value: w.entry.value,
        source: w.entry.source,
        tipoBonus: w.type,
      })
    }
    return out
  }

  return out
}

// ── Helpers visuais (plugin visual.ts) — tone em vez de CSS class ──

export type CondTone = 'bonus' | 'penalty' | 'neutral'

/** Verde se net+, vermelho se net− (plugin valueClass). */
export function valueTone(entries: readonly ConditionEntry[]): CondTone {
  const total = sumEntries(entries)
  if (total > 0) return 'bonus'
  if (total < 0) return 'penalty'
  return 'neutral'
}

/** Cor CSS derivada do tone (cores canônicas do plugin). */
export function toneColor(tone: CondTone): string | undefined {
  if (tone === 'bonus') return COND_COLORS.bonus
  if (tone === 'penalty') return COND_COLORS.penalty
  return undefined
}

/** Sufixo "(+1)" / "(−2)" pós-valor (plugin suffix). */
export function deltaSuffix(entries: readonly ConditionEntry[]): string {
  const total = sumEntries(entries)
  if (!total) return ''
  return total > 0 ? `(+${total})` : `(${total})`
}

/** Título de tooltip: uma linha por entry ("Fonte +N"). */
export function entriesTitle(entries: readonly ConditionEntry[]): string {
  return entries
    .map((e) => `${stripSharedFrom(e.label)} ${e.value > 0 ? '+' : ''}${e.value}`)
    .join('\n')
}
