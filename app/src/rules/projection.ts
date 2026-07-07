// Projeção "opções visíveis/elegíveis por slot" pro Editável do app —
// ESPELHO do vm.derived do plugin pleitost-autosheet (src/render/
// view-model.ts:buildViewModel) + dos vault scans que o alimentam
// (src/cola/yaml-block-deps-factory.ts / process-yaml-vault-scans.ts).
// Componentes só leem daqui; nenhum call-site inventa opção/label.
import type { Catalog } from '../data/catalog'
import type { VaultDoc } from '../data/types'
import type { RulesModel, AtributoId } from './rules-model'
import { ATRIBUTOS } from './rules-model'
import type { Deltas } from './rule-applier'
import type { ParsedRule } from './rule-types'
import { mergeCalculatedIntoFm } from './merge-calculated'
import type { ChoiceDescriptor } from './resolve-choices'
import type { HeroRulesResult } from './extract'
import {
  coveredOficios,
  coveredPericias,
  oficiosPassadoOptions,
  periciasPassadoOptions,
  type OficioPassadoValue,
  type OficioPassadoOption,
  type PericiaOption,
} from './passado-options'
import { listLocalizacoes, naturalidadeSelectLines, type NaturalidadeLine } from './naturalidade'
import { linkLabel } from '../markdown/dataview-value'

/** Espelho de withAlias (plugin util/wikilink.ts:129-137). */
export function withAlias(wl: string, shortFn: (target: string) => string): string {
  const m = wl.match(/^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/)
  if (!m) return wl
  if (m[2]) return wl
  const target = m[1]
  const short = shortFn(target).trim()
  if (!short || short === target) return wl
  return `[[${target}|${short}]]`
}

/** Espelho de shortSubclassName (plugin util/wikilink.ts:141-144). */
export function shortSubclassName(target: string): string {
  const m = target.match(/\(([^)]+)\)\s*$/)
  return m ? m[1].trim() : target
}

/** Espelho de shortSintoniaName (plugin util/wikilink.ts:147-149). */
export function shortSintoniaName(target: string): string {
  const m = target.match(/^Traço Elemental d[aeo]\s+(.+)$/i)
  return m ? m[1].trim() : target
}

/** Pasta-fonte das classes de Heroi — espelho de classesPathPrefix
 *  (plugin cola/process-yaml-vault-scans.ts:50-55). */
const CLASSES_PATH_PREFIX = 'Sistema/Criação de Personagem/Classes/'

/** Scan de notas por categoria via índice do vault-data (type/subtype =
 *  categoria/subcategoria) — espelho de listNotesByCategoria (plugin
 *  cola/yaml-block-deps-factory.ts:172-201): devolve `[[NomeBase]]`
 *  ordenados pt-BR; subcategoria null exige subtype ausente. */
function listNotesByCategoria(
  catalog: Catalog,
  categoria: string,
  opts?: { pathPrefix?: string; subcategoria?: string | null },
): string[] {
  const out: string[] = []
  for (const entry of catalog.docsByType.get(categoria) ?? []) {
    if (opts?.pathPrefix && !entry.path.startsWith(opts.pathPrefix)) continue
    if (opts && 'subcategoria' in opts) {
      const raw = entry.subtype
      const isNullish = raw == null || String(raw).trim() === '' || String(raw).trim().toLowerCase() === 'null'
      if (opts.subcategoria === null) {
        if (!isNullish) continue
      } else if (String(raw ?? '').trim() !== opts.subcategoria) continue
    }
    const base = entry.basename ?? entry.id.split('/').pop() ?? ''
    if (base) out.push(`[[${base}]]`)
  }
  out.sort((a, b) => a.localeCompare(b, 'pt-BR'))
  return out
}

/** Slug NFD-strip — mesmo toSlug do plugin (util/display-names.ts), usado
 *  pra converter o display da pasta de especialização ("Sobrevivência") no
 *  PericiaId ("Sobrevivencia") como o bySlug do view-model (plugin
 *  view-model.ts:368). */
function slugifyNome(s: string): string {
  return String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '')
}

/** Pasta-fonte das especializações/maestrias — espelho do prefixo de
 *  listEspecializacoesByPericia (plugin cola/yaml-block-deps-factory.ts:
 *  222-253). */
const ESPECIALIZACOES_PATH_PREFIX =
  'Sistema/Regras/Perícias e Especializações/Especialização e Maestria/'

