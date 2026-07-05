// Orquestrador da avaliação: BFS sobre wikilinks → AST pronta → resolve
// choices → aplica → converge. PORTA de src/extract/rule-elements-extractor.ts
// do plugin pleitost-autosheet (cada bloco cita a função espelhada).
//
// Diferenças estruturais vs o plugin:
//   - As rules já vêm PARSEADAS (`ruleElements[].parsed` do vault-data);
//     não há parseRuleLineMulti aqui.
//   - O model de entrada é o FM SALVO (regras já materializadas pelo save
//     da Editável no plugin — docs/architecture/modes.md §"Fonte do modelo
//     por modo"), então `projectWorkingModel` abaixo é um espelho LEVE de
//     mergeCalculatedIntoModel: só os paths que conditions/inferência leem.
//   - Sem transientPicks: no app o pick persiste direto como ESTADO do FM
//     (overlay), a mesma consolidação que o save do plugin faz.
import type { VaultDoc } from '../data/types'
import type { ParsedRule, InheritedConstraint, ChoiceProvenance } from './rule-types'
import { parsedRulesOf } from './rule-types'
import type { RulesModel, FontedLink } from './rules-model'
import {
  applyRule,
  conditionPasses,
  provenanceMatches,
  scopePasses,
  wikilinkBasename,
  type ApplyContext,
  type ApplyResult,
  type Deltas,
} from './rule-applier'
import {
  buildPicksRecord,
  discoverChoices,
  resolveAllChoices,
  type ChoiceDescriptor,
} from './resolve-choices'

/** Resolve um wikilink/nome pro doc do vault-data (null quando não existe). */
export type DocResolver = (wikilinkOrName: string) => Promise<VaultDoc | null>

/** Espelho de DEFAULT_OPTS (plugin rule-elements-extractor.ts:105). */
const DEFAULT_OPTS = { maxDepth: 6, maxNodes: 420, maxIterations: 4 }

const WIKILINK_RE = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g

function extractWikilinks(s: string): string[] {
  const out: string[] = []
  let m: RegExpExecArray | null
  WIKILINK_RE.lastIndex = 0
  while ((m = WIKILINK_RE.exec(s)) !== null) out.push(m[1])
  return out
}

/** Espelho de isRuleSource (plugin util/source-classification.ts): itens
 *  com source `Regra*` são DERIVADOS do extract anterior — não semeiam. */
function isRuleSource(source: string): boolean {
  return source.startsWith('Regra')
}

/** Espelho de collectSeeds (plugin rule-elements-extractor.ts:128-198). */
export function collectSeeds(model: RulesModel): string[] {
  const seeds: string[] = []
  const push = (wl: string | null | undefined): void => {
    if (!wl) return
    seeds.push(...extractWikilinks(wl))
  }
  const pushFonted = (items: FontedLink[]): void => {
    for (const it of items) {
      if (isRuleSource(it.source)) continue
      push(it.link)
    }
  }

  push(model.meta.classe)
  push(model.meta.sintonia)
  push(model.meta.raca)
  push(model.meta.tutor)
  for (const sc of model.meta.subclasses) push(sc)

  if (model.meta.modificador) {
    push(`[[${model.meta.modificador}]]`)
    if (model.meta.modificador === 'Solo' || model.meta.modificador === 'Elite') {
      push('[[Competente]]')
    }
  }

  pushFonted(model.habilidades.lista)
  for (const h of model.habilidades.especiais) push(h)
  pushFonted(model.tecnicas.lista)
  pushFonted(model.magias.listas.aprendidas)
  pushFonted(model.magias.listas.naoAprendidas)
  pushFonted(model.magias.listas.tesouros)
  pushFonted(model.acoes)

  for (const wl of model.periciasEspecMaestria) push(wl)

  for (const arma of model.inventario.armas.lista) {
    push(arma.nome)
    push(arma.propriedade)
  }
  push(model.inventario.armadura.nome)
  push(model.inventario.armadura.propriedade)
  push(model.inventario.escudo.nome)
  push(model.inventario.escudo.propriedade)
  for (const tes of model.inventario.tesouros) push(tes.nome)
  for (const con of model.inventario.consumiveis) push(con)

  return seeds
}

interface SeedExpansion {
  link: string
  addProvenance: ChoiceProvenance | null
}

/** Espelho de extractRuleSeeds (plugin rule-elements-extractor.ts:213-234). */
function extractRuleSeeds(rule: ParsedRule): SeedExpansion[] {
  const a = rule.action
  switch (a.kind) {
    case 'complementar':
    case 'definir':
    case 'sobrescrever':
      return extractWikilinks(a.valueRaw).map((link) => ({ link, addProvenance: null }))
    case 'complementar-sel': {
      const escolha = rule.scope.find((s) => s.kind === 'escolha')
      if (!escolha || escolha.kind !== 'escolha') return []
      const out: SeedExpansion[] = []
      for (const option of a.options) {
        for (const link of extractWikilinks(option)) {
          out.push({ link, addProvenance: { choiceKey: escolha.choiceKey, expectedPick: option } })
        }
      }
      return out
    }
    default:
      return []
  }
}

