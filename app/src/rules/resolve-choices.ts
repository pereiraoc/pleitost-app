// Resolução de picks de `Escolha_Habilidades` — PORTA de
// src/extract/resolve-choices.ts do plugin pleitost-autosheet (mesma ordem
// de precedência: transient > inferência do estado da ficha > default).
// Pick = ESTADO: nada de Regras_Escolhas — o pick consolidado é inferido
// das listas do FM salvo via source tag `Escolha.[[<parent>]]`.
import type { ParsedRule, RuleScope } from './rule-types'
import type { RulesModel, FontedLink } from './rules-model'
import { wikilinkTarget } from './rule-applier'
import { displayName } from '../components/ficha/registry'

/** Espelho de ChoiceDescriptor (plugin resolve-choices.ts:26-59). */
export interface ChoiceDescriptor {
  choiceKey: string
  label: string
  kind: 'complementar-sel' | 'escolha-prop-map' | 'escolha-pericia-especial'
  options: string[]
  pick: string | null
  source: 'persisted' | 'inferred' | 'default' | 'none'
  sourceNote: string
  /** Anotado pela projeção (espelho de annotateSubclassChoices, plugin
   *  cola/enrichments.ts:152-164): sourceNote com subcategoria Subclasse. */
  isSubclass?: boolean
  occurrenceWithinParent?: number
  targetRaw?: string
  /** App-side (bug #5): metadados de cada option (pasta da linha + rank da
   *  nota, lidos do doc via resolver no extract) pro filtro de elegibilidade
   *  por linhagem na projeção. Ausente = sem filtro. */
  optionsMeta?: Array<{ option: string; folder: string; rank: string }>
}

/** Espelho de discoverChoices (plugin resolve-choices.ts:70-144). */
export function discoverChoices(
  rules: ParsedRule[],
  gatePasses?: (rule: ParsedRule) => boolean,
): Map<string, ChoiceDescriptor> {
  const descs = new Map<string, ChoiceDescriptor>()
  for (const r of rules) {
    const escolha = r.scope.find((s): s is Extract<RuleScope, { kind: 'escolha' }> => s.kind === 'escolha')
    if (!escolha) continue
    if (gatePasses && !gatePasses(r)) continue
    const a = r.action
    if (a.kind === 'complementar-sel') {
      descs.set(escolha.choiceKey, {
        choiceKey: escolha.choiceKey,
        label: a.label ?? escolha.label,
        kind: 'complementar-sel',
        options: a.options,
        pick: null,
        source: 'none',
        sourceNote: r.sourceNote,
        targetRaw: a.targetRaw,
      })
    } else if (a.kind === 'escolha-prop-map') {
      descs.set(escolha.choiceKey, {
        choiceKey: escolha.choiceKey,
        label: a.label,
        kind: 'escolha-prop-map',
        options: a.propMap.map((p) => p.label),
        pick: null,
        source: 'none',
        sourceNote: r.sourceNote,
      })
    } else if (a.kind === 'escolha-pericia-especial') {
      descs.set(escolha.choiceKey, {
        choiceKey: escolha.choiceKey,
        label: a.label ?? escolha.label,
        kind: 'escolha-pericia-especial',
        options: [],
        pick: null,
        source: 'none',
        sourceNote: r.sourceNote,
      })
    }
  }
  // occurrenceWithinParent — espelho do plugin resolve-choices.ts:113-142.
  const parentCounts = new Map<string, number>()
  for (const desc of descs.values()) {
    if (desc.kind !== 'escolha-pericia-especial') continue
    const idx = (parentCounts.get(desc.sourceNote) ?? 0) + 1
    parentCounts.set(desc.sourceNote, idx)
    desc.occurrenceWithinParent = idx
  }
  const selGroups = new Map<string, ChoiceDescriptor[]>()
  for (const desc of descs.values()) {
    if (desc.kind !== 'complementar-sel') continue
    const sig = `${desc.sourceNote}|${desc.label}|${[...desc.options].sort().join(',')}`
    const arr = selGroups.get(sig) ?? []
    arr.push(desc)
    selGroups.set(sig, arr)
  }
  for (const group of selGroups.values()) {
    if (group.length <= 1) continue
    group.forEach((desc, i) => {
      desc.occurrenceWithinParent = i + 1
    })
  }
  return descs
}

