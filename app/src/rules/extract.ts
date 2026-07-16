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
import { linkLabel } from '../markdown/dataview-value'
import { rankGroupLabel } from '../components/ficha/registry'
import { str } from '../components/ficha/hero-model'
import type { ParsedRule, InheritedConstraint, ChoiceProvenance } from './rule-types'
import { parsedRulesOf } from './rule-types'
import { ATRIBUTOS, type RulesModel, type FontedLink, type AtributoId } from './rules-model'
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
// #288 (profundo): mesmo avaliador AplicavelA da loja, agora no motor do herói.
import { tesouroAplicavelAoItem } from './aplicavel-a'

/** Resolve um wikilink/nome pro doc do vault-data (null quando não existe). */
export type DocResolver = (wikilinkOrName: string) => Promise<VaultDoc | null>

/** Espelho de DEFAULT_OPTS (plugin rule-elements-extractor.ts:105). */
const DEFAULT_OPTS = { maxDepth: 6, maxNodes: 420, maxIterations: 4 }

const WIKILINK_RE = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g

function extractWikilinks(s: string): string[] {
  const out: string[] = []
  let m: RegExpExecArray | null
  WIKILINK_RE.lastIndex = 0
  while ((m = WIKILINK_RE.exec(s)) !== null) out.push(m[1]!)
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
 *  o parse é substituído pela AST pronta (parsedRulesOf).
 *
 *  PARALELIZAÇÃO POR NÍVEL (#57): a versão serial do plugin aguarda UM doc por
 *  vez (`await resolver` dentro do `while (queue.shift())`), até `maxNodes`
 *  round-trips sequenciais. Aqui a FRONTEIRA de cada nível é resolvida DE UMA
 *  VEZ (`Promise.all`) — docs são locais + cache do loadDoc, idempotentes e sem
 *  efeito colateral no model. Como uma fila FIFO já processa a BFS nível a
 *  nível (todo depth-d entra antes de qualquer depth-(d+1)), a ORDEM de visita
 *  aqui é IDÊNTICA à serial: mesmo "vencedor" por doc (1º a marcar `visited`),
 *  mesma provenance herdada, mesmo `parsedRules` — só as chamadas de rede/disco
 *  do mesmo nível passam a ser concorrentes. */
export async function bfsRules(
  seeds: string[],
  resolver: DocResolver,
  opts: { maxDepth: number; maxNodes: number } = DEFAULT_OPTS,
): Promise<BfsResult> {
  const parsedRules: ParsedRule[] = []
  const visited = new Set<string>()
  const visitedDocs = new Map<string, VaultDoc>()
  type QueueItem = { wikilinkOrPath: string; depth: number; inheritedConstraints: InheritedConstraint[] }
  let frontier: QueueItem[] = seeds.map((s) => ({ wikilinkOrPath: s, depth: 1, inheritedConstraints: [] }))

  while (frontier.length > 0) {
    // Todo item da fronteira compartilha a MESMA profundidade (BFS por nível).
    // Nível além de maxDepth → o serial daria `continue` em todos (sem resolver
    // nem gerar regra); não resolve para não carregar docs que nunca contribuem.
    if (frontier[0]!.depth > opts.maxDepth) break

    // Resolve a fronteira inteira em paralelo, preservando o índice.
    const docs = await Promise.all(frontier.map((it) => resolver(it.wikilinkOrPath)))

    const nextFrontier: QueueItem[] = []
    for (let i = 0; i < frontier.length; i++) {
      // maxNodes por-item, na MESMA ordem/ponto da fila serial (checado antes de
      // consumir o item). Resolver a fronteira toda pode carregar alguns docs a
      // mais que a serial pararia antes — cacheados/inócuos, sem mudar o result.
      if (visited.size >= opts.maxNodes) return { parsedRules, visitedDocs }
      const item = frontier[i]!
      const doc = docs[i]
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
          nextFrontier.push({
            wikilinkOrPath: next.link,
            depth: item.depth + 1,
            inheritedConstraints: childConstraints,
          })
        }
      }
    }
    frontier = nextFrontier
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
    const set = constraints[target]!
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
    const label = m ? m[1]!.trim() : cat.trim()
    if (label === 'Adepto') return 'A'
    if (label === 'Experiente') return 'E'
    if (label === 'Mestre') return 'M'
    return null
  }
  const noteOf = (wl: string | null | undefined): string | null => {
    if (!wl) return null
    const m = wl.match(/^\[\[([^\]|]+)(?:\|[^\]]+)?\]\]$/)
    if (!m) return null
    const target = m[1]!.trim()
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
      // PROF_TARGET_RX tem 3 grupos: name sempre presente quando `prof` casa.
      const [, namespace, name, field] = prof as [string, string, string, string]
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
  // #291: aplica a restrição de Atributo Principal ao MODELO DE TRABALHO (o plugin
  // faz isso entre iterações via applyPrincipalConstraint). Sem isso, condições/
  // Propriedade que leem o rank de atributo (Propriedade(INT), Condicional INT>=3)
  // viam o rank PRÉ-swap na iteração seguinte. Mesma lógica do merge-calculated.
  const principalRaw = deltas['__constraint__Atributos.Principal']
  const allowed = Array.isArray(principalRaw)
    ? (principalRaw as unknown[]).filter((a): a is AtributoId => (ATRIBUTOS as readonly string[]).includes(a as string))
    : null
  applyPrincipalToModel(model, allowed)
  return model
}

