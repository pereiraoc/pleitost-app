// PORT do registro de estilos do bounty do plugin pleitost-views (#248).
// Fonte read-only:
//   /data/vaults/pleitost/.obsidian/plugins/pleitost-views/src/render/modes/
//     bounty/bounty-meta.ts
// Rank (S/A/B/C/D) → cor/glow; subcategoria da missão → ícone/cor. Portado
// VERBATIM — é a fonte de verdade do visual do bounty; o call-site NUNCA
// inventa cor/ícone/label por string (diretriz do projeto), sempre lê daqui.

export type BountyRank = 'S' | 'A' | 'B' | 'C' | 'D'

export interface RankStyle {
  color: string
  bg: string
  glow: string
}

export const BOUNTY_RANK: Record<BountyRank, RankStyle> = {
  S: { color: '#8fd3ff', bg: 'rgba(143,211,255,0.14)', glow: 'rgba(143,211,255,0.30)' },
  A: { color: '#d4af37', bg: 'rgba(212,175,55,0.14)', glow: 'rgba(212,175,55,0.28)' },
  B: { color: '#94a3b8', bg: 'rgba(148,163,184,0.16)', glow: 'rgba(148,163,184,0.24)' },
  C: { color: '#cd7f32', bg: 'rgba(205,127,50,0.14)', glow: 'rgba(205,127,50,0.22)' },
  D: { color: '#6b7280', bg: 'rgba(107,114,128,0.12)', glow: 'rgba(107,114,128,0.15)' },
}

export interface SubcatStyle {
  icon: string
  color: string
  bg: string
}

export const BOUNTY_SUBCAT: Record<string, SubcatStyle> = {
  Neutralização: { icon: '⚔', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  'Proteção de Transporte': { icon: '🛡', color: '#60a5fa', bg: 'rgba(96,165,250,0.12)' },
  Resgate: { icon: '🆘', color: '#f97316', bg: 'rgba(249,115,22,0.12)' },
  'Recuperação de Relíquia': { icon: '💎', color: '#a855f7', bg: 'rgba(168,85,247,0.12)' },
  'Teste de Classe': { icon: '🏆', color: '#eab308', bg: 'rgba(234,179,8,0.12)' },
  'Teste Classe': { icon: '🏆', color: '#eab308', bg: 'rgba(234,179,8,0.12)' },
}

export const SUBCAT_FALLBACK: SubcatStyle = {
  icon: '📜',
  color: 'var(--muted)',
  bg: 'color-mix(in srgb, var(--muted) 12%, transparent)',
}

/** render-bounty.ts:8-10 — rank válido ou null. */
export function rankOf(s: string): BountyRank | null {
  const up = s.toUpperCase()
  return up in BOUNTY_RANK ? (up as BountyRank) : null
}

/** Estilo de rank (fallback D, como render-bounty.ts:13). */
export function rankStyle(rank: unknown): RankStyle {
  return BOUNTY_RANK[rankOf(String(rank ?? '')) ?? 'D']
}

/** Estilo da subcategoria (fallback 📜, como render-bounty.ts:16). */
export function subcatStyle(sub: unknown): SubcatStyle {
  const key = String(sub ?? '')
  return BOUNTY_SUBCAT[key] ?? SUBCAT_FALLBACK
}
