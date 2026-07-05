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
  /** Deltas convergidos (debug/testes). */
  calculated: Deltas
}

/** Monta a projeção a partir do resultado do extract + catálogo — espelho
 *  do miolo de buildViewModel (plugin view-model.ts:342-390). */
export function buildHeroProjection(
  model: RulesModel,
  result: HeroRulesResult,
  catalog: Catalog,
): HeroProjection {
  const calculated = result.calculated
  const periciasCov = coveredPericias(calculated)
  const oficiosCov = coveredOficios(calculated)
  const principalAllowed = derivePrincipalAllowed(calculated)
  const annotated = annotateSubclassChoices(result.choices, result.visitedDocs)

  const linked = (wl: string): LinkedOption => ({ value: wl, label: linkLabel(wl) })

  const passadoOficioPick = (model.meta.passadoOficio ?? null) as OficioPassadoValue | null

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
    calculated,
  }
}
