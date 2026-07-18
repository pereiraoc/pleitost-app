// Tooltip EXPLICATIVO da dificuldade de encontro: reusa o breakdown-tooltip do
// app (renderBreakdownHtml, o mesmo "de onde vem" das perícias/EM). Diz a
// classificação, a régua dos limiares (com a faixa atual marcada) e os pontos
// (monstros por tier×modificador; heróis por nível). Fonte de verdade dos
// números: encounter-compute.ts (port verbatim do plugin).
//
// Duas variantes: por NÍVEL (barrinhas — 4 heróis do nível X) e por MESA (badge
// do GM — os heróis reais da mesa atual, sem companheiro animal).
import {
  formatDifficultyValue,
  getMonsterContribution,
  getPlayerContribution,
  TONE_EMOJI_KEY,
  type DifficultyLabel,
  type DifficultyToneClass,
  type EncounterCombatant,
  type EncounterDifficultyByLevelEntry,
  type EncounterDifficultyResult,
  type MonsterModifier,
} from './encounter-compute'
import { renderBreakdownHtml, type BreakdownPart, type BreakdownResult } from '../components/ficha/tooltips'
import { tokens } from '../generated/tokens'

// Régua dos limiares do classify (classifyDifficultyRatio): <50 · 50–75 · 75–100 · >100.
const REGUA: Array<{ faixa: string; label: string; up: DifficultyLabel }> = [
  { faixa: '< 50', label: 'Trivial', up: 'TRIVIAL' },
  { faixa: '50–75', label: 'Fácil', up: 'FÁCIL' },
  { faixa: '75–100', label: 'Difícil', up: 'DIFICIL' },
  { faixa: '> 100', label: 'Letal', up: 'LETAL' },
]

/** Linhas de pontos dos monstros, agregadas por (tier × modificador). */
function monsterParts(combatants: readonly EncounterCombatant[]): BreakdownPart[] {
  const groups = new Map<string, { tier: number; mod: MonsterModifier; n: number }>()
  for (const c of combatants) {
    if (c.subcategoria !== 'Monstro') continue
    const tier = c.tier ?? 0
    const k = `${tier}:${c.modificador ?? ''}`
    const g = groups.get(k)
    if (g) g.n += 1
    else groups.set(k, { tier, mod: c.modificador, n: 1 })
  }
  return [...groups.values()].map((g) => {
    const pts = getMonsterContribution(g.tier, g.mod)
    return {
      emoji: '',
      label: `${g.n}× T${g.tier}${g.mod ? ` ${g.mod}` : ''}`,
      value: g.n * pts,
      unsigned: true,
      extra: `${pts} pts cada`,
    }
  })
}

function buildTip(opts: {
  label: DifficultyLabel
  toneClass: DifficultyToneClass
  ratio: number
  monsterTotal: number
  playerTotal: number
  titleSuffix: string
  monsterCombatants: readonly EncounterCombatant[]
  heroParts: BreakdownPart[]
}): string {
  const parts: BreakdownPart[] = []
  parts.push({
    emoji: '',
    label: `Razão ${formatDifficultyValue(opts.ratio)}% — monstros ${formatDifficultyValue(opts.monsterTotal)} ÷ heróis ${formatDifficultyValue(opts.playerTotal)}`,
    value: 0,
    noValue: true,
  })
  for (const r of REGUA) {
    const ativo = r.up === opts.label
    parts.push({
      emoji: ativo ? '▸' : '',
      label: `${r.faixa} → ${r.label}`,
      value: 0,
      noValue: true,
      ...(ativo ? { tone: 'pos' as const } : {}),
    })
  }
  parts.push(...monsterParts(opts.monsterCombatants))
  parts.push(...opts.heroParts)
  const result: BreakdownResult = {
    headerEmoji: tokens.emojis.dificuldade[TONE_EMOJI_KEY[opts.toneClass]],
    title: `${opts.label} — ${opts.titleSuffix}`,
    total: 0,
    hideTotal: true,
    parts,
  }
  return renderBreakdownHtml(result)
}

/** Tooltip da barrinha (dificuldade pra 4 heróis do nível da barra). */
export function difficultyTipHtml(
  entry: EncounterDifficultyByLevelEntry,
  combatants: readonly EncounterCombatant[],
): string {
  return buildTip({
    label: entry.label,
    toneClass: entry.toneClass,
    ratio: entry.ratio,
    monsterTotal: entry.monsterTotal,
    playerTotal: entry.playerTotal,
    titleSuffix: `Nível ${entry.level}`,
    monsterCombatants: combatants,
    heroParts: [{ emoji: '', label: `4× herói nível ${entry.level}`, value: entry.playerTotal, unsigned: true }],
  })
}

/** Tooltip do badge do GM (dificuldade pros heróis REAIS da mesa atual). */
export function partyDifficultyTipHtml(
  result: EncounterDifficultyResult,
  monsterCombatants: readonly EncounterCombatant[],
  heroLevels: readonly number[],
): string {
  const byLevel = new Map<number, number>()
  for (const l of heroLevels) byLevel.set(l, (byLevel.get(l) ?? 0) + 1)
  const heroParts: BreakdownPart[] = [...byLevel.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([lvl, n]) => ({
      emoji: '',
      label: `${n}× herói nível ${lvl}`,
      value: getPlayerContribution(lvl) * n,
      unsigned: true,
    }))
  return buildTip({
    label: result.label,
    toneClass: result.toneClass,
    ratio: result.ratio,
    monsterTotal: result.monsterTotal,
    playerTotal: result.playerTotal,
    titleSuffix: 'Sua mesa',
    monsterCombatants,
    heroParts,
  })
}