/** Espelho de resolveChoice (plugin resolve-choices.ts:147-232). */
export function resolveChoice(
  desc: ChoiceDescriptor,
  model: RulesModel,
  transientPicks: Record<string, string>,
): ChoiceDescriptor {
  if (desc.kind === 'escolha-pericia-especial' && desc.options.length === 0) {
    desc = { ...desc, options: eligiblePericiaEspecialOptions(model) }
  }
  const transient = transientPicks[desc.choiceKey]
  if (transient) {
    if (desc.options.length === 0) return { ...desc, pick: transient, source: 'persisted' }
    const tTarget = wikilinkTarget(transient)
    const matched = desc.options.find((opt) => wikilinkTarget(opt) === tTarget)
    if (matched) return { ...desc, pick: matched, source: 'persisted' }
  }

  if (desc.kind === 'complementar-sel') {
    const lista = pickListForComplementarSel(desc.targetRaw, model)
    const choiceBase = desc.sourceNote.split('/').pop()?.replace(/\.md$/i, '') ?? ''
    const tagged = inferByOriginTag(lista, choiceBase, desc.occurrenceWithinParent)
    if (tagged) {
      const matched = desc.options.find((opt) => wikilinkTarget(opt) === wikilinkTarget(tagged))
      if (matched) return { ...desc, pick: matched, source: 'inferred' }
    }
    // DIVERGÊNCIA CONSCIENTE do plugin (pedido do usuário, app): escolha IRMÃ
    // (occurrenceWithinParent definido = ≥2 no mesmo pai) sem tag da PRÓPRIA
    // ocorrência fica VAZIA — nada de fallback 2b nem default options[0].
    // No plugin o default é transitório (o save consolida cada pick com tag
    // indexada); o app não salva defaults, então o fallback fazia 1 pick
    // "vazar" pra todos os dropdowns irmãos ("aparece todos os dropdowns com
    // a mesma coisa"). Choices ÚNICAS mantêm 2b + default (fidelidade ao
    // plugin — dados legados sem tag dependem disso).
    if (desc.occurrenceWithinParent !== undefined) return desc
    const linkTargets = new Set(lista.map((it) => wikilinkTarget(it.link)))
    // Inferência 2b: o único item da lista que casa com as options — mas SÓ se
    // ele não carrega a tag de OUTRA escolha (#365: a "Forma Adicional" roubava
    // a Caçadora persistida pela Tradição e o default re-appendava a mesma).
    const matches = desc.options.filter((opt) => linkTargets.has(wikilinkTarget(opt)))
    if (matches.length === 1) {
      const item = lista.find((it) => wikilinkTarget(it.link) === wikilinkTarget(matches[0]!))
      const outraTag = item && /^Escolha\./.test(item.source) && !item.source.includes(`[[${choiceBase}]]`)
      if (!outraTag) return { ...desc, pick: matches[0]!, source: 'inferred' }
    }
    // #365: o DEFAULT de uma escolha de lista nunca repete uma opção JÁ TOMADA
    // na lista alvo (mesma regra do dropdown, que filtra `taken`) — duas
    // escolhas defaultando pro mesmo options[0] duplicavam a forma nas Ações.
    // Todas tomadas → sem pick (source 'none') = pendência visível (#337).
    const livre = desc.options.find((opt) => !linkTargets.has(wikilinkTarget(opt)))
    if (livre) return { ...desc, pick: livre, source: 'default' }
    return desc
  }

  if (desc.kind === 'escolha-pericia-especial' || desc.kind === 'escolha-prop-map') {
    const wanted = desc.sourceNote.split('/').pop()?.replace(/\.md$/i, '') ?? ''
    if (wanted) {
      const inferredName = inferPickFromIncrementos(model, wanted, desc.occurrenceWithinParent)
      if (inferredName) {
        const pickFinal = desc.kind === 'escolha-pericia-especial' ? displayName(inferredName) : inferredName
        return { ...desc, pick: pickFinal, source: 'inferred' }
      }
    }
  }

  if (desc.options.length > 0) {
    return { ...desc, pick: desc.options[0]!, source: 'default' }
  }
  return desc
}