/** Espelho de constraintIsTrivial (plugin rule-elements-extractor.ts:338-340). */
function constraintIsTrivial(c: InheritedConstraint): boolean {
  return c.scope.length === 0 && !c.fromChoice && !c.condition
}

export interface BfsResult {
  parsedRules: ParsedRule[]
  /** basename visitado → doc (pra anotações downstream, ex. isSubclass). */
  visitedDocs: Map<string, VaultDoc>
}

/** BFS assíncrono — espelho de bfs (plugin rule-elements-extractor.ts:252-330);
 *  o parse é substituído pela AST pronta (parsedRulesOf). */
export async function bfsRules(
  seeds: string[],
  resolver: DocResolver,
  opts: { maxDepth: number; maxNodes: number } = DEFAULT_OPTS,
): Promise<BfsResult> {
  const parsedRules: ParsedRule[] = []
  const visited = new Set<string>()
  const visitedDocs = new Map<string, VaultDoc>()
  type QueueItem = { wikilinkOrPath: string; depth: number; inheritedConstraints: InheritedConstraint[] }
  const queue: QueueItem[] = seeds.map((s) => ({ wikilinkOrPath: s, depth: 1, inheritedConstraints: [] }))

  while (queue.length > 0) {
    if (visited.size >= opts.maxNodes) break
    const item = queue.shift()!
    if (item.depth > opts.maxDepth) continue

    const doc = await resolver(item.wikilinkOrPath)
    if (!doc) continue
    if (visited.has(doc.id)) continue
    visited.add(doc.id)
    visitedDocs.set(doc.basename, doc)

    for (const parsed of parsedRulesOf(doc)) {
      // Herda constraints acumuladas no caminho BFS até esta nota
      // (plugin rule-elements-extractor.ts:299-323).
      parsed.provenance = [...item.inheritedConstraints]
      parsedRules.push(parsed)
      for (const next of extractRuleSeeds(parsed)) {
        const newConstraint: InheritedConstraint = {
          scope: parsed.scope,
          ...(next.addProvenance ? { fromChoice: next.addProvenance } : {}),
          ...(parsed.condition.kind !== 'none' ? { condition: parsed.condition } : {}),
        }
        const childConstraints = constraintIsTrivial(newConstraint)
          ? item.inheritedConstraints
          : [...item.inheritedConstraints, newConstraint]
        queue.push({
          wikilinkOrPath: next.link,
          depth: item.depth + 1,
          inheritedConstraints: childConstraints,
        })
      }
    }
  }

  return { parsedRules, visitedDocs }
}

