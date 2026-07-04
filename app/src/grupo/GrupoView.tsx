// Página do grupo — markup/estilos VERBATIM da seção ===== GRUPOS ===== do
// design puxado (design/pulled/Companion App.dc.html, linhas ~1106-1160),
// sem personagem claimed: recebe o doc do grupo e liga os dados reais.
// Nesta leva só a aba PAPÉIS é funcional; as demais ficam disabled (mesma
// convenção da sidebar pra telas ainda não implementadas).
import { useMemo, useState } from 'react'
import { useCatalog } from '../data/CatalogContext'
import { useDoc, useDocs } from '../data/useDoc'
import { linkLabel } from '../markdown/dataview-value'
import {
  BAL_CAPTION,
  PAPEIS,
  groupMembers,
  groupTotals,
  papelValues,
  rankLetter,
  sintoniaEmoji,
  tierFromLevel,
  type PapelValues,
} from './party'

// Verbatim do script do design (GRUPO_TABS / GRUPO.balHeads).
const GRUPO_TABS = [
  { id: 'papeis', label: 'PAPÉIS' },
  { id: 'competencias', label: 'COMPETÊNCIAS' },
  { id: 'riqueza', label: 'RIQUEZA' },
  { id: 'pericias', label: 'PERÍCIAS' },
  { id: 'ataques', label: 'ATAQUES' },
]
const BAL_HEADS: { ic: string; l: string; cor: string; papel?: (typeof PAPEIS)[number] }[] = [
  { ic: '🎖️', l: 'TIR', cor: 'var(--accent)' },
  { ic: '★', l: 'LID', cor: '#4ade80', papel: 'Lider' },
  { ic: '★', l: 'CON', cor: '#c084fc', papel: 'Controlador' },
  { ic: '★', l: 'ABT', cor: '#f87171', papel: 'Abatedor' },
  { ic: '★', l: 'VAN', cor: '#60a5fa', papel: 'Vanguarda' },
]

const rowGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(240px,3fr) minmax(64px,.7fr) repeat(4,minmax(56px,1fr))',
  gap: 6,
  alignItems: 'center',
}

/** Célula de estrelas do design: 1ª estrela, guia tracejada, resto, e "+". */
function StarCell({ value, cor }: { value: number; cor: string }) {
  const star = (filled: boolean, key: number) => (
    <span key={key} style={{ fontSize: 15, lineHeight: 1, color: cor, opacity: filled ? 1 : 0.18 }}>
      ★
    </span>
  )
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
      {star(value >= 1, 0)}
      <span
        style={{
          width: 0,
          alignSelf: 'stretch',
          borderLeft: '1px dashed color-mix(in srgb,var(--muted) 60%,transparent)',
          margin: '1px -1.5px',
        }}
      />
      {star(value >= 2, 1)}
      {star(value >= 3, 2)}
      {value > 3 ? (
        <span style={{ fontSize: 12, color: cor, marginLeft: 2, fontWeight: 700 }}>+</span>
      ) : null}
    </div>
  )
}

interface RowProps {
  label: string
  em?: string | null
  tier: string
  values: PapelValues
  isGroup?: boolean
}