/** Scan das notas de Especialização/Maestria agrupadas por perícia —
 *  espelho de listEspecializacoesByPericia: notas `categoria: Regra` sob o
 *  prefixo, agrupadas por `subcategoria` e pela PRIMEIRA pasta após o
 *  prefixo (= display da perícia, convertido pra slug PericiaId); valores
 *  `[[Basename]]` ordenados pt-BR. */
export function listEspecializacoesByPericia(catalog: Catalog): {
  especializacoes: Record<string, string[]>
  maestrias: Record<string, string[]>
} {
  const especializacoes: Record<string, string[]> = {}
  const maestrias: Record<string, string[]> = {}
  for (const entry of catalog.docsByType.get('Regra') ?? []) {
    if (!entry.path.startsWith(ESPECIALIZACOES_PATH_PREFIX)) continue
    const sub = String(entry.subtype ?? '').trim()
    const bucket =
      sub === 'Especialização' ? especializacoes : sub === 'Maestria' ? maestrias : null
    if (!bucket) continue
    const rest = entry.path.slice(ESPECIALIZACOES_PATH_PREFIX.length)
    const periciaDisplay = rest.split('/')[0] ?? ''
    if (!periciaDisplay || !rest.includes('/')) continue
    const base = entry.basename ?? entry.id.split('/').pop() ?? ''
    if (!base) continue
    const slug = slugifyNome(periciaDisplay)
    ;(bucket[slug] ??= []).push(`[[${base}]]`)
  }
  for (const map of [especializacoes, maestrias]) {
    for (const key of Object.keys(map)) map[key].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }
  return { especializacoes, maestrias }
}

// ───────────────── fontes de regra por path (tooltips de Fonte) ─────────────────

/** Espelho de computeSources (plugin extract/rule-elements-extractor.ts:
 *  756-767): targetRaw → sourceNotes das rules APLICADAS cujo target chegou
 *  aos deltas. Constraints (`escolher`) escrevem em `__constraint__<target>`
 *  — registradas sob essa chave, como o applier do plugin. */
export function computeRuleSources(
  appliedRules: ParsedRule[],
  deltas: Deltas,
): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const r of appliedRules) {
    const a = r.action
    let targetKey = 'targetRaw' in a ? (a as { targetRaw?: string }).targetRaw ?? null : null
    if (!targetKey) continue
    if (!(targetKey in deltas)) {
      const constraintKey = `__constraint__${targetKey}`
      if (!(constraintKey in deltas)) continue
      targetKey = constraintKey
    }
    const cur = out.get(targetKey) ?? []
    if (!cur.includes(r.sourceNote)) cur.push(r.sourceNote)
    out.set(targetKey, cur)
  }
  return out
}

/** Mapeia campo capitalizado do target → campo camelCase do model — espelho
 *  de PERICIA_FIELD/SIMPLE_FIELD (plugin diff/target-to-model-path.ts). */
const TARGET_FIELD: Record<string, string> = {
  Proficiencia: 'proficiencia',
  Atributo: 'atributo',
  Bonus_Item: 'bonusItem',
  Bonus_Especial: 'bonusEspecial',
  Especializacao: 'especializacao',
  Maestria: 'maestria',
  Complemento: 'complemento',
}

const LISTA_TARGET_RX =
  /^(Pericias|Oficios|Defesas_Resistencias|Sentidos|Movimento)\.Lista\.([^.*[\]]+)\.([^.]+)$/

const LISTA_NAMESPACE: Record<string, string> = {
  Pericias: 'pericias',
  Oficios: 'oficios',
  Defesas_Resistencias: 'defesasResistencias',
  Sentidos: 'sentidos',
  Movimento: 'movimento',
}

/** Espelho (subset usado pelos tooltips da ficha) de targetToModelPath
 *  (plugin diff/target-to-model-path.ts): targets das 5 listas de
 *  proficiência + Ataques.Proficiencia + proficiências de equipamento. */
export function targetToModelPath(targetRaw: string): string | null {
  const lista = LISTA_TARGET_RX.exec(targetRaw)
  if (lista) {
    const [, ns, nome, field] = lista
    return `${LISTA_NAMESPACE[ns]}.${nome}.${TARGET_FIELD[field] ?? field}`
  }
  if (targetRaw === 'Ataques.Proficiencia') return 'ataques.proficiencia'
  // Espelho do case "atributo" do plugin (target-to-model-path.ts:92-95):
  // `Definir Atributos.Principal X` também alimenta o path do tooltip.
  if (targetRaw === 'Atributos.Principal') return 'atributoPrincipal'
  const armadura = /^Inventario\.Armadura\.Proficiencia\.([^.]+)$/.exec(targetRaw)
  if (armadura) return `inventario.armadura.proficiencias.${armadura[1]}`
  if (targetRaw === 'Inventario.Escudo.Proficiencia') return 'inventario.escudo.proficiencia'
  // Segmento MINÚSCULO (simples/marciais/especificas) — espelho de
  // resolveInventario (plugin rule-target-registry.ts:246-252:
  // `armasProf[1].toLowerCase()`).
  const armas = /^Inventario\.Armas\.Proficiencia\.(Simples|Marciais|Especificas)$/.exec(targetRaw)
  if (armas) return `inventario.armas.proficiencia.${armas[1].toLowerCase()}`
  return null
}

