// Glue: FM salvo do herói + docs da vault → inputs da engine espelhada
// (EngineModel, catálogo de condições, descriptors, armaPropsLookup) →
// ConditionContext final. Fontes idênticas às do plugin pleitost-autosheet:
//   - catálogo runtime: Sistema/Regras/Condições/* com FM `Elementos_de_Regra`
//     (plugin cola/yaml-block-deps-factory.ts:listCondicoes)
//   - descriptors: blocos FM `Efeitos_Interativos` das notas referenciadas
//     pelo modelo (habilidades/técnicas/ações/magias/armas/propriedades/
//     tesouros — plugin coleta via BFS; aqui via referências do FM salvo),
//     + blocos das próprias condições (extractCondicoesGlobaisEfeitos),
//     + builtins (Acerto Decisivo) + Erguer Escudo (ação universal do
//     toggle ERGUER do design),
//   - contexto final: mergeContexts(buildConditionContext, buildEffectContext)
//     (plugin mount-interativa-context.ts:computeCtx).
// FORA DO ESCOPO (gaps documentados): formas ferais do Druida, invocações,
// efeitos compartilhados de aliados (sharedFrom — app é single-hero).
import type { VaultDoc } from '../data/types'
import {
  fmOf,
  fmPath,
  heroAtributos,
  listaEntries,
  num,
  parseItemAlias,
  str,
  tierLetter,
  wikiTarget,
} from '../components/ficha/hero-model'
import { TIER_NOME } from '../components/ficha/registry'
import type { ConditionContext, Proficiencia } from './condition-context'
import { buildCatalog, buildConditionContext, type ConditionCatalog } from './build-condition-context'
import { parseConditionRules, type ParsedConditionEntry } from './parse-condition-rule'
import { blocoParaDescritor, blocoTier, BUILTIN_EFEITOS_BLOCOS, type EffectDescriptor } from './descriptor'
import { buildEffectContext } from './build-effect-context'
import { makeArmaPropsLookup, wikilinkBasename, type ArmaPropsLookup, type EngineModel } from './guard-evaluator'
import { mergeContexts } from './merge'
import { isCondicaoOn } from './state'

export type RefDoc = (value: unknown) => VaultDoc | undefined

/** Pasta das condições do sistema (fonte dos `Elementos_de_Regra`). */
export const CONDICOES_FOLDER = 'Sistema/Regras/Condições/'

/** Ação universal do toggle ERGUER do design (Estado "Escudo Erguido"). */
export const ERGUER_ESCUDO_ID = 'Sistema/Regras/Ações/Ações Especiais/Erguer Escudo'

// ──────────────────────────────────────────────────────────────────────────
// EngineModel a partir do FM (com overlay aplicado)
// ──────────────────────────────────────────────────────────────────────────

export function buildEngineModel(fm: Record<string, unknown>, descriptors: readonly EffectDescriptor[]): EngineModel {
  const { values: attrs } = heroAtributos(fm)
  const inter = (fm['Interativa'] ?? {}) as Record<string, unknown>
  const rest = (inter['Recursos_Restantes'] ?? {}) as Record<string, unknown>
  const condicoesAtivas = { ...((inter['Condicoes_Ativas'] ?? {}) as Record<string, unknown>) }
  const efeitosAtivos = { ...((inter['Efeitos_Ativos'] ?? {}) as Record<string, unknown>) }
  const seletores = { ...((inter['Seletores'] ?? {}) as Record<string, unknown>) }

  const armasLista = ((fmPath(fm, 'Inventario', 'Armas', 'Lista') ?? []) as Record<string, unknown>[])
    .map((a) => ({ nome: str(a['Nome']), bonusItem: num(a['Bonus_Item']) }))
    .filter((a) => a.nome)
  const escudoFm = (fmPath(fm, 'Inventario', 'Escudo') ?? {}) as Record<string, unknown>

  const vidaMax = (fm['Vida'] ?? {}) as Record<string, unknown>
  const vit = rest['Vitalidade'] !== undefined ? num(rest['Vitalidade']) : num(vidaMax['Vitalidade'])
  const moral = rest['Moral'] !== undefined ? num(rest['Moral']) : num(vidaMax['Moral'])
  const emMax = num(fmPath(fm, 'Magias', 'EM'))
  const em = rest['EM'] !== undefined ? num(rest['EM']) : emMax

  const potencia = num(fmPath(fm, 'Magias', 'Potencia'))

  const model: EngineModel = {
    meta: { nivel: num(fm['Nível']) || 1 },
    atributos: { FOR: attrs['FOR'], AGI: attrs['AGI'], INT: attrs['INT'], PRE: attrs['PRE'] },
    ataques: { proficiencia: profOf(str(fmPath(fm, 'Ataques', 'Proficiencia'))) },
    magias: { potencia },
    inventario: {
      armas: { lista: armasLista },
      escudo: {
        nome: str(escudoFm['Nome']),
        propriedade: str(escudoFm['Propriedade']),
        categoria: str(escudoFm['Categoria']),
      },
    },
    interativa: {
      condicoesAtivas,
      efeitosAtivos,
      seletores,
      recursosRestantes: {
        vitalidade: vit,
        moral,
        moralTemporaria: num(rest['Moral_Temporaria']),
        em,
        escudoDano: num(rest['Escudo_Dano']),
      },
    },
  }

  // Overlay de seletores derivado (plugin tab-recursos → RuntimeOverlay.seletores,
  // mount-interativa-context.ts:93-98): pra cada descritor com numericSelector
  // cuja condição está ativa, garante `seletores[<key>::<label>]` a partir do
  // numericSelector do estado; default da Potência Mágica = magias.potencia.
  for (const desc of descriptors) {
    const sel = desc.numericSelector
    if (!sel) continue
    const key = desc.sharedFrom ? `${desc.label}::${desc.sharedFrom}` : desc.label
    const selKey = `${key}::${sel.label}`
    if (seletores[selKey] !== undefined) continue
    const st = condicoesAtivas[key]
    if (!isCondicaoOn(st)) continue
    if (st && typeof st === 'object' && 'numericSelector' in st) {
      const ns = (st as { numericSelector?: number }).numericSelector
      if (typeof ns === 'number') {
        seletores[selKey] = ns
        continue
      }
    }
    const isPotencia = sel.label.toLowerCase().replace(/\s/g, '') === 'potênciamágica' ||
      sel.label.toLowerCase().replace(/\s/g, '') === 'potenciamagica'
    if (isPotencia) seletores[selKey] = potencia
  }

  return model
}

