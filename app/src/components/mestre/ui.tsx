// Vocabulário visual compartilhado dos Criadores do Modo Mestre (#194/#195).
// Não há tela desenhada pra estes fluxos no Claude Design (Companion App.dc
// .html não tem seção de criador) — seguimos o precedente sancionado do
// MestreTables/PessoaForm: kickers mono '// ...', var(--...), clip-path de
// canto cortado e strings sóbrias, nada de chrome novo.
import type { CSSProperties } from 'react'
import {
  DIFFICULTY_TONE_COLORS,
  TONE_EMOJI_KEY,
  formatDifficultyValue,
  type DifficultyMeta,
  type EncounterDifficultyByLevelEntry,
} from '../../mestre/encounter-compute'
import { tokens } from '../ficha/registry'

/** clip-path de canto cortado (mesmo polígono do design). */
export function clip(n: number): NonNullable<CSSProperties['clipPath']> {
  return `polygon(0 0,calc(100% - ${n}px) 0,100% ${n}px,100% 100%,${n}px 100%,0 calc(100% - ${n}px))`
}

/** Label mono de campo — mesmo estilo do form de Pessoa (CreaturesPages). */
export const fieldLabelStyle: CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '.08em',
  color: 'var(--muted)',
  marginBottom: 6,
  display: 'block',
}

/** Input/select — mesmo estilo do form de Pessoa (CreaturesPages). */
export const fieldInputStyle: CSSProperties = {
  boxSizing: 'border-box',
  padding: '9px 12px',
  background: 'var(--card)',
  border: '1px solid var(--line2)',
  color: 'var(--text)',
  fontFamily: 'inherit',
  fontSize: 14,
  outline: 'none',
  clipPath: clip(7),
}

/** Botão accent (mesma skin do "+ Adicionar" dos forms existentes). */
export function accentBtnStyle(enabled: boolean): CSSProperties {
  return {
    padding: '9px 16px',
    background: 'var(--accent)',
    border: '1px solid var(--accent)',
    color: 'var(--ink)',
    cursor: enabled ? 'pointer' : 'not-allowed',
    opacity: enabled ? 1 : 0.5,
    fontSize: 13,
    fontWeight: 700,
    fontFamily: 'inherit',
    clipPath: clip(7),
  }
}

/** Painel de seção dos criadores (card com canto cortado). */
export const sectionStyle: CSSProperties = {
  background: 'var(--panel2)',
  border: '1px solid var(--line2)',
  clipPath: clip(12),
  padding: 16,
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}

/** Badge de dificuldade — skin do .gm-enc-difficulty do tracker do plugin
 *  (styles.css:11610-11637): cor do tom + fundo 12% + borda 28%, label do
 *  classify (fonte de verdade — nunca string inventada aqui). */
export function DifficultyBadge({
  meta,
  ratio,
  big,
}: {
  meta: DifficultyMeta
  ratio: number
  big?: boolean
}) {
  const cor = DIFFICULTY_TONE_COLORS[meta.toneClass]
  return (
    <span
      className={`gm-enc-difficulty ${meta.toneClass}`}
      title={meta.title}
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: 8,
        padding: big ? '6px 14px' : '3px 10px',
        fontFamily: 'var(--mono)',
        fontSize: big ? 15 : 11,
        fontWeight: 900,
        letterSpacing: '.02em',
        color: cor,
        background: `color-mix(in srgb, ${cor} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${cor} 28%, transparent)`,
        clipPath: clip(6),
        cursor: 'help',
      }}
    >
      {meta.label}
      <span style={{ fontWeight: 700, fontSize: big ? 12 : 10 }}>
        {formatDifficultyValue(ratio)}%
      </span>
    </span>
  )
}

/** Cor da barrinha de tier do levelbar — VERBATIM do plugin (styles.css:
 *  11665-11668, .gm-enc-levelbar-tier.is-tier-N::after): T1 bronze, T2 prata,
 *  T3 ouro, T4 azul-claro. Reusa tokens.colors.tier (fonte de verdade das
 *  cores de tier do app), com o mesmo mapeamento do tracker. */
const LEVELBAR_TIER_COLOR: Readonly<Record<number, string>> = {
  1: tokens.colors.tier.Bronze,
  2: tokens.colors.tier.Silver,
  3: tokens.colors.tier.Gold,
  4: '#8fd3ff',
}

/** BARRINHAS de dificuldade por nível — espelho do `gm-enc-levelbar` do
 *  combat-tracker do plugin (components/difficulty-bar.ts::renderLevelBar +
 *  styles.css:11638-11681): 10 quadradinhos (nível 1..10) agrupados por tier,
 *  cada seg colorido pelo tom do classify daquele nível (4 heróis vs os
 *  monstros atuais) e com o breakdown no `title`. Cor do seg SEMPRE de
 *  DIFFICULTY_TONE_COLORS; emoji do título SEMPRE do registro (nada inventado). */
export function EncounterLevelBar({ byLevel }: { byLevel: readonly EncounterDifficultyByLevelEntry[] }) {
  // Agrupa por tier preservando a ordem (T1: 1-3, T2: 4-6, T3: 7-9, T4: 10+).
  const byTier: Array<{ tier: number; entries: EncounterDifficultyByLevelEntry[] }> = []
  for (const e of byLevel) {
    const last = byTier[byTier.length - 1]
    if (last && last.tier === e.tier) last.entries.push(e)
    else byTier.push({ tier: e.tier, entries: [e] })
  }
  return (
    <div className="gm-enc-levelbar" data-mestre-levelbar="">
      {byTier.map(({ tier, entries }) => (
        <div key={tier} className={`gm-enc-levelbar-tier is-tier-${tier}`} style={{ ['--tierbar' as string]: LEVELBAR_TIER_COLOR[tier] }}>
          {entries.map((e) => (
            <span
              key={e.level}
              className={`gm-enc-levelbar-seg ${e.toneClass}`}
              data-level={e.level}
              title={`${tokens.emojis.dificuldade[TONE_EMOJI_KEY[e.toneClass]]} ${e.label} — Nível ${e.level} · ${formatDifficultyValue(e.ratio)}% (Monstros ${formatDifficultyValue(e.monsterTotal)}, 4 Heróis ${formatDifficultyValue(e.playerTotal)})`}
              style={{ background: DIFFICULTY_TONE_COLORS[e.toneClass] }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
