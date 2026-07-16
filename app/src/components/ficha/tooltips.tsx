// Sistema de tooltips da ficha (#21 #22 #25) — porta do plugin pleitost-autosheet:
//   - CONTEÚDO: builders de breakdown (util/modificadores.ts) e de fonte
//     (render/shared/source-tooltip.ts) computados sobre o MODELO SALVO
//     (ProfRow do FM), renderizados pra HTML pelo espelho VERBATIM de
//     renderBreakdownHtml (render/shared/breakdown-tooltip.ts:94-167).
//     Oráculo: goldens reference/goldens/interactive/*.interactive.json.
//   - MECÂNICA: overlay flutuante com o posicionamento do design puxado —
//     mesmo buildGtip/clampRef já portado em src/grupo/gtip.tsx (offset 16px,
//     flip em vh*0.62, clamp na viewport, scroll capture esconde) — aplicado
//     ao popup `dv-breakdown-tip floating` do plugin (classes/attach idênticos:
//     data-breakdown-html + dv-breakdown-hover has-breakdown,
//     breakdown-tooltip.ts:205-237).
// Emojis SEMPRE do registro gerado (tokens.emojis.tooltip/defesa/ui) — nada
// hardcodado em call-site.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { PROF_BONUS, RANK_ORDER, displayName, slugify, tokens, type RankLetter } from './registry'
import { num, profLetter, str, type ProfRow } from './hero-model'
import { stripSharedFrom } from '../../interativa/apply'

// ─────────────────────── tipos (espelho de util/breakdown-types.ts) ───────────────────────

export type BreakdownTone = 'pos' | 'neg'

export interface BreakdownPart {
  emoji: string
  label: string
  value: number
  tone?: BreakdownTone
  /** Mostra o valor cru (Base 10/4) em vez de assinado. */
  unsigned?: boolean
  extra?: string
  /** Linha puramente descritiva (`EMOJI LABEL`) — usada na fonte. */
  noValue?: boolean
  labelHtml?: boolean
}

export interface BreakdownResult {
  headerEmoji: string
  title: string
  total: number
  parts: BreakdownPart[]
  headerSigned?: boolean
  headerOnly?: boolean
  hideTotal?: boolean
  bodyMode?: 'text' | 'mod-span'
}

// ─────────────────────── render (espelho de breakdown-tooltip.ts:54-167) ───────────────────────

function toneClass(part: BreakdownPart): string {
  if (part.tone === 'pos') return 'pos'
  if (part.tone === 'neg') return 'neg'
  return ''
}

/** Espelho de signed (breakdown-tooltip.ts:44-48): 0 → "0" (não "+0"),
 *  negativo usa o MinusMark do registro (− U+2212, não hífen ASCII) —
 *  formato confirmado nos goldens ("💍 Item (0)"). NÃO é o signed do
 *  hero-model (que dá "+0" pros slots do design). */
function signed(value: number): string {
  if (value > 0) return `+${value}`
  if (value < 0) return `${tokens.emojis.glyph.MinusMark}${Math.abs(value)}`
  return '0'
}

/** Espelho de escapeHtml (breakdown-tooltip.ts:61-68). */
function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Espelho VERBATIM de renderBreakdownHtml (breakdown-tooltip.ts:94-167). */
export function renderBreakdownHtml(result: BreakdownResult): string {
  const headerEmoji = escapeHtml(result.headerEmoji)
  const headerTitle = escapeHtml(result.title)
  const headerSigned = result.headerSigned ?? false
  const emojiSpan = headerEmoji ? `<span class="dv-tooltip-emoji">${headerEmoji}</span>` : ''
  if (result.headerOnly) {
    return [
      `<div class="dv-tooltip-head-row">`,
      emojiSpan,
      `<span class="dv-tooltip-head-title">`,
      `<strong>${headerTitle}</strong>`,
      `</span>`,
      `</div>`,
    ].join('')
  }
  const hideTotal = result.hideTotal ?? false
  const headerMod = hideTotal
    ? ''
    : `<span class="dv-tooltip-mod">${escapeHtml(headerSigned ? signed(result.total) : String(result.total))}</span>`
  const head = [
    `<div class="dv-tooltip-head-row">`,
    emojiSpan,
    `<span class="dv-tooltip-head-title">`,
    `<strong>${headerTitle}</strong>${headerMod ? ` ${headerMod}` : ''}`,
    `</span>`,
    `</div>`,
    `<div class="dv-tooltip-head-rule"></div>`,
  ].join('')
  const bodyMode = result.bodyMode ?? 'text'
  const body = result.parts
    .map((p) => {
      const label = p.labelHtml ? p.label : escapeHtml(p.label)
      const valueDisplay = p.unsigned ? String(p.value) : signed(p.value)
      const value = escapeHtml(valueDisplay)
      if (bodyMode === 'mod-span') {
        const extra = p.extra ? ` ${escapeHtml(p.extra)}` : ''
        return `<div class="dv-breakdown-line">${label} <span class="dv-tooltip-mod">${value}</span>${extra}</div>`
      }
      const tone = toneClass(p)
      const cls = `dv-breakdown-line${tone ? ` ${tone}` : ''}`
      const emoji = escapeHtml(p.emoji)
      const emojiPrefix = emoji ? `${emoji} ` : ''
      if (p.noValue) {
        return `<div class="${cls}">${emojiPrefix}${label}</div>`
      }
      if (p.value === 0 && p.extra) {
        return `<div class="${cls}">${emojiPrefix}${label} (${escapeHtml(p.extra)})</div>`
      }
      const trailing = p.extra ? ` ${escapeHtml(p.extra)}` : ''
      return `<div class="${cls}">${emojiPrefix}${label} (${value})${trailing}</div>`
    })
    .join('')
  return head + body
}

