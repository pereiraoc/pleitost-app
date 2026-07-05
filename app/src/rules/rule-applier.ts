// Avaliação de regras — PORTA de src/extract/rule-applier.ts do plugin
// pleitost-autosheet, função a função (cada bloco cita a origem). Aplica
// `ParsedRule` sobre o `RulesModel`, acumulando mutações em `deltas`
// (o `calculatedRuleElements` do plugin). Nunca muta o model — só lê.
//
// Omissão deliberada vs o plugin: DeltaSources (tracking granular de
// sourceNote por delta, rule-applier.ts:72-99) fica de fora — no app o
// source canônico já vem MATERIALIZADO no FM salvo (incrementos/FontedLink),
// e a projeção de opções só consome os VALORES calculados.
import type { ParsedRule, RuleScope, RuleCondition, RuleAction } from './rule-types'
import type { RulesModel } from './rules-model'
import { slugify } from '../components/ficha/registry'

/** Espelho de ApplyContext (plugin rule-applier.ts:17-39), sem os campos
 *  de tracking granular. */
export interface ApplyContext {
  level: number
  tier: number | null
  categoria: 'Adepto' | 'Experiente' | 'Mestre' | null
  choicesObj: Record<string, string>
  /** §8.5.7 do plugin: rank herdado do owner pra rules de tesouros/
   *  propriedades presentes no inventário (rule-applier.ts:24-30). */
  categoriaPorNota?: Map<string, 'Adepto' | 'Experiente' | 'Mestre'>
  /** Anti-oscilação do `Senao` (rule-applier.ts:31-38). */
  baseModel?: RulesModel
  pathWriters?: Map<string, Set<string>>
}

export interface ApplyResult {
  applied: boolean
  reason?: string
  satisfied?: boolean
}

const WIKILINK_EXACT = /^\[\[([^\]|]+)(?:\|[^\]]+)?\]\]$/

/** Espelho de wikilinkTarget (plugin util/wikilink.ts:10-13). */
export function wikilinkTarget(wl: string): string {
  const m = wl.match(WIKILINK_EXACT)
  return m ? m[1].trim() : wl
}

/** Espelho de wikilinkBasename (plugin util/wikilink.ts:64-69). */
export function wikilinkBasename(wl: string): string {
  const m = wl.match(WIKILINK_EXACT)
  if (!m) return wl.trim()
  const target = m[1].trim()
  return (target.split('/').pop() ?? target).replace(/\.md$/i, '').trim()
}

/** Espelho de isWikilink (plugin util/wikilink.ts:72-74). */
export function isWikilink(s: string): boolean {
  return /^\[\[[^\]]+\]\]$/.test(s)
}

// ──────────────────────────────────────────────────────────────────────────
// Scope check — espelho de scopePasses (plugin rule-applier.ts:106-133).
// ──────────────────────────────────────────────────────────────────────────

export function scopePasses(scopes: RuleScope[], ctx: ApplyContext, sourceNote: string): boolean {
  const noteBase = (sourceNote.split('/').pop() ?? sourceNote).replace(/\.md$/i, '')
  const inheritedCat = ctx.categoriaPorNota?.get(noteBase) ?? null
  const effectiveCat = inheritedCat ?? ctx.categoria
  for (const s of scopes) {
    switch (s.kind) {
      case 'nivel-min':
        if (ctx.level < s.min) return false
        break
      case 'tier-min':
        if (ctx.tier === null || ctx.tier < s.min) return false
        break
      case 'categoria':
        if (effectiveCat !== s.value) return false
        break
      case 'escolha': {
        const persisted = ctx.choicesObj[s.choiceKey]
        if (!persisted && !s.pick) return false
        break
      }
    }
  }
  return true
}

// ──────────────────────────────────────────────────────────────────────────
// Condition check — espelho de conditionPasses + lookups
// (plugin rule-applier.ts:145-338).
// ──────────────────────────────────────────────────────────────────────────

const PROF_RANK: Record<string, number> = { N: 0, A: 1, E: 2, M: 3, P: 1 }

function lookupAttr(model: RulesModel, attr: string): number | null {
  if (attr === 'FOR' || attr === 'AGI' || attr === 'INT' || attr === 'PRE') {
    return model.atributos[attr]
  }
  return null
}