/** Espelho de buildPathWriters (plugin rule-elements-extractor.ts:349-368). */
function buildPathWriters(rules: ParsedRule[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  for (const r of rules) {
    const a = r.action
    const targetRaw = 'targetRaw' in a ? (a as { targetRaw?: string }).targetRaw : undefined
    if (!targetRaw) continue
    const set = out.get(targetRaw) ?? new Set<string>()
    set.add(r.sourceNote)
    out.set(targetRaw, set)
  }
  return out
}

/** Espelho de injectPicks (plugin rule-elements-extractor.ts:391-404). */
function injectPicks(rules: ParsedRule[], resolvedChoices: Map<string, ChoiceDescriptor>): void {
  for (const r of rules) {
    for (const s of r.scope) {
      if (s.kind === 'escolha') {
        const desc = resolvedChoices.get(s.choiceKey)
        if (desc) {
          s.pick = desc.pick
          s.occurrence = desc.occurrenceWithinParent
        }
      }
    }
  }
}

/** Espelho de applyConstraints (plugin rule-elements-extractor.ts:411-432). */
function applyConstraints(deltas: Deltas): void {
  const constraints: Record<string, Set<string>> = {}
  for (const k of Object.keys(deltas)) {
    if (!k.startsWith('__constraint__')) continue
    const target = k.slice('__constraint__'.length)
    const allowed = deltas[k] as string[]
    if (!constraints[target]) constraints[target] = new Set(allowed)
    else constraints[target] = new Set([...constraints[target]].filter((x) => allowed.includes(x)))
  }
  for (const target of Object.keys(constraints)) {
    const set = constraints[target]
    if (set.size === 1) deltas[target] = [...set][0]
  }
}

/** Espelho de buildCategoriaPorNota (plugin rule-elements-extractor.ts:769-822). */
function buildCategoriaPorNota(model: RulesModel): Map<string, 'Adepto' | 'Experiente' | 'Mestre'> {
  const RANK_LABEL: Record<'A' | 'E' | 'M', 'Adepto' | 'Experiente' | 'Mestre'> = {
    A: 'Adepto',
    E: 'Experiente',
    M: 'Mestre',
  }
  const rankFromCat = (cat: string | null): 'A' | 'E' | 'M' | null => {
    if (!cat) return null
    const m = cat.match(/^\[\[([^\]|]+)(?:\|[^\]]+)?\]\]$/)
    const label = m ? m[1].trim() : cat.trim()
    if (label === 'Adepto') return 'A'
    if (label === 'Experiente') return 'E'
    if (label === 'Mestre') return 'M'
    return null
  }
  const noteOf = (wl: string | null | undefined): string | null => {
    if (!wl) return null
    const m = wl.match(/^\[\[([^\]|]+)(?:\|[^\]]+)?\]\]$/)
    if (!m) return null
    const target = m[1].trim()
    return (target.split('/').pop() ?? target).replace(/\.md$/i, '')
  }
  const out = new Map<string, 'Adepto' | 'Experiente' | 'Mestre'>()
  for (const t of model.inventario.tesouros) {
    if (!t.tier) continue
    const note = noteOf(t.nome)
    if (note) out.set(note, RANK_LABEL[t.tier])
  }
  {
    const cat = rankFromCat(model.inventario.armadura.categoria)
    const note = noteOf(model.inventario.armadura.propriedade)
    if (cat && note) out.set(note, RANK_LABEL[cat])
  }
  {
    const cat = rankFromCat(model.inventario.escudo.categoria)
    const note = noteOf(model.inventario.escudo.propriedade)
    if (cat && note) out.set(note, RANK_LABEL[cat])
  }
  for (const a of model.inventario.armas.lista) {
    const cat = rankFromCat(a.categoria)
    const note = noteOf(a.propriedade)
    if (cat && note) out.set(note, RANK_LABEL[cat])
  }
  return out
}

const PROF_TARGET_RX =
  /^(Pericias|Oficios|Defesas_Resistencias|Sentidos)\.Lista\.([^.]+)\.(Proficiencia|Bonus_Especial)$/

/** Projeção LEVE do workingModel entre iterações — espelho funcional do
 *  mergeCalculatedIntoModel do plugin (rule-elements-extractor.ts:618) mas
 *  restrito aos paths que conditionPasses/provenance leem: proficiências e
 *  bônus especial das 4 listas, metas escalares e listas de habilidades/
 *  técnicas/ações/magias. Base = FM salvo (regras já materializadas). */
function projectWorkingModel(base: RulesModel, deltas: Deltas): RulesModel {
  const model = structuredClone(base)
  const pushLink = (lista: FontedLink[], value: unknown): void => {
    if (typeof value === 'string') {
      if (!lista.some((it) => it.link === value)) lista.push({ link: value, source: 'Regra' })
    } else if (value && typeof value === 'object' && 'link' in value) {
      const v = value as FontedLink
      if (!lista.some((it) => it.link === v.link)) lista.push({ link: v.link, source: v.source })
    }
  }
  for (const [key, value] of Object.entries(deltas)) {
    if (key.startsWith('__')) continue
    const prof = key.match(PROF_TARGET_RX)
    if (prof) {
      const [, namespace, name, field] = prof
      if (namespace === 'Pericias') {
        const p = (model.pericias[name] ??= {
          nome: name,
          proficiencia: 'N',
          bonusEspecial: 0,
          incrementos: [],
        })
        if (field === 'Proficiencia') p.proficiencia = String(value).trim().toUpperCase() as 'N' | 'A' | 'E' | 'M'
        else p.bonusEspecial = Number(value) || 0
        continue
      }
      const list =
        namespace === 'Oficios' ? model.oficios
        : namespace === 'Defesas_Resistencias' ? model.defesasResistencias
        : model.sentidos
      let row = list.find((x) => x.nome === name)
      if (!row) {
        row = { nome: name, proficiencia: 'N', bonusEspecial: 0, incrementos: [] }
        list.push(row)
      }
      if (field === 'Proficiencia') row.proficiencia = String(value).trim().toUpperCase() as 'N' | 'A' | 'E' | 'M'
      else row.bonusEspecial = Number(value) || 0
      continue
    }
    if (key === 'Sintonia') model.meta.sintonia = String(value)
    else if (key === 'Classe') model.meta.classe = String(value)
    else if (key === 'Raça' || key === 'Raca') model.meta.raca = String(value)
    else if (key === 'Tutor') model.meta.tutor = String(value)
    else if (key === 'Tamanho') model.meta.tamanho = String(value)
    else if (key === 'Habilidades.Lista' || key === 'Habilidades') {
      for (const v of value as unknown[]) pushLink(model.habilidades.lista, v)
    } else if (key === 'Tecnicas.Lista' || key === 'Tecnicas') {
      for (const v of value as unknown[]) pushLink(model.tecnicas.lista, v)
    } else if (key === 'Acoes.Lista' || key === 'Acoes') {
      for (const v of value as unknown[]) pushLink(model.acoes, v)
    } else if (key === 'Magias.Lista') {
      for (const v of value as unknown[]) pushLink(model.magias.listas.aprendidas, v)
    } else if (key === 'Magias.Secundaria.Lista') {
      for (const v of value as unknown[]) pushLink(model.magias.secundaria.listas.aprendidas, v)
    } else if (key === 'Inventario.Armas.Proficiencia.Especificas') {
      // Só leitura via Contem(Inventario.Armas.Lista) não inclui este path;
      // mantido de fora — nenhum condition o consulta (vide lookupNamePath).
    }
  }
  return model
}