/** Tooltip do Ataque de Oportunidade (#262) — espelho do plugin
 *  (ataque-oportunidade.ts): Base e "+1d{tam}" do Mestre SEPARADOS (neutros),
 *  bônus em VERDE, passo de dado mostrando o dado migrando ("d4 → d6"). Sem
 *  modificador no header (o chip já mostra o `display`; item 1.2). */
export function adoTipHtml(ado: import('../../interativa/dano').DanoAdOResult): string {
  const parts: BreakdownPart[] = ado.parts.map((p) => {
    const tone: BreakdownTone | undefined = p.tone === 'pos' ? 'pos' : p.tone === 'neg' ? 'neg' : undefined
    // Base mostra o valor cru (ex.: "Base (2)"); as demais partes de valor 0
    // trazem a notação no `extra` ("+1d4", "d4 → d6", "×2 dados").
    if (p.kind === 'base') return { emoji: '', label: p.label, value: p.value, unsigned: true, tone }
    return { emoji: '', label: p.label, value: p.value, extra: p.extra, tone }
  })
  return renderBreakdownHtml({
    headerEmoji: '',
    title: 'Ataque de Oportunidade',
    total: 0,
    hideTotal: true,
    parts,
  })
}

// ─────────────────────── builders de breakdown (espelho de util/modificadores.ts) ───────────────────────

/** Espelho de PROF_LABEL (modificadores.ts:264-269). */
export const PROF_LABEL: Record<RankLetter, string> = {
  N: 'Nenhum',
  A: 'Adepto',
  E: 'Experiente',
  M: 'Mestre',
}

/** Bases das fórmulas — espelho de RESISTENCIA_BASE/MOVIMENTO_BASE do plugin. */
const RESISTENCIA_BASE = 10
const MOVIMENTO_BASE = 4

const E = tokens.emojis.tooltip

/** Espelho de pushPart (modificadores.ts:277-287). */
function pushPart(
  parts: BreakdownPart[],
  emoji: string,
  label: string,
  value: number,
  always = false,
  unsigned = false,
): void {
  if (always || value !== 0) parts.push({ emoji, label, value, ...(unsigned ? { unsigned: true } : {}) })
}

interface RowInput {
  attr: number
  attrLabel: string
  prof: RankLetter
  item: number
  especial: number
}

function rowInput(row: ProfRow, attrs: Record<string, number>): RowInput {
  return {
    attr: attrs[row.Atributo ?? ''] ?? 0,
    attrLabel: str(row.Atributo),
    prof: profLetter(row),
    item: num(row.Bonus_Item),
    especial: num(row.Bonus_Especial),
  }
}

/** Espelho de buildAttrProfItemEspecial (modificadores.ts:295-307): TODAS as
 *  4 linhas sempre presentes (Item/Especialização inclusive quando 0). O
 *  emoji do atributo é SEMPRE ⚖️ (atributoEmoji, modificadores.ts:272-274). */
function buildAttrProfItemEspecial(
  input: RowInput,
  total: number,
  headerEmoji: string,
  title: string,
): BreakdownResult {
  const parts: BreakdownPart[] = []
  pushPart(parts, E.Atributo, input.attrLabel || 'Atributo', input.attr, true)
  pushPart(parts, E.Proficiencia, PROF_LABEL[input.prof], PROF_BONUS[input.prof], true)
  pushPart(parts, E.Item, 'Item', input.item, true)
  pushPart(parts, E.Especializacao, 'Especialização', input.especial, true)
  return { headerEmoji, title, parts, total }
}

