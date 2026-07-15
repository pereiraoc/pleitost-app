// Dificuldade de encontro — ESPELHA o plugin pleitost-autosheet (READ-ONLY),
// port VERBATIM (mesmos pesos/thresholds/labels) de:
//  - runtime/encounter/contributions.ts: tabelas de pontos por nível de herói
//    e por tier de monstro (+ modificador Solo/Elite/Competente).
//  - runtime/encounter/tier-from-level.ts: nível de herói → tier.
//  - runtime/encounter/format.ts: formatação pt-BR do número de dificuldade.
//  - runtime/encounter/classify.ts: ratio → TRIVIAL/FÁCIL/DIFICIL/LETAL.
//  - runtime/encounter/compute.ts: computeEncounterDifficulty +
//    computeEncounterDifficultyByLevel (barra por nível 1..10).
//  - extract/frontmatter-helpers.ts:195 parseModificador (leitura do FM).
// Mesmo papel do wealth.ts pro economy-table: o app NÃO reinventa fórmula.

/* ── contributions.ts ────────────────────────────────────────────────── */

export type MonsterModifier = 'Solo' | 'Elite' | 'Competente' | null

export const PLAYER_CONTRIBUTION_BY_LEVEL: Readonly<Record<number, number>> = {
  1: 10, 2: 11, 3: 12,
  4: 25, 5: 27, 6: 29,
  7: 40, 8: 44, 9: 48,
  10: 52,
}

export const MONSTER_CONTRIBUTION_BY_TIER: Readonly<Record<number, number>> = {
  0: 5, 1: 10, 2: 25, 3: 40,
}

/** Pontuação de Competente por tier — tabela hardcoded por confirmação do
 *  user em 2026-05-29 no plugin. Não é × 1.2 puro (t2 destoa: 25 × 1.2 = 30,
 *  spec diz 28). Mantida como tabela explícita, igual lá. */
const COMPETENTE_CONTRIBUTION_BY_TIER: Readonly<Record<number, number>> = {
  0: 6, 1: 12, 2: 28, 3: 48,
}

export function getPlayerContribution(nivel: number | null): number {
  if (nivel == null) return 0
  return PLAYER_CONTRIBUTION_BY_LEVEL[nivel] ?? 0
}

export function getMonsterContribution(
  tier: number | null,
  modificador: MonsterModifier,
): number {
  const t = Math.max(0, Math.min(3, Math.floor(Number(tier) || 0)))
  const base = MONSTER_CONTRIBUTION_BY_TIER[t] ?? 0
  if (modificador === 'Elite') return base * 2
  if (modificador === 'Solo') return base * 3
  if (modificador === 'Competente') return COMPETENTE_CONTRIBUTION_BY_TIER[t] ?? 0
  // Sem modificador (Normal/null) → base puro × 1.0.
  return base
}

/* ── tier-from-level.ts ──────────────────────────────────────────────── */

/** Mapeia nível de herói → tier (pacote de poder). T1 = 1-3, T2 = 4-6,
 *  T3 = 7-9, T4 = 10+. */
export function tierFromLevel(level: number): number {
  const n = Math.max(1, Math.floor(Number(level) || 1))
  if (n <= 3) return 1
  if (n <= 6) return 2
  if (n <= 9) return 3
  return 4
}

/* ── format.ts ───────────────────────────────────────────────────────── */

/** Formata número de dificuldade pra display: inteiro sem decimal,
 *  fracionário com 1 casa pt-BR (vírgula), Infinity/NaN → "∞". */
export function formatDifficultyValue(value: number): string {
  if (!Number.isFinite(value)) return '∞'
  const rounded = Math.round(value * 10) / 10
  if (Math.abs(rounded - Math.round(rounded)) < 0.001) {
    return String(Math.round(rounded))
  }
  return rounded.toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
}

/* ── classify.ts ─────────────────────────────────────────────────────── */

// Labels seguem paridade com o tracker legado do plugin: "FÁCIL" e "LETAL"
// têm acento; "DIFICIL" NÃO tem (string original do pleitost-combat-marker,
// preservada bytewise lá e aqui).
export type DifficultyLabel = 'TRIVIAL' | 'FÁCIL' | 'DIFICIL' | 'LETAL'
export type DifficultyToneClass = 'is-trivial' | 'is-easy' | 'is-hard' | 'is-lethal'

export interface DifficultyMeta {
  label: DifficultyLabel
  toneClass: DifficultyToneClass
  title: string
}

/** Boundaries do tracker original: <50 TRIVIAL · 50-75 FÁCIL · 75-100
 *  DIFÍCIL · >100 LETAL (ratio = monstros/heróis × 100). */
export function classifyDifficultyRatio(
  ratio: number,
  monsterTotal: number,
  playerTotal: number,
): DifficultyMeta {
  const title = `${formatDifficultyValue(ratio)}% (Monstros ${formatDifficultyValue(monsterTotal)}, Heróis ${formatDifficultyValue(playerTotal)})`
  if (ratio < 50) return { label: 'TRIVIAL', toneClass: 'is-trivial', title }
  if (ratio <= 75) return { label: 'FÁCIL', toneClass: 'is-easy', title }
  if (ratio <= 100) return { label: 'DIFICIL', toneClass: 'is-hard', title }
  return { label: 'LETAL', toneClass: 'is-lethal', title }
}

/* ── compute.ts ──────────────────────────────────────────────────────── */

/** Subset do FM/model necessário pro cálculo (no plugin o caller resolve
 *  wikilink → InternalSheetModel.meta; aqui o caller resolve VaultDoc). */
export interface EncounterCombatant {
  source: string
  /** Family resolvida (`Heroi` / `Criatura` / etc). */
  family: string
  /** Subcategoria do FM (`Monstro`, `Heroi`, `Jogador`, ...). */
  subcategoria: string
  tier: number | null
  nivel: number | null
  modificador: MonsterModifier
}

