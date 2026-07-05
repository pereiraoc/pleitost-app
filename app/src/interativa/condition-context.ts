// ConditionContext — soma vetorizada dos modificadores aplicados por TODAS
// as condições e efeitos interativos ativos. ESPELHO read-only do plugin
// pleitost-autosheet: src/runtime/condicoes/condition-context.ts (tipos,
// builders, add* helpers, resolveNumber/resolveTypedTotal/winningTypedEntries
// — mesmas assinaturas e semântica; só os imports de tipos do plugin viram
// tipos locais).
//
// Princípios (idem plugin):
//  - Tipos PUROS (sem DOM/IO/React).
//  - Mesmo shape pra Condições e Efeitos → merge trivial.
//  - Cada bucket numérico tem `breakdowns` paralelo com as entries
//    individuais ({label, value}) — alimentam tooltip/inspeção.

export type AtributoId = 'FOR' | 'AGI' | 'INT' | 'PRE'
export type PericiaId = string
export type Proficiencia = 'N' | 'A' | 'E' | 'M'

/** Tipos de bônus pra stacking não-aditivo — plugin extract/interativa/types.ts:210.
 *  Condicao/Circunstancia/Especializacao/Item: max(pos)+min(neg) por tipo.
 *  Unico: stacka entre si (soma normal). */
export type BonusType = 'Condicao' | 'Circunstancia' | 'Especializacao' | 'Item' | 'Unico'
export const BONUS_TYPES: readonly BonusType[] = ['Condicao', 'Circunstancia', 'Especializacao', 'Item', 'Unico']

/** Forma exibida (com acento) — plugin extract/interativa/catalogs.ts displayBonusType. */
const BONUS_TYPE_DISPLAY: Record<BonusType, string> = {
  Condicao: 'Condição',
  Circunstancia: 'Circunstância',
  Especializacao: 'Especialização',
  Item: 'Item',
  Unico: 'Único',
}
export function displayBonusType(t: BonusType): string {
  return BONUS_TYPE_DISPLAY[t] ?? t
}

/** Normaliza string do FM (acento-insensitive) → BonusType canônico. */
export function parseBonusType(raw: unknown): BonusType | undefined {
  if (typeof raw !== 'string' || !raw) return undefined
  const key = raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
  const map: Record<string, BonusType> = {
    condicao: 'Condicao',
    circunstancia: 'Circunstancia',
    especializacao: 'Especializacao',
    item: 'Item',
    unico: 'Unico',
  }
  return map[key]
}

export type OrigemKind = 'Habilidade' | 'Magia' | 'Técnica' | 'Propriedade' | 'Outra'

// ──────────────────────────────────────────────────────────────────────────
// Entry — UMA contribuição (condição/efeito) a algum bucket
// (plugin condition-context.ts:25-57)
// ──────────────────────────────────────────────────────────────────────────

export interface ConditionEntry {
  label: string
  /** Valor signed (positivo = bônus, negativo = penalidade). */
  value: number
  source?: 'condicao' | 'efeito' | 'forma'
  tipoBonus?: BonusType
  /** Origem do efeito — regra de não-acúmulo do AdO entre Técnicas. */
  origem?: OrigemKind
  /** Efeito `tipo: Passivo` — contribuição sempre-ativa (AdO neutro). */
  passivo?: boolean
  /** Entry de baseDiceCount que É dado de dano da arma (Sucesso Decisivo). */
  dadoDeArma?: boolean
  /** Entry de dano vinda de efeito `tipo: AtaqueLocal` — NÃO entra no AdO. */
  ataqueLocal?: boolean
}

// ──────────────────────────────────────────────────────────────────────────
// Buckets (plugin condition-context.ts:64-218)
// ──────────────────────────────────────────────────────────────────────────

export type ConditionNumberKey =
  | 'ataque'
  | 'manobra'
  | 'defesa'
  | 'vigor'
  | 'impeto'
  | 'reflexo'
  | 'percepcao'
  | 'intuicao'
  | 'movimento'
  | 'potenciaMagica'
  | 'magiaAtaque'
  | 'magiaCD'

export type ConditionNumberGroup = 'resistencias' | 'sentidos'