/** Espelho de typeForPath (plugin view-model.ts:400-408): `.bonusItem` vem
 *  SEMPRE de equipamento/tesouro; o resto é Regra. */
function typeForPath(modelPath: string): 'Tesouro' | 'Regra' {
  return modelPath.endsWith('.bonusItem') ? 'Tesouro' : 'Regra'
}

/** Espelho de deriveRuleSourcesByPath (plugin view-model.ts:410-455):
 *  source canônico `Tipo.[[<basename>]]` por path do model; a restrição de
 *  Atributo Principal sai sob `atributoPrincipal`. */
export function deriveRuleSourcesByPath(sources: Map<string, string[]>): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  const append = (path: string, sourceNotes: string[]): void => {
    const type = typeForPath(path)
    const builds = sourceNotes.map((n) => {
      const last = n.split('/').pop() ?? n
      const base = last.replace(/\.md$/i, '')
      return `${type}.[[${base}]]`
    })
    const seen = new Set<string>(out[path] ?? [])
    const merged = [...(out[path] ?? [])]
    for (const b of builds) {
      if (seen.has(b)) continue
      seen.add(b)
      merged.push(b)
    }
    out[path] = merged
  }
  for (const [targetRaw, sourceNotes] of sources) {
    if (targetRaw === '__constraint__Atributos.Principal') {
      append('atributoPrincipal', sourceNotes)
      continue
    }
    const path = targetToModelPath(targetRaw)
    if (!path) continue
    append(path, sourceNotes)
  }
  return out
}

const NAEM = new Set(['N', 'A', 'E', 'M'])

/** Espelho de deriveSourcesPerRank (plugin view-model.ts:461-495) com o
 *  byRank derivado das rules aplicadas: pra cada `Definir <X>.Proficiencia
 *  <rank>` aplicado, registra `[[basename]]` no rank — inclui TODAS as
 *  tentativas (mesmo perdedoras do max-merge), como o deltaSources.byRank
 *  do plugin. */
export function deriveSourcesPerRank(
  appliedRules: ParsedRule[],
): Record<string, Partial<Record<'N' | 'A' | 'E' | 'M', string[]>>> {
  const out: Record<string, Partial<Record<'N' | 'A' | 'E' | 'M', string[]>>> = {}
  for (const r of appliedRules) {
    const a = r.action
    if (a.kind !== 'definir') continue
    if (!a.targetRaw.endsWith('.Proficiencia') && a.targetRaw !== 'Ataques.Proficiencia') continue
    const rank = a.valueRaw.trim().toUpperCase()
    if (!NAEM.has(rank)) continue
    const path = targetToModelPath(a.targetRaw)
    if (!path) continue
    const base = `[[${(r.sourceNote.split('/').pop() ?? r.sourceNote).replace(/\.md$/i, '')}]]`
    const entry = (out[path] ??= {})
    const list = (entry[rank as 'N' | 'A' | 'E' | 'M'] ??= [])
    if (!list.includes(base)) list.push(base)
  }
  return out
}

/** Célula da linha de Atributos do Editável — espelho de renderAttrBox
 *  (plugin render/groups/perfil-card.ts:598-700): ranks 3-1 com cascata
 *  (rank N exclui atributos usados em ranks > N), rank 3 respeita
 *  `principalAllowed`, editável só com 2+ opções; rank 0 residual readonly. */
export interface AtributoCell {
  rank: 3 | 2 | 1 | 0
  /** Atributo atual do slot (null = FM incompleto). */
  current: AtributoId | null
  /** Opções elegíveis; select só quando length >= 2 (canChoose do plugin). */
  options: AtributoId[]
  isPrincipal: boolean
}