function BalRow({ label, em, tier, values, isGroup }: RowProps) {
  const g = isGroup ? 1 : 0
  return (
    <div
      style={{
        ...rowGrid,
        boxSizing: 'border-box',
        minHeight: 42,
        padding: '9px 4px',
        background: `color-mix(in srgb,var(--accent) ${g * 13}%,color-mix(in srgb,var(--accent) 3%,var(--panel)))`,
        border: `1px solid color-mix(in srgb,var(--accent) ${g * 45}%,var(--line))`,
        borderTop: `${1 + g * 1.5}px solid color-mix(in srgb,var(--accent) ${g * 85}%,var(--line))`,
        clipPath: 'polygon(0 0,calc(100% - 9px) 0,100% 9px,100% 100%,9px 100%,0 calc(100% - 9px))',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
        <span style={{ fontSize: 12, flex: 'none' }}>{isGroup ? '' : '👤'}</span>
        <span
          style={{
            fontWeight: isGroup ? 800 : 600,
            fontSize: 13,
            color: isGroup ? '#ca8a04' : 'var(--text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </span>
        {em ? <span style={{ flex: 'none', fontSize: 12 }}>{em}</span> : null}
      </div>
      <div
        style={{
          textAlign: 'center',
          fontFamily: 'var(--mono)',
          fontSize: 13,
          fontWeight: 700,
          color: isGroup ? 'color-mix(in srgb,var(--accent) 55%,var(--text))' : 'var(--text)',
        }}
      >
        {tier}
      </div>
      {BAL_HEADS.slice(1).map((head) => (
        <StarCell key={head.l} value={values[head.papel!]} cor={head.cor} />
      ))}
    </div>
  )
}

export function GrupoView({ groupId }: { groupId: string }) {
  const catalog = useCatalog()
  const { doc: groupDoc } = useDoc(groupId)
  const [tab] = useState('papeis')

  const members = useMemo(() => groupMembers(catalog, groupId), [catalog, groupId])
  const memberDocs = useDocs(useMemo(() => members.map((m) => m.id), [members]))

  const entry = catalog.entryById.get(groupId)
  const names = entry?.basename ?? groupId
  const subcategoria =
    typeof groupDoc?.frontmatter['subcategoria'] === 'string'
      ? (groupDoc.frontmatter['subcategoria'] as string)
      : ''

  const rows = members.map((member) => {
    const doc = memberDocs?.get(member.id)
    return {
      id: member.id,
      label: linkLabel(doc?.frontmatter['Classe']) || member.basename || member.id,
      em: sintoniaEmoji(doc),
      tier: tierFromLevel(doc?.frontmatter['Nível']),
      values: papelValues(doc),
    }
  })
  const maxTier = rows.length ? Math.max(...rows.map((r) => r.tier)) : 1
  const totals = groupTotals(rows.map((r) => r.values))
  const rank = rankLetter(groupDoc?.frontmatter ?? {}, maxTier)

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* HEADER (verbatim do design) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 10,
              letterSpacing: '.16em',
              color: 'var(--accent)',
              background: 'color-mix(in srgb,var(--accent) 12%,transparent)',
              border: '1px solid color-mix(in srgb,var(--accent) 40%,transparent)',
              padding: '5px 12px',
              clipPath: 'polygon(0 0,calc(100% - 6px) 0,100% 6px,100% 100%,6px 100%,0 calc(100% - 6px))',
            }}
          >
            GRUPO{subcategoria ? ` · ${subcategoria.toUpperCase()}` : ''}
          </span>
          <span style={{ flex: 1 }} />
          <span
            style={{
              width: 44,
              height: 44,
              flex: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--display)',
              fontSize: 22,
              fontWeight: 800,
              color: 'var(--accent)',
              background: 'color-mix(in srgb,var(--accent) 12%,var(--card))',
              border: '1.5px solid var(--accent)',
              clipPath: 'polygon(0 0,calc(100% - 10px) 0,100% 10px,100% 100%,10px 100%,0 calc(100% - 10px))',
              boxShadow: '0 0 18px color-mix(in srgb,var(--accent) 28%,transparent)',
            }}
          >
            {rank}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span
            style={{
              width: 60,
              height: 60,
              flex: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 26,
              background:
                'linear-gradient(135deg,color-mix(in srgb,var(--accent) 18%,var(--card)),var(--panel2))',
              border: '1px solid color-mix(in srgb,var(--accent) 35%,var(--line2))',
              clipPath: 'polygon(0 0,calc(100% - 11px) 0,100% 11px,100% 100%,11px 100%,0 calc(100% - 11px))',
            }}
          >
            ⚔️
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 24,
                fontWeight: 800,
                fontFamily: 'var(--display)',
                lineHeight: 1.1,
                color: 'var(--text)',
              }}
            >
              {names}
            </div>
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 11,
                letterSpacing: '.1em',
                color: 'var(--muted)',
                marginTop: 4,
              }}
            >
              {members.length} integrantes
            </div>
          </div>
        </div>
        <div style={{ position: 'absolute', left: -24, top: 0, bottom: 0, width: 3, background: 'var(--accent)', opacity: 0.7 }} />
      </div>

      {/* TABS (só PAPÉIS funcional nesta leva) */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--line)', overflowX: 'auto', marginTop: 2 }}>
        {GRUPO_TABS.map((t) => {
          const on = t.id === tab
          return (
            <button
              key={t.id}
              disabled={!on}
              style={{
                flex: 'none',
                padding: '11px 16px',
                background: 'none',
                border: 'none',
                borderBottom: `2px solid ${on ? 'var(--accent)' : 'transparent'}`,
                fontFamily: 'var(--mono)',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '.1em',
                color: on ? 'var(--accent)' : 'var(--muted)',
                cursor: on ? 'pointer' : 'default',
                whiteSpace: 'nowrap',
                opacity: on ? 1 : 0.45,
              }}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {/* BALANCEAMENTO */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.16em', color: 'var(--muted)' }}>
          {'// BALANCEAMENTO DE PAPÉIS'}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 640, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ ...rowGrid, padding: '0 4px 6px', borderBottom: '1px solid var(--line)' }}>
              <div />
              {BAL_HEADS.map((head) => (
                <div
                  key={head.l}
                  style={{
                    textAlign: 'center',
                    fontFamily: 'var(--mono)',
                    fontSize: 9,
                    letterSpacing: '.06em',
                    color: 'var(--muted)',
                    lineHeight: 1.3,
                  }}
                >
                  <div style={{ fontSize: 12, color: head.cor }}>{head.ic}</div>
                  {head.l}
                </div>
              ))}
            </div>
            {rows.map((row) => (
              <BalRow
                key={row.id}
                label={row.label}
                em={row.em}
                tier={`Tier ${row.tier}`}
                values={row.values}
              />
            ))}
            <BalRow label="Grupo" tier={`Tier ${maxTier}`} values={totals} isGroup />
          </div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, textWrap: 'pretty' }}>
          {BAL_CAPTION}
        </div>
      </div>
    </div>
  )
}
