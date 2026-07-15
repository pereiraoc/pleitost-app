// Dano da arma + Ataque de Oportunidade com ConditionContext aplicado.
// ESPELHO do plugin pleitost-autosheet:
//   - display do dano:  src/render/modes/interativa/panel/sections/
//     ataques-markdown.ts:applyDanoCtx (fixed/perDie×dadosDeArma/dieStep/
//     baseDiceCount/extraDice; DIE_STEP_ORDER d2→d4→d6→d8→d10→d12 clampado)
//   - AdO:              src/util/ataque-oportunidade.ts:computeDanoAdO
//     (Mestre +1 dado; técnicas não acumulam entre si; offset = base +
//     Σfixed + Σperdie×diceCount + ΣadoFixo) + flattenDanoEntriesAdO
//     (exclui efeitos `tipo: AtaqueLocal`).
import {
  mergeTypedBuckets,
  winningTypedEntries,
  resolveTypedTotal,
  displayBonusType,
  type ConditionContext,
  type ConditionEntry,
  type Proficiencia,
} from './condition-context'
import { stripSharedFrom } from './apply'
import { isCorpoACorpo, isEspecial, isGrupoConhecido } from './guard-evaluator'

const DIE_STEP_ORDER = [2, 4, 6, 8, 10, 12] as const

export function applyDieStep(baseSize: number, step: number): number {
  if (!step) return baseSize
  const idx = DIE_STEP_ORDER.indexOf(baseSize as (typeof DIE_STEP_ORDER)[number])
  if (idx < 0) return baseSize
  const clamped = Math.max(0, Math.min(DIE_STEP_ORDER.length - 1, idx + step))
  return DIE_STEP_ORDER[clamped]
}

/** Elegibilidade da linha AdO: corpo-a-corpo (cac-simples/cac-marcial/
 *  natural) ou especial (plugin util/ataque-oportunidade.ts:isArmaAdoEligible). */
export function isArmaAdoEligible(grupo: string | undefined): boolean {
  if (grupo && grupo.trim() !== '' && !isGrupoConhecido(grupo)) return false
  return isCorpoACorpo(grupo) || isEspecial(grupo)
}

export interface DanoCalcBase {
  /** Dados-base da notação da arma ("2d6+1" → 2). */
  baseDice: number
  /** Dados de proficiência (E=1, M=2). */
  profDice: number
  /** Tamanho do dado ("d4+2" → 4). 0 = dano sem dado. */
  dieSize: number
  /** Offset numérico ("d4+2" → 2). */
  offset: number
}

export interface DanoCtxResult {
  /** Display final ("2d6+3+1d12"). */
  display: string
  /** Contribuições do contexto (tooltip). */
  entries: ConditionEntry[]
  hasDelta: boolean
  hasPenalty: boolean
  adoInput: Omit<DanoAdOInput, 'prof'>
}

/** Aplica o contexto de DANO numa arma (plugin applyDanoCtx :473-680).
 *  `sourceId` = basename da arma (bucket bySource) — global sempre entra. */