export const CONDITION_NUMBER_GROUPS: Record<ConditionNumberGroup, readonly ConditionNumberKey[]> = {
  resistencias: ['defesa', 'vigor', 'impeto', 'reflexo'],
  sentidos: ['percepcao', 'intuicao'],
}

export interface ExtraDie {
  dice: string
  label: string
}

export interface AttackDamageContext {
  fixed: number
  perDie: number
  dieStep: number
  baseDiceCount: number
  extraDice: ExtraDie[]
  /** Canal PRÓPRIO do AdO (`Somar DadoOportunidade N`). */
  ado: ConditionEntry[]
  /** Canal PRÓPRIO do AdO fixo (`Somar OportunidadeFixo N`) — Encantar Arma. */
  adoFixo: ConditionEntry[]
  breakdowns: {
    fixed: ConditionEntry[]
    perDie: ConditionEntry[]
    dieStep: ConditionEntry[]
    baseDiceCount: ConditionEntry[]
    extraDice: ConditionEntry[]
  }
  typed: {
    fixed: Record<BonusType, ConditionEntry[]>
    perDie: Record<BonusType, ConditionEntry[]>
    dieStep: Record<BonusType, ConditionEntry[]>
  }
}

export interface AttackSourceBucket {
  attack: number
  damage: AttackDamageContext
  breakdowns: {
    attack: ConditionEntry[]
  }
}

export interface ConditionContext {
  numbers: Record<ConditionNumberKey, number>
  numberBreakdowns: Record<ConditionNumberKey, ConditionEntry[]>
  numberTyped: Record<ConditionNumberKey, Record<BonusType, ConditionEntry[]>>
  numberOverrides: Partial<Record<ConditionNumberKey, number>>
  numberOverrideBreakdowns: Partial<Record<ConditionNumberKey, ConditionEntry[]>>
  numberDefines: Partial<Record<ConditionNumberKey, number>>
  numberDefineBreakdowns: Partial<Record<ConditionNumberKey, ConditionEntry[]>>
  numberMultipliers: Record<ConditionNumberKey, number>
  numberMultiplierBreakdowns: Record<ConditionNumberKey, ConditionEntry[]>
  skills: {
    all: number
    byName: Partial<Record<PericiaId, number>>
    byAttr: Record<AtributoId, number>
    breakdowns: {
      all: ConditionEntry[]
      byName: Partial<Record<PericiaId, ConditionEntry[]>>
      byAttr: Record<AtributoId, ConditionEntry[]>
    }
    typed: {
      all: Record<BonusType, ConditionEntry[]>
      byName: Partial<Record<PericiaId, Record<BonusType, ConditionEntry[]>>>
      byAttr: Record<AtributoId, Record<BonusType, ConditionEntry[]>>
    }
  }
  attacks: {
    all: number
    byAttr: Record<AtributoId, number>
    bySource: Record<string, AttackSourceBucket>
    damage: AttackDamageContext
    breakdowns: {
      all: ConditionEntry[]
      byAttr: Record<AtributoId, ConditionEntry[]>
    }
    typed: {
      all: Record<BonusType, ConditionEntry[]>
      byAttr: Record<AtributoId, Record<BonusType, ConditionEntry[]>>
    }
  }
  /** LABEL → emoji override (FM `visual.iconeLigado`). */
  iconOverrides: Map<string, string>
}

// ──────────────────────────────────────────────────────────────────────────
// Builders (plugin condition-context.ts:224-362)
// ──────────────────────────────────────────────────────────────────────────

const ATTRS: readonly AtributoId[] = ['FOR', 'AGI', 'INT', 'PRE']

export function emptyTypedBuckets(): Record<BonusType, ConditionEntry[]> {
  const out = {} as Record<BonusType, ConditionEntry[]>
  for (const t of BONUS_TYPES) out[t] = []
  return out
}

/** Junta N buckets typed em UM por tipo — crítico pro stacking entre
 *  buckets que aplicam no MESMO target (plugin :241-253). */
export function mergeTypedBuckets(
  ...buckets: Array<Record<BonusType, ConditionEntry[]> | undefined>
): Record<BonusType, ConditionEntry[]> {
  const out = emptyTypedBuckets()
  for (const b of buckets) {
    if (!b) continue
    for (const t of BONUS_TYPES) {
      const entries = b[t]
      if (entries && entries.length) out[t].push(...entries)
    }
  }
  return out
}