/** #291: swap de Atributo Principal no RulesModel — espelho de
 *  applyPrincipalConstraint (merge-calculated.ts:358 / plugin): se o atributo do
 *  rank 3 não é permitido, allowed[0] assume o rank 3 e o antigo do rank 3 recebe
 *  o rank que allowed[0] tinha (permutação preservada). */
export function applyPrincipalToModel(model: RulesModel, allowed: AtributoId[] | null): void {
  if (!allowed || allowed.length === 0) return
  const at = model.atributos
  const allowedSet = new Set(allowed)
  const attrByRank = (rank: number): AtributoId | null => ATRIBUTOS.find((a) => at[a] === rank) ?? null
  const attr3 = attrByRank(3)
  if (attr3 && allowedSet.has(attr3)) {
    model.atributoPrincipal = attr3
    return
  }
  const newAttr3 = allowed[0]!
  const oldRankOfNew = at[newAttr3]
  at[newAttr3] = 3
  if (attr3 && attr3 !== newAttr3) at[attr3] = oldRankOfNew
  model.atributoPrincipal = newAttr3
}

/** Assinatura ESTÁVEL de tudo que a extração LÊ do herói (#57). Duas fichas com
 *  a mesma key produzem o MESMO `calculated`/`choices` — logo o BFS + fixed-point
 *  (caros, async) podem ser pulados quando só mudam campos que a regra IGNORA
 *  (nome/motivação/idade). Como o RulesModel já É a projeção rule-relevant do FM
 *  (rulesModelFromFm espelha o frontmatter-extractor: seeds de collectSeeds,
 *  metas de scope/condition, listas/incrementos que inferem picks, inventário),
 *  serializá-lo é a key COMPLETA e MÍNIMA — impossível esquecer um seed/condition
 *  ou re-extrair à toa. Determinística: rulesModelFromFm monta os objetos em
 *  ordem de chave fixa. */