export function applyDanoCtx(
  danoCalc: DanoCalcBase,
  ctx: ConditionContext | undefined,
  sourceId: string,
): DanoCtxResult {
  const offsetNum = danoCalc.offset
  const baseDisplay = composeDisplay(danoCalc.baseDice + danoCalc.profDice, danoCalc.dieSize, offsetNum, [])
  if (!ctx) {
    return {
      display: baseDisplay,
      entries: [],
      hasDelta: false,
      hasPenalty: false,
      adoInput: {
        offsetBase: offsetNum,
        baseDieSize: danoCalc.dieSize,
        finalDieSize: danoCalc.dieSize,
        fixed: [], perDie: [], dieStep: [], ado: [], adoFixo: [],
      },
    }
  }
  const baseDice = danoCalc.baseDice + danoCalc.profDice
  const dGlobal = ctx.attacks.damage
  const dSource = ctx.attacks.bySource[sourceId]?.damage

  const fixedEntries = [...dGlobal.breakdowns.fixed, ...(dSource?.breakdowns.fixed ?? [])]
  const perDieEntries = [...dGlobal.breakdowns.perDie, ...(dSource?.breakdowns.perDie ?? [])]
  const dieStepEntries = [...dGlobal.breakdowns.dieStep, ...(dSource?.breakdowns.dieStep ?? [])]
  const baseDiceCountEntries = [...dGlobal.breakdowns.baseDiceCount, ...(dSource?.breakdowns.baseDiceCount ?? [])]

  const fixedTyped = mergeTypedBuckets(dGlobal.typed?.fixed, dSource?.typed?.fixed)
  const perDieTyped = mergeTypedBuckets(dGlobal.typed?.perDie, dSource?.typed?.perDie)
  const dieStepTyped = mergeTypedBuckets(dGlobal.typed?.dieStep, dSource?.typed?.dieStep)

  const fixedSum = dGlobal.fixed + (dSource?.fixed ?? 0) + resolveTypedTotal(fixedTyped)
  const perDieSum = dGlobal.perDie + (dSource?.perDie ?? 0) + resolveTypedTotal(perDieTyped)
  const dieStepSum = dGlobal.dieStep + (dSource?.dieStep ?? 0) + resolveTypedTotal(dieStepTyped)
  const baseDiceCountSum = dGlobal.baseDiceCount + (dSource?.baseDiceCount ?? 0)
  const extraDice = [...dGlobal.extraDice, ...(dSource?.extraDice ?? [])]

  const finalDieSize = applyDieStep(danoCalc.dieSize, dieStepSum)
  const totalDice = baseDice + baseDiceCountSum
  // DanoArmaPorDado multiplica pelos DADOS DE DANO DA ARMA (base + prof +
  // dado do Sucesso Decisivo com `dadoDeArma`), NÃO por todos os exibidos.
  const dadosDeArmaExtra = baseDiceCountEntries
    .filter((e) => e.dadoDeArma)
    .reduce((s, e) => s + e.value, 0)
  const perDieDice = baseDice + dadosDeArmaExtra
  const finalOffset = offsetNum + fixedSum + perDieSum * perDieDice
  const display = composeDisplay(totalDice, finalDieSize, finalOffset, extraDice.map((e) => e.dice))

  // Entries visíveis (tooltip/cor) — achata untyped + typed vencedoras de
  // cada canal, mais extraDice/baseDiceCount (valor 0 mas contam pra delta
  // visual pos, como no plugin em que extraParts pintam `hasDelta`).
  const entries: ConditionEntry[] = [
    ...flattenContribs(fixedEntries, fixedTyped),
    ...flattenContribs(dieStepEntries, dieStepTyped),
    ...perDieEntries.map((e) => ({ ...e, label: `${stripSharedFrom(e.label)} (×${perDieDice} dado${perDieDice === 1 ? '' : 's'})`, value: e.value * perDieDice })),
    ...winningTypedEntries(perDieTyped).map((w) => ({
      label: `${displayBonusType(w.type)}: ${stripSharedFrom(w.entry.label)} (×${perDieDice} dado${perDieDice === 1 ? '' : 's'})`,
      value: w.entry.value * perDieDice,
      tipoBonus: w.type,
    })),
    // Dado EXTRA (ex.: Encantar Arma +1d12): valor 0 (não é fixo), mas o rótulo
    // carrega a notação do dado pra não parecer "0" no tooltip.
    ...extraDice.map((e) => ({ label: `${stripSharedFrom(e.label)} (+${e.dice})`, value: 0 })),
    ...baseDiceCountEntries.map((e) => ({ ...e, label: stripSharedFrom(e.label), value: 0 })),
  ]
  const hasDelta =
    entries.length > 0 || fixedSum !== 0 || perDieSum !== 0 || dieStepSum !== 0 ||
    baseDiceCountSum !== 0 || extraDice.length > 0
  const hasPenalty = fixedSum < 0 || perDieSum < 0 || dieStepSum < 0 ||
    entries.some((e) => e.value < 0)

  // Componentes pro AdO — canais fixed/perDie/dieStep SEM efeitos
  // `tipo: AtaqueLocal` + canais próprios ado/adoFixo.
  const adoEntries: AdoDiceEntry[] = [...dGlobal.ado, ...(dSource?.ado ?? [])].map((e) => ({
    label: stripSharedFrom(e.label),
    value: e.value,
    origem: e.origem,
    passivo: e.passivo,
  }))
  const adoFixoEntries = [...dGlobal.adoFixo, ...(dSource?.adoFixo ?? [])].map((e) => ({
    label: stripSharedFrom(e.label),
    value: e.value,
  }))
  const adoDieStep = flattenAdO(dieStepEntries, dieStepTyped)
  const adoDieStepSum = adoDieStep.reduce((s, e) => s + e.value, 0)

  return {
    display,
    entries,
    hasDelta,
    hasPenalty,
    adoInput: {
      offsetBase: offsetNum,
      baseDieSize: danoCalc.dieSize,
      finalDieSize: applyDieStep(danoCalc.dieSize, adoDieStepSum),
      fixed: flattenAdO(fixedEntries, fixedTyped),
      perDie: flattenAdO(perDieEntries, perDieTyped),
      dieStep: adoDieStep,
      ado: adoEntries,
      adoFixo: adoFixoEntries,
    },
  }
}