export interface EncounterDifficultyResult extends DifficultyMeta {
  monsterTotal: number
  playerTotal: number
  ratio: number
}

export interface EncounterDifficultyByLevelEntry extends DifficultyMeta {
  level: number
  tier: number
  /** Pontos totais dos monstros (igual pra todas entries — não varia
   *  por nível dos heróis). */
  monsterTotal: number
  /** Pontos totais dos heróis simulados (4 heróis daquele nível). */
  playerTotal: number
  /** Razão monstros/heróis × 100. */
  ratio: number
}

function computeMonsterTotal(combatants: readonly EncounterCombatant[]): number {
  let total = 0
  for (const c of combatants) {
    if (c.subcategoria === 'Monstro') {
      total += getMonsterContribution(c.tier, c.modificador)
    }
  }
  return total
}

function computePlayerTotal(combatants: readonly EncounterCombatant[]): number {
  let total = 0
  for (const c of combatants) {
    if (c.subcategoria === 'Heroi' || c.subcategoria === 'Jogador') {
      total += getPlayerContribution(c.nivel)
    }
  }
  return total
}

function ratioOf(monsterTotal: number, playerTotal: number): number {
  if (playerTotal > 0) return (monsterTotal / playerTotal) * 100
  if (monsterTotal > 0) return Number.POSITIVE_INFINITY
  return 0
}

export function computeEncounterDifficulty(
  combatants: readonly EncounterCombatant[],
): EncounterDifficultyResult {
  const monsterTotal = computeMonsterTotal(combatants)
  const playerTotal = computePlayerTotal(combatants)
  const ratio = ratioOf(monsterTotal, playerTotal)
  const meta = classifyDifficultyRatio(ratio, monsterTotal, playerTotal)
  return { ...meta, monsterTotal, playerTotal, ratio }
}

/** Retorna 10 entries (level 1..10), cada uma simulando "4 heróis daquele
 *  nível vs os monstros atuais". Alimenta a tabela de dificuldade por nível
 *  (no plugin: a barra do tracker). */
export function computeEncounterDifficultyByLevel(
  combatants: readonly EncounterCombatant[],
): EncounterDifficultyByLevelEntry[] {
  const monsterTotal = computeMonsterTotal(combatants)
  const result: EncounterDifficultyByLevelEntry[] = []
  for (let level = 1; level <= 10; level += 1) {
    const playerTotal = (PLAYER_CONTRIBUTION_BY_LEVEL[level] ?? 0) * 4
    const ratio = ratioOf(monsterTotal, playerTotal)
    const meta = classifyDifficultyRatio(ratio, monsterTotal, playerTotal)
    const tier = tierFromLevel(level)
    // Title customizado por nível (paridade com tracker original):
    // "Nivel <N> (T<X> · 4 herois): <LABEL> · <RATIO>%"
    const title = `Nivel ${level} (T${tier} · 4 herois): ${meta.label} · ${formatDifficultyValue(ratio)}%`
    result.push({ ...meta, level, tier, title, monsterTotal, playerTotal, ratio })
  }
  return result
}

/* ── extract/frontmatter-helpers.ts:195 ──────────────────────────────── */

/** Lê `Modificador` do FM de um monstro. Aceita flat (`Modificador:
 *  Competente`), flat com wikilink (`"[[Competente]]"`) e fallback legado em
 *  `Regras_Escolhas.modificador_bestiario`. `null` se não casa com nenhum
 *  dos 3 valores aceitos. */
export function parseModificador(fm: Record<string, unknown>): MonsterModifier {
  const stripWl = (s: string): string => s.trim().replace(/^\[\[|\]\]$/g, '').trim()

  const direct = fm.Modificador
  if (direct != null) {
    const v = stripWl(String(direct))
    if (v === 'Competente' || v === 'Elite' || v === 'Solo') return v
  }

  // Compat com fichas legadas
  const re = fm['Regras_Escolhas']
  if (re && typeof re === 'object' && re !== null) {
    const raw = (re as Record<string, unknown>).modificador_bestiario
    if (raw != null) {
      const v = stripWl(String(raw))
      if (v === 'Competente' || v === 'Elite' || v === 'Solo') return v
    }
  }
  return null
}

/** Cores dos tons de dificuldade — VERBATIM do plugin (styles.css:11618-11637,
 *  .gm-enc-difficulty.is-*): trivial azul, easy verde, hard laranja, lethal
 *  vermelho. Fonte de verdade é o CSS do tracker, não escolha nossa. */
export const DIFFICULTY_TONE_COLORS: Readonly<Record<DifficultyToneClass, string>> = {
  'is-trivial': '#60a5fa',
  'is-easy': '#4ade80',
  'is-hard': '#fb923c',
  'is-lethal': '#f87171',
}

/** toneClass → chave do registro `emojis.dificuldade` (Trivial/Facil/Dificil/
 *  Letal), pra o call-site NUNCA inventar o emoji: quem quiser o círculo
 *  colorido do tracker (levelbar-seg) faz `tokens.emojis.dificuldade[TONE_EMOJI_KEY[tone]]`.
 *  Espelha difficultyEmoji() do plugin (difficulty-bar.ts:88): is-trivial→Trivial,
 *  is-easy→Facil, is-hard→Dificil, is-lethal→Letal. */
export const TONE_EMOJI_KEY: Readonly<Record<DifficultyToneClass, 'Trivial' | 'Facil' | 'Dificil' | 'Letal'>> = {
  'is-trivial': 'Trivial',
  'is-easy': 'Facil',
  'is-hard': 'Dificil',
  'is-lethal': 'Letal',
}
