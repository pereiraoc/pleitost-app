// CARTA DE BOUNTY (#248) — ESPELHA a estrutura de render-bounty.ts do plugin
// pleitost-views (fonte read-only), na linguagem visual do app (tokens
// var(--panel)/var(--card)/var(--line2)/var(--mono) + clip() de ficha/bits).
// Paridade de estrutura com buildBountyHtml (render-bounty.ts:12-131):
//   header  → subcat chip (ícone+cor do registro) + rank badge (cor do registro)
//   título  → data.Titulo
//   recompensa → chips Marcas/Ouro/Reconhecimento/Promoção (faixa min–max via
//                fmtAmount) + Extra
//   objetivo → lista (wikilinks navegáveis)
//   detalhes → Local/Contato/Financiador
// A meta (rank/subcategoria) NÃO vem do bloco: vem do frontmatter, exatamente
// como process-bounty-block.ts:12-13 passa { rank, subcategoria } do cache.fm.
import type { CSSProperties } from 'react'
import { clip } from '../../components/ficha/bits'
import { BountyText } from './BountyText'
import {
  fmtAmount,
  toBountyArray,
  type BountyData,
  type BountyValue,
} from './parse-bounty'
import { rankOf, rankStyle, subcatStyle } from './bounty-meta'

export interface BountyMeta {
  rank: unknown
  subcategoria: unknown
}

interface Chip {
  icon: string
  num: string
  lbl: string
  color?: string
}

const chipStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '5px 10px',
  background: 'var(--card)',
  border: '1px solid var(--line2)',
  clipPath: clip(6),
}
const slabelStyle: CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: '.08em',
  textTransform: 'uppercase',
  color: 'var(--muted)',
  marginBottom: 8,
}

/** render-bounty.ts:20-64 — chips de recompensa a partir de data.Recompensa. */
function rewardChips(rec: Record<string, BountyValue>, rank: string): Chip[] {
  const chips: Chip[] = []
  if (rec.Marcas != null) chips.push({ icon: '💠', num: fmtAmount(rec.Marcas), lbl: 'Marcas' })
  if (rec.Ouro != null) chips.push({ icon: '🪙', num: fmtAmount(rec.Ouro), lbl: 'Ouro' })
  if (rec.Reconhecimento != null)
    chips.push({ icon: '🟨', num: fmtAmount(rec.Reconhecimento), lbl: 'Reconhecimento' })
  const promo = rec['Promoção'] ?? rec['Promocao'] ?? null
  if (promo != null) {
    const promoRk = rankStyle(rankOf(String(promo)) ?? rankOf(rank) ?? 'D')
    chips.push({
      icon: '🏅',
      num: `Classe ${String(promo)}`,
      lbl: 'Promoção',
      color: promoRk.color,
    })
  }
  return chips
}

export function BountyCard({ data, meta }: { data: BountyData; meta: BountyMeta }) {
  const rank = String(meta.rank ?? '').toUpperCase()
  const rk = rankStyle(rank)
  const sub = String(meta.subcategoria ?? '')
  const sc = subcatStyle(sub)

  const titulo = (data.Titulo as string) || 'Aventura sem título'

  const rec =
    typeof data.Recompensa === 'object' && !Array.isArray(data.Recompensa)
      ? (data.Recompensa as Record<string, BountyValue>)
      : ({} as Record<string, BountyValue>)

  const chips = rewardChips(rec, rank)
  const extra = rec.Extra != null ? String(rec.Extra) : null
  const objetivos = toBountyArray(data.Objetivo as BountyValue | BountyValue[] | undefined)

  const details: { icon: string; text: string }[] = []
  const locais = toBountyArray(data.Local as BountyValue | BountyValue[] | undefined)
  if (locais.length) details.push({ icon: '📍', text: locais.map(String).join(', ') })
  if (data.Contato != null) details.push({ icon: '👤', text: String(data.Contato) })
  if (data.Financiador != null) details.push({ icon: '🏛️', text: String(data.Financiador) })

  return (
    <div
      className="bounty-card"
      style={{
        position: 'relative',
        display: 'flex',
        background: 'var(--panel)',
        border: '1px solid var(--line2)',
        clipPath: clip(14),
        boxShadow: `0 0 0 1px ${rk.glow}`,
        overflow: 'hidden',
      }}
    >
      {/* accent lateral pela cor do rank (render-bounty.ts:119) */}
      <span
        aria-hidden
        style={{
          flex: 'none',
          width: 5,
          background: `linear-gradient(180deg,${rk.color},color-mix(in srgb,${rk.color} 60%,black))`,
        }}
      />
      <div style={{ flex: 1, minWidth: 0, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* header: subcat + rank */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            className="bounty-subcat"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '3px 10px',
              fontFamily: 'var(--mono)',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '.04em',
              color: sc.color,
              background: sc.bg,
              clipPath: clip(6),
            }}
          >
            <span aria-hidden>{sc.icon}</span>
            {sub || 'Aventura'}
          </span>
          <span style={{ flex: 1 }} />
          <span
            className="bounty-rank"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: 30,
              height: 28,
              padding: '0 8px',
              fontFamily: 'var(--mono)',
              fontSize: 15,
              fontWeight: 800,
              color: rk.color,
              background: rk.bg,
              border: `2.5px solid ${rk.color}`,
              borderRadius: 6,
            }}
          >
            {rank || '?'}
          </span>
        </div>

        {/* título */}
        <div
          className="bounty-titulo"
          style={{ fontFamily: 'var(--display, var(--mono))', fontSize: 20, fontWeight: 700, lineHeight: 1.2 }}
        >
          {titulo}
        </div>

        {/* recompensa */}
        {chips.length || extra ? (
          <div className="bounty-recompensa">
            <div style={slabelStyle}>Recompensa</div>
            {chips.length ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {chips.map((c) => (
                  <span key={c.lbl} className="bounty-rchip" style={chipStyle}>
                    <span aria-hidden>{c.icon}</span>
                    <span style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 14, color: c.color }}>
                      {c.num}
                    </span>
                    <span style={{ fontSize: 10.5, color: 'var(--muted)', letterSpacing: '.03em' }}>
                      {c.lbl}
                    </span>
                  </span>
                ))}
              </div>
            ) : null}
            {extra ? (
              <div
                className="bounty-extra"
                style={{ marginTop: 8, fontSize: 13, color: 'var(--text)', display: 'flex', gap: 6 }}
              >
                <span aria-hidden>🎁</span>
                <BountyText text={extra} />
              </div>
            ) : null}
          </div>
        ) : null}

        {/* objetivo */}
        {objetivos.length ? (
          <div className="bounty-objetivo">
            <div style={slabelStyle}>Objetivo</div>
            <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {objetivos.map((o, i) => (
                <li key={i} style={{ fontSize: 13.5, lineHeight: 1.4 }}>
                  <BountyText text={String(o)} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* detalhes: Local / Contato / Financiador */}
        {details.length ? (
          <>
            <div style={{ height: 1, background: 'var(--line2)' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {details.map((d, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12.5, color: 'var(--muted)' }}>
                  <span aria-hidden style={{ flex: 'none' }}>
                    {d.icon}
                  </span>
                  <span style={{ color: 'var(--text)' }}>
                    <BountyText text={d.text} />
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