function composeDisplay(dice: number, die: number, offset: number, extra: string[]): string {
  let display: string
  if (!die || dice <= 0) {
    display = String(offset)
  } else {
    display = `${dice}d${die}`
    if (offset > 0) display += `+${offset}`
    else if (offset < 0) display += String(offset)
  }
  for (const ed of extra) display += `+${ed}`
  return display
}

function flattenContribs(
  untyped: readonly ConditionEntry[],
  typed: ReturnType<typeof mergeTypedBuckets>,
): ConditionEntry[] {
  const out: ConditionEntry[] = untyped.map((e) => ({ ...e, label: stripSharedFrom(e.label) }))
  for (const w of winningTypedEntries(typed)) {
    out.push({
      label: `${displayBonusType(w.type)}: ${stripSharedFrom(w.entry.label)}`,
      value: w.entry.value,
      tipoBonus: w.type,
      source: w.entry.source,
    })
  }
  return out
}

function flattenAdO(
  untyped: readonly ConditionEntry[],
  typed: ReturnType<typeof mergeTypedBuckets>,
): AdoNamedEntry[] {
  const out: AdoNamedEntry[] = []
  for (const e of untyped) {
    if (!e.ataqueLocal) out.push({ label: stripSharedFrom(e.label), value: e.value })
  }
  for (const w of winningTypedEntries(typed)) {
    if (!w.entry.ataqueLocal) {
      out.push({ label: `${displayBonusType(w.type)}: ${stripSharedFrom(w.entry.label)}`, value: w.entry.value })
    }
  }
  return out
}

// ──────────────────────────────────────────────────────────────────────────
// AdO (plugin util/ataque-oportunidade.ts)
// ──────────────────────────────────────────────────────────────────────────

export interface AdoDiceEntry {
  label: string
  value: number
  origem?: ConditionEntry['origem']
  passivo?: boolean
}

export interface AdoNamedEntry {
  label: string
  value: number
}

export interface DanoAdOInput {
  offsetBase: number
  baseDieSize: number
  finalDieSize: number
  prof: Proficiencia
  fixed: readonly AdoNamedEntry[]
  perDie: readonly AdoNamedEntry[]
  dieStep: readonly AdoNamedEntry[]
  ado: readonly AdoDiceEntry[]
  adoFixo: readonly AdoNamedEntry[]
}

export type DanoAdOPartKind = 'base' | 'mestre' | 'ado' | 'fixo' | 'porDado' | 'passoDado'
export type DanoAdOTone = 'pos' | 'neg' | 'neutral'

/** Parte estruturada do breakdown do AdO — porta 1:1 de
 *  plugin/util/ataque-oportunidade.ts (#262): base/mestre são neutros
 *  (estruturais); efeitos levam tom pos(verde)/neg(vermelho). `extra` traz a
 *  notação ("+1d4", "d4 → d6", "×2 dados"). */
export interface DanoAdOPart {
  kind: DanoAdOPartKind
  label: string
  value: number
  extra?: string
  tone: DanoAdOTone
}

export interface DanoAdOResult {
  diceCount: number
  dieSize: number
  offset: number
  /** "2" (0 dados) / "1d4+2" / "2d6". */
  display: string
  /** True quando alguma contribuição de efeito entrou (delta visual). */
  hasDelta: boolean
  hasPenalty: boolean
  /** Fontes que contribuíram (offset/dados) — pra listar no tooltip do AdO. */
  entries: ConditionEntry[]
  /** Breakdown ESTRUTURADO (base/mestre/dado/passo/fixo/porDado) — o tooltip
   *  mostra base e extra do mestre SEPARADOS, bônus em verde, dado migrando. */
  parts: DanoAdOPart[]
}

/** Entries do canal AdO que contribuem: não-Técnica somam; entre Técnicas
 *  só a de maior valor (plugin :133-146). */
function contributingAdoEntries(ado: readonly AdoDiceEntry[]): AdoDiceEntry[] {
  const out: AdoDiceEntry[] = []
  let tecnicaWinner: AdoDiceEntry | null = null
  for (const e of ado) {
    if (e.value <= 0) continue
    if (e.origem === 'Técnica') {
      if (!tecnicaWinner || e.value > tecnicaWinner.value) tecnicaWinner = e
    } else {
      out.push(e)
    }
  }
  if (tecnicaWinner) out.push(tecnicaWinner)
  return out
}

/** Fórmula (plugin :148-183):
 *    diceCount = (Mestre ? 1 : 0) + max(dadosTécnica) + Σ(dadosOutras)
 *    offset    = offsetBase + Σfixed + Σperdie×diceCount + ΣadoFixo */