/** Espelho de buildPericiaBreakdown (modificadores.ts:309-314): título com o
 *  ID slugado da perícia ("Enganacao (PRE)"), header SEMPRE 🧠, total assinado. */
export function periciaBreakdown(row: ProfRow, attrs: Record<string, number>): BreakdownResult {
  const input = rowInput(row, attrs)
  const total = input.attr + PROF_BONUS[input.prof] + input.item + input.especial
  const id = slugify(str(row.Nome))
  const title = input.attrLabel ? `${id} (${input.attrLabel})` : id
  // #256: o header usa o emoji do ATRIBUTO REAL da perícia (FOR/AGI/INT/PRE), não
  // o 🧠 fixo de perícia — que coincide com o emoji de INT e fazia toda perícia
  // (mesmo FOR/AGI/PRE) parecer INT no tooltip do resumo.
  const attrEmoji =
    (tokens.emojis.atributo as Record<string, string>)[input.attrLabel] ?? E.HeaderPericia
  return { ...buildAttrProfItemEspecial(input, total, attrEmoji, title), headerSigned: true }
}

/** Espelho de buildSentidoBreakdown (modificadores.ts:538-543): título com
 *  acento ("Percepção"/"Intuição"), header 👁️, total assinado. */
export function sentidoBreakdown(row: ProfRow, attrs: Record<string, number>): BreakdownResult {
  const input = rowInput(row, attrs)
  const total = input.attr + PROF_BONUS[input.prof] + input.item + input.especial
  const title = displayName(slugify(str(row.Nome)))
  return { ...buildAttrProfItemEspecial(input, total, E.HeaderSentido, title), headerSigned: true }
}

/** Espelho de buildResistenciaBreakdown (modificadores.ts:546-561): Base 10
 *  crua + 4 linhas sempre; título slugado ("Impeto"); header = emoji da
 *  defesa (registro defesa); total SEM sinal. */
export function resistenciaBreakdown(row: ProfRow, attrs: Record<string, number>): BreakdownResult {
  const input = rowInput(row, attrs)
  const total = RESISTENCIA_BASE + input.attr + PROF_BONUS[input.prof] + input.item + input.especial
  const nome = slugify(str(row.Nome))
  const parts: BreakdownPart[] = []
  pushPart(parts, E.Base, 'Base', RESISTENCIA_BASE, true, true)
  pushPart(parts, E.Atributo, input.attrLabel || 'Atributo', input.attr, true)
  pushPart(parts, E.Proficiencia, PROF_LABEL[input.prof], PROF_BONUS[input.prof], true)
  pushPart(parts, E.Item, 'Item', input.item, true)
  pushPart(parts, E.Especializacao, 'Especialização', input.especial, true)
  const defesaEmoji = (tokens.emojis.defesa as Record<string, string>)[nome] ?? ''
  return { headerEmoji: defesaEmoji, title: nome, parts, total }
}

/** Espelho de buildMovimentoNomeBreakdown (modificadores.ts:398-413): Base 4
 *  crua + AGI + Item + Especialização; título = nome do movimento
 *  ("Terrestre"); header 👣; total SEM sinal. (Linhas de condição da
 *  Interativa ficam fora — a ficha lê o modelo salvo.) */
export function movimentoBreakdown(row: ProfRow, attrs: Record<string, number>): BreakdownResult {
  const agi = attrs['AGI'] ?? 0
  const item = num(row.Bonus_Item)
  const especial = num(row.Bonus_Especial)
  const total = MOVIMENTO_BASE + agi + item + especial
  const parts: BreakdownPart[] = []
  pushPart(parts, E.Base, 'Base', MOVIMENTO_BASE, true, true)
  pushPart(parts, E.Atributo, 'AGI', agi, true)
  pushPart(parts, E.Item, 'Item', item, true)
  pushPart(parts, E.Especializacao, 'Especialização', especial, true)
  return { headerEmoji: E.HeaderMovimento, title: str(row.Nome), parts, total }
}

/** Espelho de buildOficioBreakdown (modificadores.ts:577-594): título com o
 *  Nome cru ("Oficio (INT)"); Atributo SÓ conta/aparece com prof ≥ A;
 *  Proficiência/Item/Especialização OMITEM linhas 0; total SEM sinal. */