/** Espelho de resolveAllChoices (plugin resolve-choices.ts:249-266). */
export function resolveAllChoices(
  discovered: Map<string, ChoiceDescriptor>,
  model: RulesModel,
  transientPicks: Record<string, string>,
): Map<string, ChoiceDescriptor> {
  const distributed = distributeSiblingPicks(discovered, model, transientPicks)
  const out = new Map<string, ChoiceDescriptor>()
  for (const [key, desc] of discovered) {
    const pre = distributed.get(key)
    if (pre) out.set(key, { ...desc, pick: pre.pick, source: pre.source })
    else out.set(key, resolveChoice(desc, model, transientPicks))
  }
  return out
}

/** Espelho de distributeSiblingPicks (plugin resolve-choices.ts:279-351). */
function distributeSiblingPicks(
  discovered: Map<string, ChoiceDescriptor>,
  model: RulesModel,
  transientPicks: Record<string, string>,
): Map<string, { pick: string; source: 'persisted' | 'inferred' | 'default' }> {
  const activeParents = new Set<string>()
  for (const it of [...model.habilidades.lista, ...model.tecnicas.lista, ...model.acoes]) {
    activeParents.add(wikilinkTarget(it.link))
  }
  const isActiveChoice = (desc: ChoiceDescriptor): boolean => {
    const base = desc.sourceNote.split('/').pop()?.replace(/\.md$/i, '') ?? ''
    return activeParents.has(base)
  }
  const groups = new Map<string, ChoiceDescriptor[]>()
  for (const desc of discovered.values()) {
    if (desc.kind !== 'complementar-sel') continue
    if (!isActiveChoice(desc)) continue
    const sig = `${desc.targetRaw ?? ''}|${[...desc.options].sort().join(',')}`
    const arr = groups.get(sig) ?? []
    arr.push(desc)
    groups.set(sig, arr)
  }
  const out = new Map<string, { pick: string; source: 'persisted' | 'inferred' | 'default' }>()
  for (const group of groups.values()) {
    if (group.length <= 1) continue
    const claimed = new Set<string>()
    const lista = pickListForComplementarSel(group[0]!.targetRaw, model)
    for (const desc of group) {
      const transient = transientPicks[desc.choiceKey]
      if (transient) {
        const tTarget = wikilinkTarget(transient)
        const matched = desc.options.find((opt) => wikilinkTarget(opt) === tTarget)
        if (matched) {
          out.set(desc.choiceKey, { pick: matched, source: 'persisted' })
          claimed.add(wikilinkTarget(matched))
          continue
        }
      }
      const choiceBase = desc.sourceNote.split('/').pop()?.replace(/\.md$/i, '') ?? ''
      const tagged = inferByOriginTag(lista, choiceBase, desc.occurrenceWithinParent)
      if (tagged) {
        const matched = desc.options.find((opt) => wikilinkTarget(opt) === wikilinkTarget(tagged))
        if (matched) {
          out.set(desc.choiceKey, { pick: matched, source: 'inferred' })
          claimed.add(wikilinkTarget(tagged))
        }
      }
    }
    const itemTargets = lista.map((it) => wikilinkTarget(it.link))
    for (const desc of group) {
      if (out.has(desc.choiceKey)) continue
      let pick: string | null = null
      for (const itemTarget of itemTargets) {
        if (claimed.has(itemTarget)) continue
        const matchedOpt = desc.options.find((opt) => wikilinkTarget(opt) === itemTarget)
        if (matchedOpt) {
          pick = matchedOpt
          claimed.add(itemTarget)
          break
        }
      }
      if (pick) out.set(desc.choiceKey, { pick, source: 'inferred' })
    }
    // Pass C (#365): DEFAULT DISTRIBUÍDO — escolhas de PAIS DIFERENTES que
    // sobraram sem pick (ficha nova, lista alvo vazia) pegam a PRIMEIRA opção
    // livre em vez de todas defaultarem options[0] (que duplicava a mesma
    // forma nas Ações — "Forma" da Tradição + "Forma Adicional"). Irmãs do
    // MESMO pai (occurrenceWithinParent definido) ficam FORA: a divergência
    // consciente do app as deixa VAZIAS (ver resolveChoice), e dar default
    // aqui contaria linhagens não escolhidas como possuídas (Elementalista).
    for (const desc of group) {
      if (out.has(desc.choiceKey)) continue
      if (desc.occurrenceWithinParent !== undefined) continue
      const livre = desc.options.find((opt) => !claimed.has(wikilinkTarget(opt)))
      if (livre) {
        claimed.add(wikilinkTarget(livre))
        out.set(desc.choiceKey, { pick: livre, source: 'default' })
      }
    }
  }
  return out
}