export function atributoCells(
  atributos: Record<AtributoId, number>,
  principal: AtributoId | null,
  principalAllowed: AtributoId[] | null,
): AtributoCell[] {
  const attrByRank = (rank: number): AtributoId | null =>
    ATRIBUTOS.find((a) => atributos[a] === rank) ?? null
  const out: AtributoCell[] = []
  for (const rank of [3, 2, 1] as const) {
    const currentAttr = attrByRank(rank)
    const excluded = new Set<AtributoId>()
    for (const r of [3, 2, 1] as const) {
      if (r <= rank) break
      const a = attrByRank(r)
      if (a) excluded.add(a)
    }
    const allowed =
      rank === 3 && principalAllowed && principalAllowed.length > 0 ? new Set(principalAllowed) : null
    const options = ATRIBUTOS.filter((a) => !excluded.has(a) && (!allowed || allowed.has(a)))
    out.push({
      rank,
      current: currentAttr ?? options[0] ?? null,
      options,
      isPrincipal: rank === 3 && currentAttr !== null && currentAttr === principal,
    })
  }
  // Rank 0 residual — sempre readonly (perfil-card.ts:689-699).
  const used = new Set(out.map((c) => c.current).filter(Boolean) as AtributoId[])
  const rem = ATRIBUTOS.find((a) => !used.has(a)) ?? null
  out.push({ rank: 0, current: rem, options: [], isPrincipal: false })
  return out
}

/** Troca de atributo com SWAP determinístico — espelho de applyChange
 *  (plugin perfil-card.ts:621-634). Devolve o novo mapa + principal. */
export function swapAtributo(
  atributos: Record<AtributoId, number>,
  rank: 1 | 2 | 3,
  newAttr: AtributoId,
): { atributos: Record<AtributoId, number>; principal: AtributoId } {
  const next: Record<AtributoId, number> = { ...atributos }
  const oldAttr = ATRIBUTOS.find((a) => atributos[a] === rank) ?? null
  if (oldAttr !== newAttr) {
    const oldRankOfNewAttr = next[newAttr]
    next[newAttr] = rank
    if (oldAttr) next[oldAttr] = oldRankOfNewAttr
  }
  const principal = ATRIBUTOS.find((a) => next[a] === 3) ?? newAttr
  return { atributos: next, principal }
}

/** Espelho de deriveprincipalAllowed (plugin view-model.ts:768-775). */
function derivePrincipalAllowed(calculated: Deltas): AtributoId[] | null {
  const raw = calculated['__constraint__Atributos.Principal']
  if (!Array.isArray(raw)) return null
  const allowed = raw.filter((a): a is AtributoId => a === 'FOR' || a === 'AGI' || a === 'INT' || a === 'PRE')
  return allowed.length > 0 ? allowed : null
}

/** Espelho de annotateSubclassChoices (plugin cola/enrichments.ts:152-164):
 *  isSubclass quando a SOURCE NOTE (pai) tem `subcategoria: Subclasse`. */
function annotateSubclassChoices(
  choices: ChoiceDescriptor[],
  visitedDocs: Map<string, VaultDoc>,
): ChoiceDescriptor[] {
  return choices.map((c) => {
    const baseName = c.sourceNote.split('/').pop()?.replace(/\.md$/i, '') ?? ''
    const doc = visitedDocs.get(baseName)
    const subcat = String(doc?.frontmatter?.['subcategoria'] ?? doc?.subtype ?? '').trim()
    return { ...c, isSubclass: subcat === 'Subclasse' }
  })
}

/** Opção de dropdown pronta pro render (valor FM + rótulo de exibição). */
export interface LinkedOption {
  /** Valor como o FM grava (wikilink com alias curto quando aplicável). */
  value: string
  label: string
}