export function oficioBreakdown(row: ProfRow, attrs: Record<string, number>): BreakdownResult {
  const input = rowInput(row, attrs)
  const attrApplies = input.prof === 'A' || input.prof === 'E' || input.prof === 'M'
  const total = (attrApplies ? input.attr : 0) + PROF_BONUS[input.prof] + input.item + input.especial
  const parts: BreakdownPart[] = []
  if (attrApplies) {
    pushPart(parts, E.Atributo, input.attrLabel || 'Atributo', input.attr, true)
  }
  pushPart(parts, E.Proficiencia, PROF_LABEL[input.prof], PROF_BONUS[input.prof])
  pushPart(parts, E.Item, 'Item', input.item)
  pushPart(parts, E.Especializacao, 'Especialização', input.especial)
  const nome = str(row.Nome)
  const title = input.attrLabel ? `${nome} (${input.attrLabel})` : nome
  return { headerEmoji: E.HeaderOficio, title, parts, total }
}

/** Dados extras de dano por proficiência — VERBATIM do PROF_DICE do plugin
 *  (modificadores.ts:35): N/A = 0, E = 1, M = 2 dados ADICIONAIS. */
const PROF_DICE: Record<RankLetter, number> = { N: 0, A: 0, E: 1, M: 2 }

/** Espelho do baseAtaqueBreakdown de renderOneArma (ataques-markdown.ts:
 *  307-318): header 🥊 + "<Arma> — Ataque", total assinado, 4 linhas SEMPRE
 *  (Atributo/Proficiência/Item/Especialização, inclusive quando 0). O emoji
 *  do atributo é ⚖️ (atributoEmoji do plugin); a proficiência é a de ATAQUE
 *  (mesma pra todas as armas), com PROF_BONUS resolvido pelo caller.
 *  `armaNome` é o LABEL da arma (sem propriedade/tier). */
export function ataqueBreakdown(
  armaNome: string,
  attr: string,
  prof: RankLetter,
  item: number,
  especial: number,
  attrValue: number,
): BreakdownResult {
  const total = attrValue + PROF_BONUS[prof] + item + especial
  const parts: BreakdownPart[] = []
  pushPart(parts, E.Atributo, attr || 'Atributo', attrValue, true)
  pushPart(parts, E.Proficiencia, PROF_LABEL[prof], PROF_BONUS[prof], true)
  pushPart(parts, E.Item, 'Item', item, true)
  pushPart(parts, E.Especializacao, 'Especialização', especial, true)
  return {
    headerEmoji: tokens.emojis.combate.Ataque,
    title: `${armaNome} — Ataque`,
    total,
    parts,
    headerSigned: true,
  }
}

/** Espelho de buildDanoArmaBreakdown (modificadores.ts:458-487): header SEM
 *  emoji + SEM total ("<Arma> — Dano"), body em modo texto. Linha "● Base
 *  (NdX+Y)" com a notação de dados CRUA no `extra` (value 0), e — quando a
 *  proficiência ADICIONA dados (E/M) — "🎓 <Rank> (+Nd<die>)". Especialização
 *  NÃO entra (não é componente do dano da arma). Dano sem dado → "Sem dano".
 *  `danoRaw` é o inline `dano::` da arma ("d4+2", "2d6", "3"). */
export function danoArmaBreakdown(
  armaNome: string,
  danoRaw: string | undefined,
  prof: RankLetter,
): BreakdownResult {
  const parts: BreakdownPart[] = []
  const m = String(danoRaw ?? '')
    .trim()
    .replace(/\s+/g, '')
    .match(/^(\d+)?d(\d+)([+-]\d+)?$/i)
  if (m) {
    const baseDice = m[1] ? parseInt(m[1], 10) : 1
    const dieSize = parseInt(m[2], 10)
    const offset = m[3] ?? ''
    const profDice = PROF_DICE[prof]
    parts.push({ emoji: E.Base, label: 'Base', value: 0, extra: `${baseDice}d${dieSize}${offset}` })
    if (profDice > 0) {
      parts.push({
        emoji: E.Proficiencia,
        label: PROF_LABEL[prof],
        value: 0,
        extra: `+${profDice}d${dieSize}`,
      })
    }
  } else {
    parts.push({ emoji: E.Base, label: 'Dano', value: 0, extra: 'Sem dano' })
  }
  return {
    headerEmoji: '',
    title: `${armaNome} — Dano`,
    total: 0,
    headerSigned: false,
    hideTotal: true,
    parts,
  }
}