function profOf(p: string): Proficiencia {
  return p === 'A' || p === 'E' || p === 'M' ? p : 'N'
}

// ──────────────────────────────────────────────────────────────────────────
// Catálogo de condições (Elementos_de_Regra)
// ──────────────────────────────────────────────────────────────────────────

/** True quando o doc é uma condição do sistema (plugin listCondicoes filtra
 *  categoria Regra + subcategoria Condição). */
export function isCondicaoDoc(doc: VaultDoc): boolean {
  const fm = fmOf(doc)
  return str(fm['categoria']) === 'Regra' && str(fm['subcategoria']) === 'Condição'
}

export function conditionCatalogFromDocs(condDocs: readonly VaultDoc[]): ConditionCatalog {
  const entries: ParsedConditionEntry[] = []
  for (const doc of condDocs) {
    if (!isCondicaoDoc(doc)) continue
    const rules = fmOf(doc)['Elementos_de_Regra']
    entries.push(parseConditionRules(doc.basename ?? doc.id, Array.isArray(rules) ? rules : []))
  }
  return buildCatalog(entries)
}

// ──────────────────────────────────────────────────────────────────────────
// Descriptors (blocos Efeitos_Interativos)
// ──────────────────────────────────────────────────────────────────────────

/** Alvos de wikilink do FM cujos docs podem declarar Efeitos_Interativos —
 *  espelha o alcance do BFS do plugin restrito ao modelo salvo. */
export function collectEffectTargets(fm: Record<string, unknown>): string[] {
  const out = new Set<string>()
  const push = (value: unknown) => {
    const target = wikiTarget(str(value))
    if (target) out.add(target)
  }
  push(fm['Classe'])
  push(fm['Sintonia'])
  const armas = fmPath(fm, 'Inventario', 'Armas', 'Lista')
  if (Array.isArray(armas)) {
    for (const arma of armas as Record<string, unknown>[]) {
      push(arma['Nome'])
      push(arma['Propriedade'])
    }
  }
  push(fmPath(fm, 'Inventario', 'Armadura', 'Nome'))
  push(fmPath(fm, 'Inventario', 'Armadura', 'Propriedade'))
  push(fmPath(fm, 'Inventario', 'Escudo', 'Nome'))
  push(fmPath(fm, 'Inventario', 'Escudo', 'Propriedade'))
  for (const t of (fmPath(fm, 'Inventario', 'Tesouros') as unknown[]) ?? []) push(t)
  for (const c of (fmPath(fm, 'Inventario', 'Consumiveis') as unknown[]) ?? []) push(c)
  for (const entry of listaEntries(fmPath(fm, 'Habilidades', 'Lista'))) out.add(entry.target)
  for (const entry of listaEntries(fmPath(fm, 'Tecnicas', 'Lista'))) out.add(entry.target)
  for (const entry of listaEntries(fmPath(fm, 'Acoes', 'Lista'))) out.add(entry.target)
  const escolas = fmPath(fm, 'Magias', 'Lista')
  if (Array.isArray(escolas)) {
    for (const escola of escolas as Record<string, unknown>[]) {
      for (const entry of listaEntries(escola['Lista'])) out.add(entry.target)
    }
  }
  return [...out]
}