export function ruleModelKey(model: RulesModel): string {
  return JSON.stringify(model)
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

/** CA satélite do tutor (#201) — espelho de extract/sync-ca-tutor-nivel.ts +
 *  cola/process-yaml-extract-phase.ts:86-113 do plugin: resolve o FM do tutor
 *  UMA vez e devolve o nível dele. A extração então roda com `meta.nivel` do
 *  TUTOR (a escala/`ctx.level` computa no nível dele) e o chamador injeta
 *  `calculated["Nível"]` pro derivedFm materializar o nível sincronizado
 *  (NVL do perfil/topbar). No-op fora da família CompanheiroAnimal, sem
 *  tutor resolvível ou sem `Nível` válido no FM do tutor. */
async function resolveTutorNivel(model: RulesModel, resolver: DocResolver): Promise<number | null> {
  if (model.meta.familia !== 'CompanheiroAnimal' || !model.meta.tutor) return null
  const tutorDoc = await resolver(wikilinkBasename(model.meta.tutor))
  if (!tutorDoc) return null
  const fm = (tutorDoc.frontmatter ?? {}) as Record<string, unknown>
  const raw = fm['Nível'] ?? fm['Nivel']
  if (raw == null) return null
  const nivel = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(nivel) ? nivel : null
}

/** #288 (profundo, #291): tesouros (imbuição/qualidade) EQUIPADOS num host
 *  incompatível têm TODAS as suas rules podadas — igual ao plugin (bloqueio por
 *  AplicavelA), reusando o MESMO avaliador da loja (tesouroAplicavelAoItem). Cada
 *  slot com propriedade (arma/armadura/escudo) forma um par tesouro↔host; se o
 *  AplicavelA do tesouro não casa com o host, o basename do tesouro entra no set
 *  de bloqueio. Docs não-resolvidos (ex.: entidade local) → conservador, não
 *  bloqueia. Retorna basenames (== ParsedRule.sourceNote). */
export async function computeBlockedTreasures(
  model: RulesModel,
  resolver: DocResolver,
): Promise<Set<string>> {
  const inv = model.inventario
  const pairs: Array<{ tesouro: string | null; host: string | null }> = [
    ...inv.armas.lista.map((a) => ({ tesouro: a.propriedade, host: a.nome })),
    { tesouro: inv.armadura.propriedade, host: inv.armadura.nome },
    { tesouro: inv.escudo.propriedade, host: inv.escudo.nome },
  ]
  const blocked = new Set<string>()
  await Promise.all(
    pairs.map(async ({ tesouro, host }) => {
      if (!tesouro || !host) return
      const tesouroBase = wikilinkBasename(tesouro)
      const [tesouroDoc, hostDoc] = await Promise.all([resolver(tesouroBase), resolver(wikilinkBasename(host))])
      if (!tesouroDoc || !hostDoc) return
      if (!tesouroAplicavelAoItem(tesouroDoc, hostDoc)) blocked.add(tesouroBase)
    }),
  )
  return blocked
}

/** Loop principal — espelho de extractAndApplyRules (plugin
 *  rule-elements-extractor.ts:414-694): seeds → BFS → [discover(gate) →
 *  resolve → injectPicks → apply → constraints → signature] até convergir. */
export async function extractHeroRules(baseModel: RulesModel, resolver: DocResolver): Promise<HeroRulesResult> {
  // Nível do CA vem do tutor ANTES de tudo (como o plugin injeta o Nível no
  // volatile antes do extractAndApplyRules): seeds/scopes/escala veem o
  // nível sincronizado.
  const tutorNivel = await resolveTutorNivel(baseModel, resolver)
  const model =
    tutorNivel !== null && tutorNivel !== baseModel.meta.nivel
      ? { ...baseModel, meta: { ...baseModel.meta, nivel: tutorNivel } }
      : baseModel
  const seeds = collectSeeds(model)
  // #288 (profundo): tesouros equipados em host incompatível → suas rules podadas.
  const blockedTreasures = await computeBlockedTreasures(model, resolver)
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
      // #288 (profundo): pula rules de tesouro incompatível com o host equipado.
      if (blockedTreasures.has(r.sourceNote)) {
        rejectedRules.push({ rule: r, result: { applied: false, reason: 'aplicavel-a-bloqueado' } })
        continue
      }
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

  // App-side (bug #5): anota cada option dos Selecionar com a PASTA da nota
  // (linha da essência — convenção estrutural da vault) e o rank (`rank::`
  // inline, senão subtype). A projeção usa isso pro filtro de elegibilidade
  // por linhagem (Experiente exige a Adepta da mesma pasta). Docs saem do
  // resolver (mesmo cache do BFS).
  for (const desc of resolvedChoices.values()) {
    if (desc.kind !== 'complementar-sel') continue
    desc.optionsMeta = await Promise.all(
      desc.options.map(async (opt) => {
        const doc = await resolver(wikilinkBasename(opt))
        if (!doc) return { option: opt, folder: '', rank: '' }
        const folder = doc.id.includes('/') ? doc.id.slice(0, doc.id.lastIndexOf('/')) : ''
        const inline = linkLabel(str((doc.inlineFields ?? {})['rank']))
        return { option: opt, folder, rank: rankGroupLabel(inline || str(doc.subtype ?? '')) }
      }),
    )
  }

  // CA satélite: materializa o nível do tutor no calculated — mirror do
  // `calculated["Nível"] = tutorNivel` do plugin (sync-ca-tutor-nivel.ts:60);
  // o merge-calculated leva pro derivedFm (NVL do perfil/topbar).
  if (tutorNivel !== null && tutorNivel !== baseModel.meta.nivel) {
    deltas['Nível'] = tutorNivel
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