const PROF_RANK: Record<string, number> = { N: 0, A: 1, E: 2, M: 3 }

/** Espelho de inferByOriginTag (plugin resolve-choices.ts:359-376). */
function inferByOriginTag(
  lista: FontedLink[],
  parentBase: string,
  occurrence: number | undefined,
): string | null {
  if (!parentBase) return null
  const esc = parentBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (occurrence !== undefined) {
    const nn = String(occurrence).padStart(2, '0')
    const exactNN = new RegExp(`^Escolha\\.${nn}\\.\\[\\[${esc}\\]\\]$`)
    const m = lista.find((it) => exactNN.test(it.source))
    if (m) return m.link
  }
  const noNN = new RegExp(`^Escolha\\.\\[\\[${esc}\\]\\]$`)
  const m = lista.find((it) => noNN.test(it.source))
  return m ? m.link : null
}

/** Espelho de pickListForComplementarSel (plugin resolve-choices.ts:382-419). */
function pickListForComplementarSel(targetRaw: string | undefined, model: RulesModel): FontedLink[] {
  const t = (targetRaw ?? '').toLowerCase()
  if (t.startsWith('habilidades')) return model.habilidades.lista
  if (t.startsWith('tecnicas') || t.startsWith('técnicas')) return model.tecnicas.lista
  if (t.startsWith('acoes') || t.startsWith('ações')) return model.acoes
  if (t.startsWith('magias.secundaria') || t.startsWith('magias_secundaria')) {
    return [
      ...model.magias.secundaria.listas.aprendidas,
      ...model.magias.secundaria.listas.naoAprendidas,
    ]
  }
  if (t.startsWith('magias')) {
    return [
      ...model.magias.listas.aprendidas,
      ...model.magias.listas.naoAprendidas,
      ...model.magias.listas.tesouros,
    ]
  }
  return [
    ...model.habilidades.lista,
    ...model.tecnicas.lista,
    ...model.acoes,
    ...model.magias.listas.aprendidas,
    ...model.magias.listas.naoAprendidas,
    ...model.magias.listas.tesouros,
  ]
}

/** Espelho de eligiblePericiaEspecialOptions (plugin resolve-choices.ts:427-433). */
function eligiblePericiaEspecialOptions(model: RulesModel): string[] {
  const out: string[] = []
  for (const [pid, p] of Object.entries(model.pericias)) {
    if ((PROF_RANK[p.proficiencia] ?? 0) >= 1) out.push(displayName(pid))
  }
  return out.sort()
}

/** Espelho de inferPickFromIncrementos (plugin resolve-choices.ts:444-471). */
function inferPickFromIncrementos(
  model: RulesModel,
  wantedSourceBasename: string,
  wantedOccurrence?: number,
): string | null {
  const matches = (incSource: string): boolean => {
    if (wantedOccurrence !== undefined) {
      const tag = `Escolha.${String(wantedOccurrence).padStart(2, '0')}.[[${wantedSourceBasename}]]`
      return incSource === tag
    }
    return incSource.includes(`[[${wantedSourceBasename}]]`)
  }
  for (const [pid, p] of Object.entries(model.pericias)) {
    for (const inc of p.incrementos) {
      if (!inc.field) continue
      if (matches(inc.source)) return pid
    }
  }
  for (const o of model.oficios) {
    for (const inc of o.incrementos) {
      if (!inc.field) continue
      if (matches(inc.source)) return o.nome
    }
  }
  return null
}

/** Espelho de buildPicksRecord (plugin resolve-choices.ts:475-481). */
export function buildPicksRecord(resolved: Map<string, ChoiceDescriptor>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, desc] of resolved) {
    if (desc.pick) out[key] = desc.pick
  }
  return out
}