/** Tiers que o herói possui de cada doc (basename → nomes de tier) —
 *  gate das entries `tier:` (Imbuição Incendiária/Congelante). */
function ownedTiersByDoc(fm: Record<string, unknown>): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>()
  const add = (basename: string, tierNome: string | null) => {
    if (!basename || !tierNome) return
    const set = map.get(basename) ?? new Set<string>()
    set.add(tierNome)
    map.set(basename, set)
  }
  const armas = fmPath(fm, 'Inventario', 'Armas', 'Lista')
  if (Array.isArray(armas)) {
    for (const arma of armas as Record<string, unknown>[]) {
      const propTarget = wikiTarget(str(arma['Propriedade']))
      const tier = tierLetter(arma['Categoria'])
      add(propTarget.split('/').pop() ?? '', tier ? TIER_NOME[tier] : null)
    }
  }
  for (const t of (fmPath(fm, 'Inventario', 'Tesouros') as unknown[]) ?? []) {
    const { nome, tier } = parseItemAlias(t)
    add(nome, tier ? TIER_NOME[tier] : null)
  }
  return map
}

export interface DescriptorSources {
  /** FM (com overlay) do herói. */
  fm: Record<string, unknown>
  /** Resolvedor wikilink→doc (mesma semântica do HeroRefs.refDoc). */
  refDoc: RefDoc
  /** Docs da pasta Sistema/Regras/Condições (blocos + Elementos_de_Regra). */
  condicaoDocs: readonly VaultDoc[]
  /** Docs universais extras (Erguer Escudo). */
  extraDocs?: readonly VaultDoc[]
}

/** Coleta TODOS os descriptors visíveis pro herói (efeitos das notas
 *  referenciadas + condições globais + builtins). Dedup por
 *  (label, sourceNote) — a mesma nota alcançada por 2 referências não
 *  duplica; labels iguais de notas DIFERENTES coexistem (paridade plugin:
 *  Auto-Confiança da habilidade + do Estilo de Combate). */