export function computeDanoAdO(input: DanoAdOInput): DanoAdOResult {
  const { offsetBase, baseDieSize, prof, finalDieSize, fixed, perDie, dieStep, ado, adoFixo } = input

  const mestreDice = prof === 'M' ? 1 : 0
  const contributors = contributingAdoEntries(ado)
  const adoDice = contributors.reduce((s, e) => s + e.value, 0)
  const diceCount = mestreDice + adoDice

  const fixedSum = fixed.reduce((s, e) => s + e.value, 0)
  const perDieSum = perDie.reduce((s, e) => s + e.value, 0)
  const adoFixoSum = adoFixo.reduce((s, e) => s + e.value, 0)
  const offset = offsetBase + fixedSum + perDieSum * diceCount + adoFixoSum

  let display: string
  if (diceCount === 0) {
    display = String(offset)
  } else {
    display = `${diceCount}d${finalDieSize}`
    if (offset > 0) display += `+${offset}`
    else if (offset < 0) display += String(offset)
  }

  const effectDelta =
    fixedSum + perDieSum * diceCount + adoFixoSum +
    contributors.filter((e) => !e.passivo).reduce((s, e) => s + e.value, 0) +
    (finalDieSize !== baseDieSize ? 1 : 0)

  // Fontes que contribuíram pro AdO (pra listar no tooltip, #162): offset fixo,
  // por-dado (×diceCount), oportunidade-fixo e os dados de oportunidade.
  const entries: ConditionEntry[] = []
  for (const e of fixed) if (e.value !== 0) entries.push({ label: e.label, value: e.value })
  for (const e of perDie) if (e.value !== 0) entries.push({ label: e.label, value: e.value * diceCount })
  for (const e of adoFixo) if (e.value !== 0) entries.push({ label: e.label, value: e.value })
  for (const e of contributors) if (e.value !== 0) entries.push({ label: `${e.label} (dado)`, value: e.value })

  // Breakdown ESTRUTURADO — porta 1:1 de ataque-oportunidade.ts:184-247 (#262).
  const parts: DanoAdOPart[] = []
  // Base — o dano-base do AdO é o offset da arma (sem dados). Estrutural.
  parts.push({ kind: 'base', label: 'Base', value: offsetBase, tone: 'neutral' })
  // Mestre — +1 dado de dano da arma quando prof=M. Regra base (neutro).
  if (mestreDice > 0) {
    parts.push({ kind: 'mestre', label: 'Mestre', value: 0, extra: `+${mestreDice}d${finalDieSize}`, tone: 'neutral' })
  }
  // Dados do canal AdO: PASSIVOS (neutro, fazem parte do AdO-base) antes dos
  // TOGGLES (verde, buff togglável).
  for (const e of contributors) {
    if (!e.passivo) continue
    parts.push({ kind: 'ado', label: e.label, value: 0, extra: `+${e.value}d${finalDieSize}`, tone: 'neutral' })
  }
  for (const e of contributors) {
    if (e.passivo) continue
    parts.push({ kind: 'ado', label: e.label, value: 0, extra: `+${e.value}d${finalDieSize}`, tone: 'pos' })
  }
  // Passo de dado (Apunhalante/PassoDeDado) — mostra o dado MIGRANDO (d4 → d6).
  if (baseDieSize !== finalDieSize) {
    const passoTone: DanoAdOTone = finalDieSize > baseDieSize ? 'pos' : 'neg'
    for (const e of dieStep) {
      parts.push({ kind: 'passoDado', label: e.label, value: 0, extra: `d${baseDieSize} → d${finalDieSize}`, tone: passoTone })
    }
  }
  // Bônus fixo (DanoArmaFixo) e fixo-só-do-AdO (OportunidadeFixo).
  for (const e of fixed) if (e.value !== 0) parts.push({ kind: 'fixo', label: e.label, value: e.value, tone: e.value > 0 ? 'pos' : 'neg' })
  for (const e of adoFixo) if (e.value !== 0) parts.push({ kind: 'fixo', label: e.label, value: e.value, tone: e.value > 0 ? 'pos' : 'neg' })
  // Bônus por dado (DanoArmaPorDado) — ×diceCount do AdO. 0 dados → não polui.
  if (diceCount > 0) {
    for (const e of perDie) {
      if (e.value === 0) continue
      const eff = e.value * diceCount
      parts.push({ kind: 'porDado', label: e.label, value: eff, extra: `×${diceCount} dado${diceCount === 1 ? '' : 's'}`, tone: eff > 0 ? 'pos' : 'neg' })
    }
  }

  return {
    diceCount,
    dieSize: finalDieSize,
    offset,
    display,
    hasDelta: effectDelta !== 0,
    hasPenalty: fixedSum + perDieSum * diceCount + adoFixoSum < 0 || finalDieSize < baseDieSize,
    entries,
    parts,
  }
}