/** Breakdown a partir de entries JÁ aplicadas (condições/itens/AdO) — uma
 *  linha "Fonte ±N" por entry, como o entriesTitle nativo, mas no overlay
 *  tap-able. `base` (opcional) vira a 1ª linha "● Base (…)"; `headerEmoji`
 *  opcional no cabeçalho. Usado pra surfaceár os BÔNUS de dano/AdO no toque. */
export function entriesBreakdown(
  title: string,
  entries: readonly { label: string; value: number }[],
  opts?: { headerEmoji?: string; base?: string },
): BreakdownResult {
  const parts: BreakdownPart[] = []
  if (opts?.base) parts.push({ emoji: E.Base, label: 'Base', value: 0, extra: opts.base })
  for (const e of entries) pushPart(parts, '', e.label, e.value, true)
  return {
    headerEmoji: opts?.headerEmoji ?? '',
    title,
    total: entries.reduce((s, e) => s + e.value, 0),
    parts,
    headerSigned: true,
    hideTotal: !opts?.base && entries.length === 0,
  }
}

/** Apêndice de tooltip com os bônus/penalidades vindos de EFEITOS (condições) —
 *  #262: bônus em VERDE (tone pos → .pos), penalidade em vermelho (neg). Valor 0
 *  = dado/efeito cujo rótulo já traz a notação ("(+1d12)"). '' quando não há —
 *  não polui. Usado em defesas/sentidos/ataque/perícias do Combate. */
export function modAppendixHtml(
  title: string,
  entries: readonly { label: string; value: number }[],
): string {
  if (!entries.length) return ''
  return renderBreakdownHtml({
    headerEmoji: '',
    title,
    total: 0,
    hideTotal: true,
    headerSigned: true,
    parts: entries.map((e) => {
      const tone: BreakdownTone = e.value < 0 ? 'neg' : 'pos'
      return e.value === 0
        ? { emoji: '', label: stripSharedFrom(e.label), value: 0, noValue: true, tone }
        : { emoji: '', label: stripSharedFrom(e.label), value: e.value, tone }
    }),
  })
}

// ─────────────────────── fonte (espelho de render/shared/source-tooltip.ts) ───────────────────────

interface ParsedSource {
  type: string
  origin?: string
}

/** Espelho de parseSource (source-tooltip.ts:30-41): Slot.X fica junto;
 *  demais `Tipo.Origem` separam no primeiro ponto + unwrap de wikilink. */
export function parseSource(raw: string): ParsedSource {
  if (!raw) return { type: '' }
  if (raw.startsWith('Slot.')) return { type: raw }
  const dotIdx = raw.indexOf('.')
  if (dotIdx <= 0) return { type: raw }
  const type = raw.slice(0, dotIdx)
  let origin = raw.slice(dotIdx + 1).trim()
  const wlMatch = origin.match(/^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]$/)
  if (wlMatch) origin = (wlMatch[2] ?? wlMatch[1]).trim()
  return { type, origin: origin || undefined }
}

/** Espelho de buildSourceBreakdown (source-tooltip.ts:46-61): header
 *  "🔍 Fonte"/"Fontes", sem total, 1 linha "Tipo · Origem" por source. */
export function buildSourceBreakdown(sources: readonly string[]): BreakdownResult {
  const parsed = sources.filter((s) => s).map(parseSource)
  return {
    headerEmoji: tokens.emojis.ui.Fonte,
    title: parsed.length === 1 ? 'Fonte' : 'Fontes',
    total: 0,
    headerSigned: false,
    hideTotal: true,
    parts: parsed.map(
      (p): BreakdownPart => ({
        emoji: '',
        label: p.origin ? `${p.type} · ${p.origin}` : p.type,
        value: 0,
        noValue: true,
      }),
    ),
  }
}

/** HTML do tooltip de fonte — null com sources vazio, como o guard de
 *  attachSourceTooltip (source-tooltip.ts:65-72). */
export function sourceTipHtml(sources: readonly string[] | undefined): string | null {
  const filtered = (sources ?? []).filter((s) => s)
  if (filtered.length === 0) return null
  return renderBreakdownHtml(buildSourceBreakdown(filtered))
}

// ─────────────────────── fontes por rank (espelho de derive-naem-states.ts) ───────────────────────

/** Espelho de isRuleSource/isSlotSource (derive-naem-states.ts:55-61). */
function isRuleSource(source: string): boolean {
  return source === 'Passado' || source === 'Regra' || source.startsWith('Regra.')
}
function isSlotSource(source: string): boolean {
  return source.startsWith('Slot.')
}