export function collectDescriptors(sources: DescriptorSources): EffectDescriptor[] {
  const { fm, refDoc, condicaoDocs, extraDocs } = sources
  const out: EffectDescriptor[] = []
  const seen = new Set<string>()
  const owned = ownedTiersByDoc(fm)

  const seenDocs = new Set<string>()
  const pushDoc = (doc: VaultDoc | undefined) => {
    if (!doc || seenDocs.has(doc.id)) return
    seenDocs.add(doc.id)
    // Propriedades intrínsecas das armas (inline `propriedades::` do doc da
    // arma — Apunhalante etc.) também declaram efeitos; o BFS do plugin as
    // alcança via links da nota da arma.
    if (str(fmOf(doc)['categoria']) === 'Equipamento' || doc.id.includes('/Armas/')) {
      const propsRaw = str((doc.inlineFields as Record<string, unknown> | undefined)?.['propriedades'])
      const re = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g
      let m: RegExpExecArray | null
      while ((m = re.exec(propsRaw)) !== null) pushDoc(refDoc(`[[${m[1]}]]`))
    }
    const blocos = fmOf(doc)['Efeitos_Interativos']
    if (!Array.isArray(blocos)) return
    const sourceNote = doc.id
    const docBase = doc.basename ?? doc.id.split('/').pop() ?? doc.id
    for (const bloco of blocos) {
      // Tier-gate: entry com `tier` só entra se o herói tem o doc nesse tier.
      const tier = blocoTier(bloco)
      if (tier) {
        const tiers = owned.get(docBase)
        if (!tiers || !tiers.has(tier)) continue
      }
      const desc = blocoParaDescritor(bloco, sourceNote)
      if (!desc) continue
      const key = `${desc.label} ${sourceNote} ${tier ?? ''}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(desc)
    }
  }

  for (const target of collectEffectTargets(fm)) pushDoc(refDoc(target))
  for (const doc of condicaoDocs) pushDoc(doc)
  for (const doc of extraDocs ?? []) pushDoc(doc)
  for (const bloco of BUILTIN_EFEITOS_BLOCOS) {
    const desc = blocoParaDescritor(bloco, str(bloco['sourceNote']) || '(builtin)')
    if (desc) out.push(desc)
  }

  out.sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))
  return out
}

// ──────────────────────────────────────────────────────────────────────────
// ArmaPropsLookup a partir dos docs das armas
// ──────────────────────────────────────────────────────────────────────────

/** Labels de wikilink de um inline field ("[[A|B]], [[C]]" → raws). */
function wikiRaws(value: unknown): string[] {
  const s = str(value)
  const out: string[] = []
  const re = /\[\[[^\]]+\]\]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(s)) !== null) out.push(m[0])
  return out
}

export function armaPropsLookupFromFm(fm: Record<string, unknown>, refDoc: RefDoc): ArmaPropsLookup {
  const armas = ((fmPath(fm, 'Inventario', 'Armas', 'Lista') ?? []) as Record<string, unknown>[])
  const options: Array<{ nome: string; propriedades: string[]; grupo?: string; maos?: number }> = []
  for (const arma of armas) {
    const basename = wikilinkBasename(str(arma['Nome']))
    if (!basename) continue
    const doc = refDoc(arma['Nome'])
    const inline = (doc?.inlineFields ?? {}) as Record<string, unknown>
    const maosRaw = parseInt(str(inline['mãos']) || str(inline['maos']), 10)
    options.push({
      nome: basename,
      propriedades: wikiRaws(inline['propriedades']),
      grupo: str(fmOf(doc)['grupo']) || undefined,
      maos: Number.isFinite(maosRaw) ? maosRaw : undefined,
    })
  }
  return makeArmaPropsLookup(options)
}

// ──────────────────────────────────────────────────────────────────────────
// Contexto final (plugin mount-interativa-context.ts:computeCtx)
// ──────────────────────────────────────────────────────────────────────────

export interface InterativaComputed {
  ctx: ConditionContext
  model: EngineModel
  descriptors: EffectDescriptor[]
  catalog: ConditionCatalog
}

export function computeInterativaCtx(sources: DescriptorSources): InterativaComputed {
  const descriptors = collectDescriptors(sources)
  const model = buildEngineModel(sources.fm, descriptors)
  const catalog = conditionCatalogFromDocs(sources.condicaoDocs)
  const armaPropsLookup = armaPropsLookupFromFm(sources.fm, sources.refDoc)
  const condCtx = buildConditionContext(model.interativa.condicoesAtivas, catalog)
  const effCtx = buildEffectContext(model, descriptors, armaPropsLookup)
  return { ctx: mergeContexts(condCtx, effCtx), model, descriptors, catalog }
}

// ──────────────────────────────────────────────────────────────────────────
// Cadeia de ativação (plugin mount-tab-recursos.ts:propagateAutoStates)
// ──────────────────────────────────────────────────────────────────────────

/** Condições com `parameters.AtivaEstado X` ligam o estado X ao ativar e
 *  desligam ao desativar (só se o estado está com flag auto). Retorna o
 *  próximo mapa de efeitos (ou o mesmo objeto se nada mudou). */
export function propagateAutoStates(
  condicoes: Record<string, unknown>,
  efeitos: Record<string, unknown>,
  descriptors: readonly EffectDescriptor[],
): Record<string, unknown> {
  const byLabel = new Map<string, EffectDescriptor>()
  for (const d of descriptors) {
    if (!byLabel.has(d.label)) byLabel.set(d.label, d)
  }
  const wanted = new Map<string, string>()
  for (const [condLabel, st] of Object.entries(condicoes)) {
    if (!isCondicaoOn(st)) continue
    const desc = byLabel.get(condLabel)
    const autoState = String(desc?.parameters?.['AtivaEstado'] ?? '').trim()
    if (autoState && !wanted.has(autoState)) wanted.set(autoState, condLabel)
  }
  let changed = false
  const next: Record<string, unknown> = { ...efeitos }
  for (const [stateLabel, condLabel] of wanted) {
    const raw = next[stateLabel]
    const cur = raw && typeof raw === 'object' ? (raw as { on?: boolean; auto?: boolean; autoFrom?: string }) : undefined
    if (!cur || !cur.on) {
      next[stateLabel] = { ...(cur ?? {}), on: true, auto: true, autoFrom: condLabel }
      changed = true
    } else if (cur.auto && cur.autoFrom !== condLabel) {
      next[stateLabel] = { ...cur, autoFrom: condLabel }
      changed = true
    }
  }
  // Desliga estados auto cuja condição-fonte LOCAL desativou.
  for (const [stateLabel, st] of Object.entries(next)) {
    if (wanted.has(stateLabel)) continue
    if (!st || typeof st !== 'object') continue
    const cur = st as { on?: boolean; auto?: boolean; autoFrom?: string }
    if (!cur.on || !cur.auto) continue
    // Cascade externo (autoFrom não é condição local) — preserva.
    if (cur.autoFrom !== undefined && !(cur.autoFrom in condicoes)) continue
    if (cur.autoFrom === undefined) continue
    delete next[stateLabel]
    changed = true
  }
  return changed ? next : efeitos
}