export function createEmptyDamageContext(): AttackDamageContext {
  return {
    fixed: 0,
    perDie: 0,
    dieStep: 0,
    baseDiceCount: 0,
    extraDice: [],
    ado: [],
    adoFixo: [],
    breakdowns: { fixed: [], perDie: [], dieStep: [], baseDiceCount: [], extraDice: [] },
    typed: {
      fixed: emptyTypedBuckets(),
      perDie: emptyTypedBuckets(),
      dieStep: emptyTypedBuckets(),
    },
  }
}

const NUMBER_KEYS: readonly ConditionNumberKey[] = [
  'ataque', 'manobra',
  'defesa', 'vigor', 'impeto', 'reflexo',
  'percepcao', 'intuicao',
  'movimento',
  'potenciaMagica', 'magiaAtaque', 'magiaCD',
]
export { NUMBER_KEYS as CONDITION_NUMBER_KEYS }

export function createEmptyConditionContext(): ConditionContext {
  const numbers = {} as Record<ConditionNumberKey, number>
  const numberBreakdowns = {} as Record<ConditionNumberKey, ConditionEntry[]>
  const numberTyped = {} as Record<ConditionNumberKey, Record<BonusType, ConditionEntry[]>>
  const numberMultipliers = {} as Record<ConditionNumberKey, number>
  const numberMultiplierBreakdowns = {} as Record<ConditionNumberKey, ConditionEntry[]>
  for (const k of NUMBER_KEYS) {
    numbers[k] = 0
    numberBreakdowns[k] = []
    numberTyped[k] = emptyTypedBuckets()
    numberMultipliers[k] = 1
    numberMultiplierBreakdowns[k] = []
  }
  return {
    numbers,
    numberBreakdowns,
    numberTyped,
    numberOverrides: {},
    numberOverrideBreakdowns: {},
    numberDefines: {},
    numberDefineBreakdowns: {},
    numberMultipliers,
    numberMultiplierBreakdowns,
    skills: {
      all: 0,
      byName: {},
      byAttr: { FOR: 0, AGI: 0, INT: 0, PRE: 0 },
      breakdowns: {
        all: [],
        byName: {},
        byAttr: { FOR: [], AGI: [], INT: [], PRE: [] },
      },
      typed: {
        all: emptyTypedBuckets(),
        byName: {},
        byAttr: {
          FOR: emptyTypedBuckets(),
          AGI: emptyTypedBuckets(),
          INT: emptyTypedBuckets(),
          PRE: emptyTypedBuckets(),
        },
      },
    },
    attacks: {
      all: 0,
      byAttr: { FOR: 0, AGI: 0, INT: 0, PRE: 0 },
      bySource: {},
      damage: createEmptyDamageContext(),
      breakdowns: {
        all: [],
        byAttr: { FOR: [], AGI: [], INT: [], PRE: [] },
      },
      typed: {
        all: emptyTypedBuckets(),
        byAttr: {
          FOR: emptyTypedBuckets(),
          AGI: emptyTypedBuckets(),
          INT: emptyTypedBuckets(),
          PRE: emptyTypedBuckets(),
        },
      },
    },
    iconOverrides: new Map(),
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Add helpers (plugin condition-context.ts:371-852) — mutam in-place
// ──────────────────────────────────────────────────────────────────────────

export function addNumber(
  ctx: ConditionContext,
  key: ConditionNumberKey,
  label: string,
  value: number,
  source?: ConditionEntry['source'],
): void {
  if (!value) return
  ctx.numbers[key] += value
  ctx.numberBreakdowns[key].push({ label, value, source })
}

export function addNumberTyped(
  ctx: ConditionContext,
  key: ConditionNumberKey,
  type: BonusType,
  label: string,
  value: number,
  source?: ConditionEntry['source'],
): void {
  if (!value) return
  ctx.numberTyped[key][type].push({ label, value, source })
}

/** `Sobrescrever` — last-wins. */
export function addNumberOverride(
  ctx: ConditionContext,
  key: ConditionNumberKey,
  label: string,
  value: number,
  source?: ConditionEntry['source'],
): void {
  ctx.numberOverrides[key] = value
  if (!ctx.numberOverrideBreakdowns[key]) ctx.numberOverrideBreakdowns[key] = []
  ctx.numberOverrideBreakdowns[key]!.push({ label, value, source })
}

/** `Definir` — max-merge. */
export function addNumberDefine(
  ctx: ConditionContext,
  key: ConditionNumberKey,
  label: string,
  value: number,
  source?: ConditionEntry['source'],
): void {
  const cur = ctx.numberDefines[key]
  if (cur === undefined || value > cur) ctx.numberDefines[key] = value
  if (!ctx.numberDefineBreakdowns[key]) ctx.numberDefineBreakdowns[key] = []
  ctx.numberDefineBreakdowns[key]!.push({ label, value, source })
}

/** `Multiplicar` — produto cumulativo. */
export function addNumberMultiplier(
  ctx: ConditionContext,
  key: ConditionNumberKey,
  label: string,
  factor: number,
  source?: ConditionEntry['source'],
): void {
  if (factor === 1) return
  ctx.numberMultipliers[key] *= factor
  ctx.numberMultiplierBreakdowns[key].push({ label, value: factor, source })
}

/** Ordem dos verbos: base → Sobrescrever → Definir(max) → Multiplicar →
 *  Somar untyped → Somar typed (plugin :456-468). */
export function resolveNumber(base: number, ctx: ConditionContext, key: ConditionNumberKey): number {
  let value = ctx.numberOverrides[key] ?? base
  const define = ctx.numberDefines[key]
  if (define !== undefined && define > value) value = define
  value *= ctx.numberMultipliers[key]
  value += ctx.numbers[key]
  value += resolveTypedTotal(ctx.numberTyped[key])
  return value
}

export interface TypedWinningEntry {
  type: BonusType
  kind: 'bonus' | 'penalty'
  entry: ConditionEntry
}

/** Entries que CONTRIBUÍRAM pro resultado (vencedoras por tipo; todas pra
 *  Unico) — plugin :480-503. */
export function winningTypedEntries(buckets: Record<BonusType, ConditionEntry[]>): TypedWinningEntry[] {
  const out: TypedWinningEntry[] = []
  for (const type of Object.keys(buckets) as BonusType[]) {
    const entries = buckets[type]
    if (type === 'Unico') {
      for (const e of entries) {
        out.push({ type, kind: e.value >= 0 ? 'bonus' : 'penalty', entry: e })
      }
      continue
    }
    let maxPosEntry: ConditionEntry | null = null
    let minNegEntry: ConditionEntry | null = null
    for (const e of entries) {
      if (e.value > 0 && (!maxPosEntry || e.value > maxPosEntry.value)) maxPosEntry = e
      if (e.value < 0 && (!minNegEntry || e.value < minNegEntry.value)) minNegEntry = e
    }
    if (maxPosEntry) out.push({ type, kind: 'bonus', entry: maxPosEntry })
    if (minNegEntry) out.push({ type, kind: 'penalty', entry: minNegEntry })
  }
  return out
}

export function addNumberGroup(
  ctx: ConditionContext,
  group: ConditionNumberGroup,
  label: string,
  value: number,
  source?: ConditionEntry['source'],
): void {
  if (!value) return
  for (const key of CONDITION_NUMBER_GROUPS[group]) {
    addNumber(ctx, key, label, value, source)
  }
}

export function addNumberGroupTyped(
  ctx: ConditionContext,
  group: ConditionNumberGroup,
  type: BonusType,
  label: string,
  value: number,
  source?: ConditionEntry['source'],
): void {
  if (!value) return
  for (const key of CONDITION_NUMBER_GROUPS[group]) {
    addNumberTyped(ctx, key, type, label, value, source)
  }
}

export function addSkillAll(
  ctx: ConditionContext,
  label: string,
  value: number,
  source?: ConditionEntry['source'],
): void {
  if (!value) return
  ctx.skills.all += value
  ctx.skills.breakdowns.all.push({ label, value, source })
}

export function addSkillByName(
  ctx: ConditionContext,
  pericia: PericiaId,
  label: string,
  value: number,
  source?: ConditionEntry['source'],
): void {
  if (!value) return
  ctx.skills.byName[pericia] = (ctx.skills.byName[pericia] ?? 0) + value
  if (!ctx.skills.breakdowns.byName[pericia]) ctx.skills.breakdowns.byName[pericia] = []
  ctx.skills.breakdowns.byName[pericia]!.push({ label, value, source })
}

export function addSkillByAttr(
  ctx: ConditionContext,
  attr: AtributoId,
  label: string,
  value: number,
  source?: ConditionEntry['source'],
): void {
  if (!value || !ATTRS.includes(attr)) return
  ctx.skills.byAttr[attr] += value
  ctx.skills.breakdowns.byAttr[attr].push({ label, value, source })
}

export function addAttackAll(
  ctx: ConditionContext,
  label: string,
  value: number,
  source?: ConditionEntry['source'],
): void {
  if (!value) return
  ctx.attacks.all += value
  ctx.attacks.breakdowns.all.push({ label, value, source })
}

export function addAttackByAttr(
  ctx: ConditionContext,
  attr: AtributoId,
  label: string,
  value: number,
  source?: ConditionEntry['source'],
): void {
  if (!value || !ATTRS.includes(attr)) return
  ctx.attacks.byAttr[attr] += value
  ctx.attacks.breakdowns.byAttr[attr].push({ label, value, source })
}

function ensureSourceBucket(ctx: ConditionContext, sourceId: string): AttackSourceBucket {
  if (!ctx.attacks.bySource[sourceId]) {
    ctx.attacks.bySource[sourceId] = {
      attack: 0,
      damage: createEmptyDamageContext(),
      breakdowns: { attack: [] },
    }
  }
  return ctx.attacks.bySource[sourceId]
}

export function addAttackBySource(
  ctx: ConditionContext,
  sourceId: string,
  label: string,
  value: number,
  source?: ConditionEntry['source'],
): void {
  if (!value || !sourceId) return
  const bucket = ensureSourceBucket(ctx, sourceId)
  bucket.attack += value
  bucket.breakdowns.attack.push({ label, value, source })
}

export function addDamageFixed(
  ctx: ConditionContext,
  label: string,
  value: number,
  sourceId?: string,
  source?: ConditionEntry['source'],
  ataqueLocal?: boolean,
): void {
  if (!value) return
  const target = sourceId ? ensureSourceBucket(ctx, sourceId).damage : ctx.attacks.damage
  target.fixed += value
  target.breakdowns.fixed.push({ label, value, source, ataqueLocal })
}

export function addDamagePerDie(
  ctx: ConditionContext,
  label: string,
  value: number,
  sourceId?: string,
  source?: ConditionEntry['source'],
  ataqueLocal?: boolean,
): void {
  if (!value) return
  const target = sourceId ? ensureSourceBucket(ctx, sourceId).damage : ctx.attacks.damage
  target.perDie += value
  target.breakdowns.perDie.push({ label, value, source, ataqueLocal })
}

export function addDieStep(
  ctx: ConditionContext,
  label: string,
  value: number,
  sourceId?: string,
  source?: ConditionEntry['source'],
  ataqueLocal?: boolean,
): void {
  if (!value) return
  const target = sourceId ? ensureSourceBucket(ctx, sourceId).damage : ctx.attacks.damage
  target.dieStep += value
  target.breakdowns.dieStep.push({ label, value, source, ataqueLocal })
}

export function addBaseDiceCount(
  ctx: ConditionContext,
  label: string,
  value: number,
  sourceId?: string,
  source?: ConditionEntry['source'],
  dadoDeArma?: boolean,
): void {
  if (!value) return
  const target = sourceId ? ensureSourceBucket(ctx, sourceId).damage : ctx.attacks.damage
  target.baseDiceCount += value
  target.breakdowns.baseDiceCount.push({ label, value, source, dadoDeArma })
}

export function addExtraDice(
  ctx: ConditionContext,
  label: string,
  dice: string,
  sourceId?: string,
  source?: ConditionEntry['source'],
): void {
  if (!dice) return
  const target = sourceId ? ensureSourceBucket(ctx, sourceId).damage : ctx.attacks.damage
  target.extraDice.push({ dice, label })
  target.breakdowns.extraDice.push({ label, value: 0, source })
}

export function addAdoDice(
  ctx: ConditionContext,
  label: string,
  value: number,
  origem?: ConditionEntry['origem'],
  sourceId?: string,
  source?: ConditionEntry['source'],
  passivo?: boolean,
): void {
  if (!value) return
  const target = sourceId ? ensureSourceBucket(ctx, sourceId).damage : ctx.attacks.damage
  target.ado.push({ label, value, origem, source, passivo })
}

export function addAdoFixo(
  ctx: ConditionContext,
  label: string,
  value: number,
  sourceId?: string,
  source?: ConditionEntry['source'],
): void {
  if (!value) return
  const target = sourceId ? ensureSourceBucket(ctx, sourceId).damage : ctx.attacks.damage
  target.adoFixo.push({ label, value, source })
}

// ── Add* TYPED (plugin :751-852) ──

export function addSkillAllTyped(
  ctx: ConditionContext,
  type: BonusType,
  label: string,
  value: number,
  source?: ConditionEntry['source'],
): void {
  if (!value) return
  ctx.skills.typed.all[type].push({ label, value, source })
}

export function addSkillByNameTyped(
  ctx: ConditionContext,
  pericia: PericiaId,
  type: BonusType,
  label: string,
  value: number,
  source?: ConditionEntry['source'],
): void {
  if (!value) return
  if (!ctx.skills.typed.byName[pericia]) {
    ctx.skills.typed.byName[pericia] = emptyTypedBuckets()
  }
  ctx.skills.typed.byName[pericia]![type].push({ label, value, source })
}

export function addSkillByAttrTyped(
  ctx: ConditionContext,
  attr: AtributoId,
  type: BonusType,
  label: string,
  value: number,
  source?: ConditionEntry['source'],
): void {
  if (!value || !ATTRS.includes(attr)) return
  ctx.skills.typed.byAttr[attr][type].push({ label, value, source })
}

export function addAttackAllTyped(
  ctx: ConditionContext,
  type: BonusType,
  label: string,
  value: number,
  source?: ConditionEntry['source'],
): void {
  if (!value) return
  ctx.attacks.typed.all[type].push({ label, value, source })
}

export function addAttackByAttrTyped(
  ctx: ConditionContext,
  attr: AtributoId,
  type: BonusType,
  label: string,
  value: number,
  source?: ConditionEntry['source'],
): void {
  if (!value || !ATTRS.includes(attr)) return
  ctx.attacks.typed.byAttr[attr][type].push({ label, value, source })
}

export function addDamageFixedTyped(
  ctx: ConditionContext,
  type: BonusType,
  label: string,
  value: number,
  sourceId?: string,
  source?: ConditionEntry['source'],
  ataqueLocal?: boolean,
): void {
  if (!value) return
  const target = sourceId ? ensureSourceBucket(ctx, sourceId).damage : ctx.attacks.damage
  target.typed.fixed[type].push({ label, value, source, ataqueLocal })
}

export function addDamagePerDieTyped(
  ctx: ConditionContext,
  type: BonusType,
  label: string,
  value: number,
  sourceId?: string,
  source?: ConditionEntry['source'],
  ataqueLocal?: boolean,
): void {
  if (!value) return
  const target = sourceId ? ensureSourceBucket(ctx, sourceId).damage : ctx.attacks.damage
  target.typed.perDie[type].push({ label, value, source, ataqueLocal })
}

export function addDieStepTyped(
  ctx: ConditionContext,
  type: BonusType,
  label: string,
  value: number,
  sourceId?: string,
  source?: ConditionEntry['source'],
  ataqueLocal?: boolean,
): void {
  if (!value) return
  const target = sourceId ? ensureSourceBucket(ctx, sourceId).damage : ctx.attacks.damage
  target.typed.dieStep[type].push({ label, value, source, ataqueLocal })
}

/** Total dos buckets typed: max(pos)+min(neg) por tipo; Unico soma direto
 *  (plugin :858-876). */
export function resolveTypedTotal(buckets: Record<BonusType, ConditionEntry[]>): number {
  let total = 0
  for (const type of Object.keys(buckets) as BonusType[]) {
    const entries = buckets[type]
    if (type === 'Unico') {
      for (const e of entries) total += e.value
    } else {
      let maxPos = 0
      let minNeg = 0
      for (const e of entries) {
        if (e.value > maxPos) maxPos = e.value
        else if (e.value < minNeg) minNeg = e.value
      }
      total += maxPos + minNeg
    }
  }
  return total
}
