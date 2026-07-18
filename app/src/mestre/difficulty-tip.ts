// Tooltip EXPLICATIVO da dificuldade de encontro: reusa o breakdown-tooltip do
// app (renderBreakdownHtml, o mesmo "de onde vem" das perícias/EM). Diz a
// classificação, a régua dos limiares (com a faixa atual marcada) e os pontos
// (monstros por tier×modificador; heróis por nível). Fonte de verdade dos
// números: encounter-compute.ts (port verbatim do plugin).
import {
  formatDifficultyValue,
  getMonsterContribution,
  TONE_EMOJI_KEY,
  type EncounterCombatant,
  type EncounterDifficultyByLevelEntry,
  type MonsterModifier,
} from './encounter-compute'
import { renderBreakdownHtml, type BreakdownPart, type BreakdownResult } from '../components/ficha/tooltips'
import { tokens } from '../generated/tokens'

// Régua dos limiares do classify (classifyDifficultyRatio): <50 · 50–75 · 75–100 · >100.
const REGUA: Array<{ faixa: string; label: string; up: string }> = [
  { faixa: '< 50', label: 'Trivial', up: 'TRIVIAL' },
  { faixa: '50–75', label: 'Fácil', up: 'FÁCIL' },
  { faixa: '75–100', label: 'Difícil', up: 'DIFICIL' },
  { faixa: '> 100', label: 'Letal', up: 'LETAL' },
]

export function difficultyTipHtml(
  entry: EncounterDifficultyByLevelEntry,
  combatants: readonly EncounterCombatant[],
): string {
  const emoji = tokens.emojis.dificuldade[TONE_EMOJI_KEY[entry.toneClass]]

  // agrega os monstros por (tier, modificador) pra não listar 15 goblins
  const groups = new Map<string, { tier: number; mod: MonsterModifier; n: number }>()
  for (const c of combatants) {
    if (c.subcategoria !== 'Monstro') continue
    const tier = c.tier ?? 0
    const k = `${tier}:${c.modificador ?? ''}`
    const g = groups.get(k)
    if (g) g.n += 1
    else groups.set(k, { tier, mod: c.modificador, n: 1 })
  }

  const parts: BreakdownPart[] = []
  // razão (de onde sai a classificação)
  parts.push({
    emoji: '',
    label: `Razão ${formatDifficultyValue(entry.ratio)}% — monstros ${formatDifficultyValue(entry.monsterTotal)} ÷ heróis ${formatDifficultyValue(entry.playerTotal)}`,
    value: 0,
    noValue: true,
  })
  // régua dos limiares, com a faixa atual em verde
  for (const r of REGUA) {
    const ativo = r.up === entry.label
    parts.push({
      emoji: ativo ? '▸' : '',
      label: `${r.faixa} → ${r.label}`,
      value: 0,
      noValue: true,
      ...(ativo ? { tone: 'pos' as const } : {}),
    })
  }
  // pontos dos monstros por grupo (tier × modificador)
  for (const g of groups.values()) {
    const pts = getMonsterContribution(g.tier, g.mod)
    parts.push({
      emoji: '',
      label: `${g.n}× T${g.tier}${g.mod ? ` ${g.mod}` : ''}`,
      value: g.n * pts,
      unsigned: true,
      extra: `${pts} pts cada`,
    })
  }
  // heróis (4 × nível)
  parts.push({
    emoji: '',
    label: `4× herói nível ${entry.level}`,
    value: entry.playerTotal,
    unsigned: true,
  })

  const result: BreakdownResult = {
    headerEmoji: emoji,
    title: `${entry.label} — Nível ${entry.level}`,
    total: 0,
    hideTotal: true,
    parts,
  }
  return renderBreakdownHtml(result)
}