export interface RankTipsInput {
  row: ProfRow
  /** Seções totalmente rule-driven (Defesas/Sentidos/Ataque) — espelho do
   *  allRuleDriven de deriveNaemStates. Default: sem incrementos no FM. */
  allRuleDriven?: boolean
  /** Sources por rank vindas da projeção de regras (sourcesPerRank do
   *  view-model do plugin) — `[[basename]]` por rank. */
  sourcesPerRank?: Partial<Record<RankLetter, string[]>>
}

/** Fontes cruas por rank pros botões N/A/E/M — espelho FIEL do trecho de
 *  tooltips de deriveNaemStates (derive-naem-states.ts:63-137): incrementos
 *  rank-based do FM (chave N/A/E/M; chaves de campo tipo Bonus_Item são
 *  ignoradas) + sourcesPerRank granular (`Regra.[[X]]`) + fallback "Regra"
 *  pra seções all-rule-driven. */
export function rankSourceTips(input: RankTipsInput): Partial<Record<RankLetter, string[]>> {
  const row = input.row
  const incrementos = row.Incrementos ?? []
  const allRuleDriven = input.allRuleDriven ?? incrementos.length === 0
  const current = profLetter(row)
  const RANK_NUM: Record<RankLetter, number> = { N: 0, A: 1, E: 2, M: 3 }
  const curRank = RANK_NUM[current]

  const ruleSourcesByRank: Partial<Record<RankLetter, string[]>> = {}
  const slotSourcesByRank: Partial<Record<RankLetter, string[]>> = {}
  for (const inc of incrementos) {
    for (const [key, value] of Object.entries(inc)) {
      // Incrementos field-based ({Bonus_Item: "Regra.[[X]]"}) NÃO são treino
      // de rank — espelho do `if (inc.field) continue` do plugin.
      if (!(RANK_ORDER as string[]).includes(key)) continue
      const source = str(value)
      if (isRuleSource(source)) (ruleSourcesByRank[key as RankLetter] ||= []).push(source)
      else if (isSlotSource(source)) (slotSourcesByRank[key as RankLetter] ||= []).push(source)
    }
  }
  if (input.sourcesPerRank) {
    for (const r of RANK_ORDER) {
      const notes = input.sourcesPerRank[r]
      if (!notes || notes.length === 0) continue
      const granular = notes.map((n) => `Regra.${n}`)
      ruleSourcesByRank[r] = [...(ruleSourcesByRank[r] ?? []), ...granular]
    }
  }

  const hasRuleForCurrent = !!ruleSourcesByRank[current]?.length
  const treatAsRuleSet = current !== 'N' && (hasRuleForCurrent || (allRuleDriven && curRank > 0))

  const tooltips: Partial<Record<RankLetter, string[]>> = {}
  for (const opt of RANK_ORDER) {
    const optRank = RANK_NUM[opt]
    const ruleSrcs = ruleSourcesByRank[opt] ?? []
    const slotSrcs = slotSourcesByRank[opt] ?? []
    if (opt === current) {
      if (opt === 'N') continue
      if (treatAsRuleSet) {
        if (ruleSrcs.length) tooltips[opt] = ruleSrcs
        else if (allRuleDriven) tooltips[opt] = ['Regra']
      } else {
        if (ruleSrcs.length) tooltips[opt] = ruleSrcs
        else if (slotSrcs.length) tooltips[opt] = slotSrcs
      }
    } else if (optRank > 0 && optRank < curRank) {
      if (ruleSrcs.length) tooltips[opt] = ruleSrcs
      else if (slotSrcs.length) tooltips[opt] = slotSrcs
      else if (allRuleDriven) tooltips[opt] = ['Regra']
    }
  }
  return tooltips
}

/** Espelho de enrichRuleTooltips (render/shared/prof-section.ts:230-244):
 *  substitui sources genéricas "Regra" pelas notas reais do lookup
 *  ruleSourcesByPath; sources granulares são preservadas. */
export function enrichRuleTooltips(
  tooltips: Partial<Record<RankLetter, string[]>>,
  ruleSources: string[] | undefined,
): Partial<Record<RankLetter, string[]>> {
  if (!ruleSources || ruleSources.length === 0) return tooltips
  const enrichedFromRule = ruleSources.map((n) => `Regra.${n}`)
  const out: Partial<Record<RankLetter, string[]>> = {}
  for (const rank of Object.keys(tooltips) as RankLetter[]) {
    const sources = tooltips[rank]
    if (!sources) continue
    out[rank] = sources.flatMap((s) => (s === 'Regra' ? enrichedFromRule : [s]))
  }
  return out
}

// ─────────────────────── overlay flutuante (mecânica do gtip.tsx) ───────────────────────