const PROF_PATH_RX = /^(Pericias|Oficios|Defesas_Resistencias|Sentidos)\.Lista\.([^.]+)\.Proficiencia$/
const ARMADURA_PROF_RX = /^Inventario\.Armadura\.Proficiencia\.(Sem|Leve|Pesada)$/

/** Espelho de lookupProfRank (plugin rule-applier.ts:157-186). */
function lookupProfRank(model: RulesModel, prop: string): number | null {
  const m = prop.match(PROF_PATH_RX)
  if (m) {
    const namespace = m[1]
    const name = m[2]
    if (namespace === 'Pericias') {
      const p = model.pericias[name]
      return p ? PROF_RANK[p.proficiencia] ?? null : null
    }
    const list =
      namespace === 'Oficios' ? model.oficios
      : namespace === 'Defesas_Resistencias' ? model.defesasResistencias
      : model.sentidos
    const found = list.find((x) => x.nome === name)
    return found ? PROF_RANK[found.proficiencia] ?? null : null
  }
  const arm = prop.match(ARMADURA_PROF_RX)
  if (arm) {
    const slot = arm[1] as 'Sem' | 'Leve' | 'Pesada'
    return PROF_RANK[model.inventario.armadura.proficiencias[slot]] ?? null
  }
  if (prop === 'Inventario.Escudo.Proficiencia') {
    return PROF_RANK[model.inventario.escudo.proficiencia] ?? null
  }
  return null
}

const BONUS_ESPECIAL_PATH_RX = /^(Pericias|Oficios)\.Lista\.([^.]+)\.Bonus_Especial$/

/** Espelho de lookupBonusEspecial (plugin rule-applier.ts:190-204). */
function lookupBonusEspecial(model: RulesModel, prop: string): number | null {
  const m = prop.match(BONUS_ESPECIAL_PATH_RX)
  if (!m) return null
  if (m[1] === 'Pericias') {
    const p = model.pericias[m[2]]
    return p ? p.bonusEspecial ?? 0 : null
  }
  const found = model.oficios.find((x) => x.nome === m[2])
  return found ? found.bonusEspecial ?? 0 : null
}

function compareAttr(left: number, op: '>' | '>=' | '<' | '<=' | '==' | '!=', right: number): boolean {
  switch (op) {
    case '>': return left > right
    case '>=': return left >= right
    case '<': return left < right
    case '<=': return left <= right
    case '==': return left === right
    case '!=': return left !== right
  }
}

/** Espelho de listContainsToken (plugin rule-applier.ts:226-235):
 *  needle wikilink compara por BASENAME do target. */
function listContainsToken(value: unknown, needle: string): boolean {
  const matches = isWikilink(needle)
    ? (s: string) => isWikilink(s) && wikilinkBasename(s) === wikilinkBasename(needle)
    : (s: string) => s.includes(needle)
  if (Array.isArray(value)) return value.some((v) => typeof v === 'string' && matches(v))
  if (typeof value === 'string') return matches(value)
  return false
}

/** Espelho de lookupNamePath (plugin rule-applier.ts:237-265). */
function lookupNamePath(model: RulesModel, slotProp: string): unknown {
  const norm = slotProp.replace(/\.Lista$/, '')
  if (norm === 'Sintonia') return model.meta.sintonia
  if (norm === 'Classe') return model.meta.classe
  if (norm === 'Raça' || norm === 'Raca') return model.meta.raca
  if (norm === 'Tutor') return model.meta.tutor
  if (norm === 'Tamanho') return model.meta.tamanho
  if (norm === 'Habilidades') return model.habilidades.lista.map((x) => x.link)
  if (norm === 'Tecnicas') return model.tecnicas.lista.map((x) => x.link)
  if (norm === 'Acoes') return model.acoes.map((x) => x.link)
  if (slotProp === 'Inventario.Armas.Lista') {
    return model.inventario.armas.lista.map((a) => a.nome)
  }
  return null
}

/** Espelho de StableCheckOpts (plugin rule-applier.ts:279-287). */
interface StableCheckOpts {
  baseModel: RulesModel
  sourceNote: string
  pathWriters: Map<string, Set<string>>
}