export interface HeroRulesResult {
  /** `calculatedRuleElements` final (deltas convergidos). */
  calculated: Deltas
  /** Escolhas descobertas + resolvidas (picks inferidos do FM salvo). */
  choices: ChoiceDescriptor[]
  /** Docs visitados pelo BFS, por basename (anotações downstream). */
  visitedDocs: Map<string, VaultDoc>
  appliedRules: ParsedRule[]
  rejectedRules: Array<{ rule: ParsedRule; result: ApplyResult }>
}

/** Loop principal — espelho de extractAndApplyRules (plugin
 *  rule-elements-extractor.ts:414-694): seeds → BFS → [discover(gate) →
 *  resolve → injectPicks → apply → constraints → signature] até convergir. */
export async function extractHeroRules(model: RulesModel, resolver: DocResolver): Promise<HeroRulesResult> {
  const seeds = collectSeeds(model)
  const { parsedRules, visitedDocs } = await bfsRules(seeds, resolver)

  const editable = parsedRules.filter((r) => r.channel !== 'interactive-only')
  const categoriaPorNota = buildCategoriaPorNota(model)
  const pathWriters = buildPathWriters(editable)

  const ctx: ApplyContext = {
    level: model.meta.nivel,
    tier: model.meta.tier,
    categoria: null,
    choicesObj: {},
    categoriaPorNota,
    baseModel: model,
    pathWriters,
  }

  let deltas: Deltas = {}
  let appliedRules: ParsedRule[] = []
  let rejectedRules: Array<{ rule: ParsedRule; result: ApplyResult }> = []
  let lastSig = ''
  let resolvedChoices = new Map<string, ChoiceDescriptor>()
  let workingModel: RulesModel = model

  for (let iter = 0; iter < DEFAULT_OPTS.maxIterations; iter++) {
    deltas = {}
    appliedRules = []
    rejectedRules = []

    // Gate de discovery — espelho do plugin rule-elements-extractor.ts:566-573:
    // scope escolha da própria rule é ignorado; Nivel/Tier/Categoria +
    // condition + provenance checam contra o workingModel.
    const discovered = discoverChoices(editable, (r) => {
      const nonEscolhaScope = r.scope.filter((s) => s.kind !== 'escolha')
      if (!scopePasses(nonEscolhaScope, ctx, r.sourceNote)) return false
      if (!conditionPasses(r.condition, workingModel)) return false
      if (!provenanceMatches(r.provenance, ctx, workingModel)) return false
      return true
    })
    // Inferência sobre o MODEL ORIGINAL (FM salvo), nunca o workingModel —
    // plugin rule-elements-extractor.ts:575-580.
    resolvedChoices = resolveAllChoices(discovered, model, {})
    injectPicks(editable, resolvedChoices)
    ctx.choicesObj = buildPicksRecord(resolvedChoices)

    for (const r of editable) {
      const result = applyRule(r, workingModel, deltas, ctx)
      if (result.applied) appliedRules.push(r)
      else rejectedRules.push({ rule: r, result })
    }
    applyConstraints(deltas)

    const sig = JSON.stringify({
      picks: [...resolvedChoices.entries()].map(([k, v]) => [k, v.pick]),
      deltas: Object.keys(deltas)
        .sort()
        .map((k) => [k, deltas[k]]),
    })
    if (sig === lastSig) break
    lastSig = sig
    workingModel = projectWorkingModel(model, deltas)
  }

  return {
    calculated: deltas,
    choices: [...resolvedChoices.values()],
    visitedDocs,
    appliedRules,
    rejectedRules,
  }
}

export { wikilinkBasename }