interface TipState {
  html: string
  x: number
  y: number
}

interface TipCtl {
  show: (html: string) => (e: ReactMouseEvent) => void
  move: (e: ReactMouseEvent) => void
  hide: () => void
  toggle: (html: string) => (e: ReactMouseEvent) => void
}

const TipCtx = createContext<TipCtl | null>(null)

/** Dispositivo com MOUSE de verdade (hover + ponteiro fino). No toque o hover não
 *  dispara de forma confiável, então o tooltip abre por TAP. Exige `pointer: fine`
 *  também porque vários celulares reportam `hover: hover` por engano — sem isso o
 *  app achava que dava hover e o tooltip só abria no 2º toque. */
const CAN_HOVER =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(hover: hover) and (pointer: fine)').matches

// Estilos estruturais do popup — porta das regras .dv-breakdown-tip do
// plugin (styles.css:7936-7986), com as vars do Obsidian trocadas pelas
// do design do app (--background-modifier-border → --line2, etc).
const TIP_CSS = `
.dv-breakdown-tip{min-width:160px;max-width:480px;padding:8px 10px;border-radius:10px;border:1px solid var(--line2);background:var(--card);color:var(--text);font-size:12.5px;line-height:1.4;box-shadow:0 12px 32px rgba(0,0,0,.5)}
.dv-breakdown-tip.floating{position:fixed;z-index:80;pointer-events:none}
.dv-breakdown-tip .dv-tooltip-head-row{display:flex;align-items:baseline;gap:6px;margin-bottom:4px;font-weight:900;line-height:1.25}
.dv-breakdown-tip .dv-tooltip-head-rule{height:0;border:0;border-top:1px solid var(--line2);margin:0 0 6px 0;opacity:.88}
.dv-breakdown-tip .dv-tooltip-mod{font-weight:800;opacity:.9}
.dv-breakdown-tip .dv-breakdown-line{display:block;white-space:normal;overflow-wrap:anywhere}
.dv-breakdown-tip .dv-breakdown-line+.dv-breakdown-line{margin-top:2px}
.dv-breakdown-tip .dv-breakdown-line.pos{color:#22c55e}
.dv-breakdown-tip .dv-breakdown-line.neg{color:#ef4444}
.dv-breakdown-hover{cursor:help}
`

interface BuiltTip {
  html: string
  w: string
  left: string
  top: string
  tf: string
}

/** Posicionamento — mesmo buildGtip do design portado em gtip.tsx:43-64
 *  (offset +16/+18, flip acima em y ≥ vh*0.62, clamp horizontal), com a
 *  largura máxima do .dv-breakdown-tip do plugin (480px). */
function buildTip(t: TipState | null): BuiltTip | null {
  if (!t) return null
  const vw = window.innerWidth
  const vh = window.innerHeight
  const w = Math.min(480, vw - 28)
  let left = t.x + 16
  if (left + w > vw - 12) left = Math.max(12, vw - 12 - w)
  const below = t.y < vh * 0.62
  return {
    html: t.html,
    w: w + 'px',
    left: left + 'px',
    top: (below ? t.y + 18 : t.y - 14) + 'px',
    tf: below ? 'none' : 'translateY(-100%)',
  }
}

/** ref do buildGtip (gtip.tsx:67-74): corrige o top pra caber na viewport. */
function clampRef(el: HTMLDivElement | null) {
  if (!el) return
  const r = el.getBoundingClientRect()
  let dy = 0
  if (r.top < 8) dy = 8 - r.top
  else if (r.bottom > window.innerHeight - 8) dy = window.innerHeight - 8 - r.bottom
  if (dy) el.style.top = parseFloat(el.style.top) + dy + 'px'
}

function TipOverlay({ tip }: { tip: BuiltTip }) {
  return (
    <div
      ref={clampRef}
      className="dv-breakdown-tip floating"
      style={{ left: tip.left, top: tip.top, transform: tip.tf, maxWidth: tip.w }}
      dangerouslySetInnerHTML={{ __html: tip.html }}
    />
  )
}

/** Provider do overlay — 1 por tela (o popup do plugin é singleton,
 *  breakdown-tooltip.ts:18-39). Scroll (capture) esconde, como o
 *  _onScrollG do design (gtip.tsx:107-111). */