export interface HeroProjection {
  /** Dropdown de Classe — vault scan (process-yaml-vault-scans.ts:50-55). */
  classes: LinkedOption[]
  /** Dropdown de Sintonia — Traços raiz com alias curto (perfil-card.ts:514-522). */
  sintonias: LinkedOption[]
  /** True quando uma rule define Sintonia (metaRuleLocked, view-model.ts:362-364). */
  sintoniaRuleLocked: boolean
  /** Escolhas de subclasse (isSubclass) pro cartão de perfil (tab-perfil.ts:78). */
  subclassChoices: Array<{
    choiceKey: string
    /** Basename da nota pai (label da seção — perfil-card.ts:439). */
    parent: string
    /** Opções com alias curto (perfil-card.ts:441). */
    options: LinkedOption[]
    /** Pick atual (alias curto aplicado) ou null. */
    pick: string | null
    pickSource: ChoiceDescriptor['source']
  }>
  /** Demais escolhas (aba Habilidades) — mantidas pra consumo futuro. */
  habilidadeChoices: ChoiceDescriptor[]
  /** Restrição do Atributo Principal (`Escolher Atributos.Principal ...`). */
  principalAllowed: AtributoId[] | null
  /** Células da linha de Atributos (cascata + principal). */
  atributos: AtributoCell[]
  /** Opções de Perícia pelo Passado (passado-options.ts). */
  periciasPassado: PericiaOption[]
  passadoPericiaPick: string | null
  /** Opções de Ofício pelo Passado. */
  oficiosPassado: OficioPassadoOption[]
  passadoOficioPick: OficioPassadoValue | null
  /** Linhas do dropdown de Naturalidade (árvore do Atlas). */
  naturalidadeLines: NaturalidadeLine[]
  /** Fontes canônicas `Tipo.[[base]]` por path do model (tooltips de Fonte)
   *  — espelho de vm.derived.ruleSourcesByPath do plugin. */
  ruleSourcesByPath: Record<string, string[]>
  /** Fontes `[[base]]` por rank pros NAEM rule-driven (defesas/sentidos/
   *  ataque) — espelho de vm.derived.sourcesPerRank do plugin. */
  sourcesPerRank: Record<string, Partial<Record<'N' | 'A' | 'E' | 'M', string[]>>>
  /** Opções de Especialização por PericiaId (`[[Nome]]`) — espelho de
   *  vm.derived.especializacaoOptions (scan da vault). */
  especializacaoOptions: Record<string, string[]>
  /** Opções de Maestria por PericiaId — espelho de maestriaOptions. */
  maestriaOptions: Record<string, string[]>
  /** Deltas convergidos (debug/testes). */
  calculated: Deltas
  /** FM DERIVADO = FM salvo + calculated mesclado (mesmo shape do FM). As abas
   *  leem daqui pra render LIVE com cascata — espelho de vm.model do Editável
   *  (finalVolatile.sheetVolatile = propMem ⊕ calculated ⊕ userEdits). */
  derivedFm: Record<string, unknown>
}

/** Monta a projeção a partir do resultado do extract + catálogo — espelho
 *  do miolo de buildViewModel (plugin view-model.ts:342-390). */
export function buildHeroProjection(
  model: RulesModel,
  result: HeroRulesResult,
  catalog: Catalog,
  savedFm: Record<string, unknown>,
): HeroProjection {
  const calculated = result.calculated
  const periciasCov = coveredPericias(calculated)
  const oficiosCov = coveredOficios(calculated)
  const principalAllowed = derivePrincipalAllowed(calculated)
  const annotated = annotateSubclassChoices(result.choices, result.visitedDocs)

  const linked = (wl: string): LinkedOption => ({ value: wl, label: linkLabel(wl) })

  const passadoOficioPick = (model.meta.passadoOficio ?? null) as OficioPassadoValue | null

  const ruleSources = computeRuleSources(result.appliedRules, calculated)
  const espMaes = listEspecializacoesByPericia(catalog)

  return {
    classes: listNotesByCategoria(catalog, 'Classe', { pathPrefix: CLASSES_PATH_PREFIX }).map(linked),
    sintonias: listNotesByCategoria(catalog, 'Sintonia', { subcategoria: null })
      .map((wl) => withAlias(wl, shortSintoniaName))
      .map(linked),
    sintoniaRuleLocked: calculated['Sintonia'] !== undefined,
    subclassChoices: annotated
      .filter((c) => c.isSubclass)
      .map((c) => ({
        choiceKey: c.choiceKey,
        parent: c.sourceNote.split('/').pop()?.replace(/\.md$/i, '') ?? '',
        options: c.options.map((o) => linked(withAlias(o, shortSubclassName))),
        pick: c.pick ? withAlias(c.pick, shortSubclassName) : null,
        pickSource: c.source,
      })),
    habilidadeChoices: annotated.filter((c) => !c.isSubclass),
    principalAllowed,
    atributos: atributoCells(model.atributos, model.atributoPrincipal, principalAllowed),
    periciasPassado: periciasPassadoOptions(model.meta.passadoPericia, periciasCov),
    passadoPericiaPick: model.meta.passadoPericia,
    oficiosPassado: oficiosPassadoOptions(passadoOficioPick, oficiosCov),
    passadoOficioPick,
    naturalidadeLines: naturalidadeSelectLines(listLocalizacoes(catalog)),
    ruleSourcesByPath: deriveRuleSourcesByPath(ruleSources),
    sourcesPerRank: deriveSourcesPerRank(result.appliedRules),
    especializacaoOptions: espMaes.especializacoes,
    maestriaOptions: espMaes.maestrias,
    calculated,
    derivedFm: mergeCalculatedIntoFm(savedFm, calculated, result.appliedRules),
  }
}