/** Espelho de conditionPasses (plugin rule-applier.ts:289-338). */
export function conditionPasses(cond: RuleCondition, model: RulesModel, opts?: StableCheckOpts): boolean {
  function viewFor(key: string): RulesModel {
    if (!opts) return model
    const writers = opts.pathWriters.get(key)
    if (!writers) return model
    const ownsOnly = writers.size === 1 && writers.has(opts.sourceNote)
    return ownsOnly ? opts.baseModel : model
  }
  switch (cond.kind) {
    case 'none':
      return true
    case 'attr-compare': {
      const l = lookupAttr(model, cond.left)
      const r = lookupAttr(model, cond.right)
      if (l === null || r === null) return false
      return compareAttr(l, cond.op, r)
    }
    case 'attr-min': {
      const v = lookupAttr(model, cond.attr)
      if (v === null) return false
      return v >= cond.min
    }
    case 'prof-min': {
      const r = lookupProfRank(viewFor(cond.prop), cond.prop)
      if (r === null) return false
      return r >= (PROF_RANK[cond.min] ?? 0)
    }
    case 'bonus-min': {
      const v = lookupBonusEspecial(viewFor(cond.prop), cond.prop)
      if (v === null) return false
      return v >= cond.min
    }
    case 'props-contains':
    case 'name-contains': {
      const slot = lookupNamePath(viewFor(cond.slotProp), cond.slotProp)
      return listContainsToken(slot, cond.needle)
    }
    case 'unknown':
      return false
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Mutation helpers — espelho de deltaSet/deltaDefine/deltaAccumulateNumber/
// deltaMultiplyNumber/deltaListAppend (plugin rule-applier.ts:347-525),
// sem o tracking de DeltaSources.
// ──────────────────────────────────────────────────────────────────────────

export type Deltas = Record<string, unknown>

function deltaSet(deltas: Deltas, key: string, value: unknown): void {
  deltas[key] = value
  // Sobrescrever = override absoluto (wipe da Somar acumulada) —
  // plugin rule-applier.ts:356-361.
  delete deltas[`__somar__${key}`]
}

const RANK_ORDER: Record<string, number> = { N: 0, A: 1, E: 2, M: 3 }

function readRank(v: unknown): number | null {
  if (typeof v !== 'string') return null
  const s = v.trim().toUpperCase()
  return s in RANK_ORDER ? RANK_ORDER[s] : null
}

function readDeltaAsNumber(v: unknown): number | null {
  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const n = Number(v.trim())
    return Number.isFinite(n) ? n : null
  }
  return null
}

function readSomarAccumulator(deltas: Deltas, key: string): number {
  return readDeltaAsNumber(deltas[`__somar__${key}`]) ?? 0
}

/** Definir = max-merge (numérico sobre a base sem Somar; rank por ordem
 *  N<A<E<M; fallback last-wins) — espelho de deltaDefine
 *  (plugin rule-applier.ts:389-442). */
function deltaDefine(deltas: Deltas, key: string, value: unknown): void {
  const cur = deltas[key]
  if (cur === undefined) {
    deltas[key] = value
    return
  }
  const curN = readDeltaAsNumber(cur)
  const newN = readDeltaAsNumber(value)
  if (curN !== null && newN !== null) {
    const somar = readSomarAccumulator(deltas, key)
    const curBase = curN - somar
    deltas[key] = Math.max(curBase, newN) + somar
    return
  }
  const curR = readRank(cur)
  const newR = readRank(value)
  if (curR !== null && newR !== null) {
    if (newR > curR) deltas[key] = value
    return
  }
  deltas[key] = value
}

/** Somar acumula no sidecar `__somar__<key>` — espelho de
 *  deltaAccumulateNumber (plugin rule-applier.ts:456-477). */
function deltaAccumulateNumber(deltas: Deltas, key: string, delta: number): void {
  const somarKey = `__somar__${key}`
  const oldSomar = readDeltaAsNumber(deltas[somarKey]) ?? 0
  const newSomar = oldSomar + delta
  deltas[somarKey] = newSomar
  const cur = readDeltaAsNumber(deltas[key]) ?? 0
  deltas[key] = cur - oldSomar + newSomar
}

function deltaMultiplyNumber(deltas: Deltas, key: string, factor: number): void {
  const cur = readDeltaAsNumber(deltas[key]) ?? 1
  deltas[key] = cur * factor
}

function deltaListAppend(deltas: Deltas, key: string, value: unknown): void {
  const cur = Array.isArray(deltas[key]) ? (deltas[key] as unknown[]) : []
  deltas[key] = [...cur, value]
}

/** Espelho de deltaAliasCompose (plugin rule-applier.ts:503-519). */
function deltaAliasCompose(deltas: Deltas, target: string, order: number, fragment: string): void {
  const aliasKey = `__alias__${target}`
  const cur = (deltas[aliasKey] as Array<{ order: number; fragment: string }> | undefined) ?? []
  deltas[aliasKey] = [...cur, { order, fragment }].sort((a, b) => a.order - b.order)
}

function parseNumber(s: string): number | null {
  const n = Number(s.trim())
  return Number.isFinite(n) ? n : null
}

/** Espelho de resolvePropriedade (plugin rule-applier.ts:541-555). */
function resolvePropriedade(valueRaw: string, model: RulesModel, ctx: ApplyContext): number | null {
  const m = valueRaw.trim().match(/^Propriedade\(\s*([A-Za-zÀ-ÿ]+)\s*\)$/)
  if (!m) return null
  const ref = m[1]
  if (ref === 'FOR' || ref === 'AGI' || ref === 'INT' || ref === 'PRE') return model.atributos[ref]
  if (ref === 'Nivel' || ref === 'Nível') return ctx.level
  if (ref === 'Tier') return ctx.tier
  return null
}

// ──────────────────────────────────────────────────────────────────────────
// Action dispatch — espelho de applyAction (plugin rule-applier.ts:573-753).
// ──────────────────────────────────────────────────────────────────────────

/** Espelho de pickForScope (plugin rule-applier.ts:563-571). */
function pickForScope(rule: ParsedRule, ctx: ApplyContext): string | null {
  for (const s of rule.scope) {
    if (s.kind !== 'escolha') continue
    if (s.pick) return s.pick
    const persisted = ctx.choicesObj[s.choiceKey]
    if (persisted) return persisted
  }
  return null
}

function applyAction(rule: ParsedRule, deltas: Deltas, ctx: ApplyContext, model: RulesModel): ApplyResult {
  const action: RuleAction = rule.action
  switch (action.kind) {
    case 'interativa':
      return { applied: false, reason: 'interactive-only' }

    case 'definir':
      deltaDefine(deltas, action.targetRaw, action.valueRaw)
      return { applied: true }
    case 'sobrescrever':
      deltaSet(deltas, action.targetRaw, action.valueRaw)
      return { applied: true }

    case 'somar': {
      const resolved = resolvePropriedade(action.valueRaw, model, ctx)
      const n = resolved !== null ? resolved : parseNumber(action.valueRaw)
      if (n === null) return { applied: false, reason: 'somar-nao-numerico' }
      deltaAccumulateNumber(deltas, action.targetRaw, n)
      return { applied: true }
    }

    case 'multiplicar': {
      const resolved = resolvePropriedade(action.valueRaw, model, ctx)
      const n = resolved !== null ? resolved : parseNumber(action.valueRaw)
      if (n === null) return { applied: false, reason: 'value-not-number' }
      deltaMultiplyNumber(deltas, action.targetRaw, n)
      return { applied: true }
    }

    case 'complementar':
      deltaListAppend(deltas, action.targetRaw, action.valueRaw)
      return { applied: true }

    case 'escolher':
    case 'restringir':
      deltaSet(deltas, `__constraint__${action.targetRaw}`, action.allowed)
      return { applied: true }

    case 'prof-definir': {
      const cur = lookupProfRank(model, action.targetRaw)
      const min = PROF_RANK[action.minRank] ?? 0
      if (cur === null || cur < min) return { applied: false, reason: 'prof-rank-too-low' }
      deltaSet(deltas, action.targetRaw, action.valueRaw)
      return { applied: true }
    }

    case 'alias':
      deltaSet(deltas, `__alias__${action.targetRaw}`, action.aliasRaw)
      return { applied: true }

    case 'alias-compor':
      deltaAliasCompose(deltas, action.targetRaw, action.order, action.fragment)
      return { applied: true }

    case 'requisito':
    case 'requisito-contem': {
      const ok =
        action.kind === 'requisito'
          ? requisitoMatches(model, action.targetRaw, action.valueRaw)
          : listContainsToken(lookupNamePath(model, action.targetRaw), action.valueRaw)
      return { applied: true, satisfied: ok }
    }

    case 'movimento-lista-complementar':
      deltaListAppend(deltas, 'Movimento.Lista', action.nome)
      return { applied: true }

    case 'movimento-lista-definir':
      deltaSet(deltas, `Movimento.Lista.${action.nome}.${action.field}`, action.valueRaw)
      return { applied: true }

    case 'complementar-sel': {
      // Declaração SEMPRE; aplica o pick (objeto {link, source}) quando
      // resolvido — espelho do plugin rule-applier.ts:667-689.
      deltaSet(deltas, `__choice__sel__${action.targetRaw}`, action.options)
      const pick = pickForScope(rule, ctx)
      if (pick && action.options.includes(pick)) {
        const base = rule.sourceNote.split('/').pop()?.replace(/\.md$/i, '') ?? ''
        deltaListAppend(deltas, action.targetRaw, { link: pick, source: `Escolha.[[${base}]]` })
      }
      return { applied: true }
    }

    case 'escolha-prop-map': {
      deltaSet(deltas, `__choice__map__${action.label}`, {
        propMap: action.propMap,
        valueRaw: action.valueRaw,
      })
      const pick = pickForScope(rule, ctx)
      if (pick) {
        const entry = action.propMap.find((p) => p.label === pick)
        if (entry) deltaSet(deltas, entry.targetRaw, action.valueRaw)
      }
      return { applied: true }
    }

    case 'escolha-pericia-especial': {
      deltaSet(deltas, `__choice__pericia_especial__${action.label ?? ''}`, action.valueRaw)
      const pick = pickForScope(rule, ctx)
      if (pick) {
        deltaSet(deltas, `Pericias.Lista.${slugify(pick)}.Bonus_Especial`, action.valueRaw)
      }
      return { applied: true }
    }

    default:
      return { applied: false, reason: 'unsupported' }
  }
}

/** Espelho de requisitoMatches (plugin rule-applier.ts:755-766). */
function requisitoMatches(model: RulesModel, prop: string, expected: string): boolean {
  const v = lookupNamePath(model, prop)
  if (typeof v === 'string') return v.trim() === expected.trim()
  const attr = lookupAttr(model, prop)
  if (attr !== null) {
    const n = parseNumber(expected)
    return n !== null ? attr >= n : false
  }
  return false
}

// ──────────────────────────────────────────────────────────────────────────
// API pública — espelho de applyRule + provenanceMatches
// (plugin rule-applier.ts:782-855).
// ──────────────────────────────────────────────────────────────────────────

export function applyRule(rule: ParsedRule, model: RulesModel, deltas: Deltas, ctx: ApplyContext): ApplyResult {
  if (rule.channel === 'interactive-only') {
    return { applied: false, reason: 'interactive-only' }
  }
  if (!scopePasses(rule.scope, ctx, rule.sourceNote)) {
    return { applied: false, reason: 'scope-mismatch' }
  }
  const stableOpts: StableCheckOpts | undefined =
    rule.stableCheck && ctx.baseModel && ctx.pathWriters
      ? { baseModel: ctx.baseModel, sourceNote: rule.sourceNote, pathWriters: ctx.pathWriters }
      : undefined
  let condPasses = conditionPasses(rule.condition, model, stableOpts)
  if (rule.conditionNegated) condPasses = !condPasses
  if (!condPasses) {
    return { applied: false, reason: 'condition-false' }
  }
  if (!provenanceMatches(rule.provenance, ctx, model)) {
    return { applied: false, reason: 'provenance-mismatch' }
  }
  return applyAction(rule, deltas, ctx, model)
}

/** Espelho de provenanceMatches (plugin rule-applier.ts:842-855). */
export function provenanceMatches(
  prov: ParsedRule['provenance'],
  ctx: ApplyContext,
  model: RulesModel,
): boolean {
  for (const c of prov) {
    if (c.scope.length > 0 && !scopePasses(c.scope, ctx, '')) return false
    if (c.fromChoice && ctx.choicesObj[c.fromChoice.choiceKey] !== c.fromChoice.expectedPick) {
      return false
    }
    if (c.condition && !conditionPasses(c.condition, model)) return false
  }
  return true
}