export function TipProvider({ children }: { children: ReactNode }) {
  const [tip, setTip] = useState<TipState | null>(null)

  useEffect(() => {
    const onScroll = () => setTip((cur) => (cur ? null : cur))
    window.addEventListener('scroll', onScroll, true)
    // No TOQUE, tocar FORA de um alvo com breakdown fecha o tooltip aberto
    // (capture: roda antes do onClick do alvo, que é ignorado se for o alvo).
    const onDown = (e: Event) => {
      const t = e.target as Element | null
      if (t && typeof t.closest === 'function' && t.closest('.has-breakdown')) return
      setTip((cur) => (cur ? null : cur))
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      document.removeEventListener('pointerdown', onDown, true)
    }
  }, [])

  const show = useCallback(
    (html: string) => (e: ReactMouseEvent) => setTip({ html, x: e.clientX, y: e.clientY }),
    [],
  )
  const move = useCallback(
    (e: ReactMouseEvent) => setTip((cur) => (cur ? { ...cur, x: e.clientX, y: e.clientY } : cur)),
    [],
  )
  const hide = useCallback(() => setTip((cur) => (cur ? null : cur)), [])
  // Tap (toque): abre/fecha o tooltip no ponto tocado.
  const toggle = useCallback(
    (html: string) => (e: ReactMouseEvent) =>
      setTip((cur) => (cur && cur.html === html ? null : { html, x: e.clientX, y: e.clientY })),
    [],
  )
  const ctl = useMemo<TipCtl>(() => ({ show, move, hide, toggle }), [show, move, hide, toggle])

  const built = buildTip(tip)
  return (
    <TipCtx.Provider value={ctl}>
      <style>{TIP_CSS}</style>
      {children}
      {/* PORTAL pro body: o overlay é position:fixed, mas um ancestral com
          `transform` (ex.: PanelTrack das abas) faz o fixed virar relativo a ELE,
          jogando o tooltip pro canto. No body, o fixed volta a ser relativo à
          viewport e o tooltip aparece no mouse. */}
      {built && typeof document !== 'undefined'
        ? createPortal(<TipOverlay tip={built} />, document.body)
        : null}
    </TipCtx.Provider>
  )
}

/** Alvo com tooltip — espelho do attach do plugin (breakdown-tooltip.ts:
 *  205-237): grava data-breakdown-html + classes dv-breakdown-hover
 *  has-breakdown e liga mouseenter/mousemove/mouseleave/focus/blur.
 *  `html` vazio/null renderiza os filhos sem wrapper. */
export function TipHover({
  html,
  children,
  style,
  always,
}: {
  html: string | null | undefined
  children: ReactNode
  style?: React.CSSProperties
  /** Renderiza o `<span>` wrapper MESMO sem html — assim, quando o html chega
   *  de forma assíncrona (ex.: doc carregado depois), o elemento é o mesmo
   *  `<span>` e o React reconcilia no lugar em vez de remontar os filhos
   *  (crítico pra `<select>`/inputs que não podem perder o nó). */
  always?: boolean
}) {
  const ctl = useContext(TipCtx)
  if (!html) {
    if (!always) return <>{children}</>
    return <span style={{ display: 'inline-flex', ...style }}>{children}</span>
  }
  return (
    <span
      data-breakdown-html={html}
      className="dv-breakdown-hover has-breakdown"
      style={{ display: 'inline-flex', cursor: CAN_HOVER ? 'help' : 'pointer', ...style }}
      tabIndex={CAN_HOVER ? -1 : undefined}
      // No TOQUE, SÓ o TAP abre/fecha (toggle). No desktop, SÓ o hover/foco. Nunca
      // os dois no mesmo dispositivo: senão, num tap, o mouseenter sintético
      // (show) + o click (toggle) se cancelavam e exigiam 2 toques.
      onClick={ctl && !CAN_HOVER ? ctl.toggle(html) : undefined}
      onMouseEnter={ctl && CAN_HOVER ? ctl.show(html) : undefined}
      onMouseMove={ctl && CAN_HOVER ? ctl.move : undefined}
      onMouseLeave={ctl && CAN_HOVER ? ctl.hide : undefined}
      onFocus={
        // focusin do plugin (breakdown-tooltip.ts:236): mostra ancorado no
        // próprio elemento (base = centro/embaixo do rect). Só em hover — no
        // toque, o foco vindo do tap conflitaria com o click.
        ctl && CAN_HOVER
          ? (e) => {
              const r = e.currentTarget.getBoundingClientRect()
              ctl.show(html)({
                clientX: r.left + r.width / 2,
                clientY: r.bottom,
              } as ReactMouseEvent)
            }
          : undefined
      }
      onBlur={ctl && CAN_HOVER ? ctl.hide : undefined}
    >
      {children}
    </span>
  )
}
