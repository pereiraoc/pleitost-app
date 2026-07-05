// Painel "VIDA, DEFESAS, SENTIDOS E MOVIMENTO" (aba COMPETÊNCIAS) —
// markup/estilos VERBATIM do design (Companion App.dc.html, linhas
// 1158-1175); dados espelham o plugin: buildStatsRows/computeGrupoAggregates
// (aggregates.ts) e ordenação orderMembersLevelDescThenName
// (render-party-sheet.ts).
import type { CSSProperties } from 'react'
import type { IndexDocEntry, VaultDoc } from '../data/types'
import { HeadCell, NameCell, ValueCell, rowShellStyle, sectionTitleStyle } from './panel-ui'
import { orderByLevelDesc } from './order'
import {
  DEFENSE_NAMES,
  SENSE_NAMES,
  computeGrupoAggregates,
  fmtPlain,
  fmtSigned,
  memberStats,
  type MemberStats,
} from './stats'

// Verbatim do script do design (GRUPO.vidaHeads) — emojis idênticos ao
// registro COL_HEADERS do plugin (grupo-tooltips-port.ts).
const VIDA_HEADS = [
  { ic: '❤️', l: 'VIT' },
  { ic: '💙', l: 'MOR' },
  { ic: '🛡️', l: 'DEF' },
  { ic: '❤️', l: 'VIG' },
  { ic: '🔥', l: 'IMP' },
  { ic: '⚡', l: 'REF' },
  { ic: '👁️', l: 'PER' },
  { ic: '💡', l: 'ITU' },
  { ic: '👣', l: 'MOV' },
]

const grid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(220px,3.2fr) repeat(9,minmax(46px,1fr))',
  gap: 5,
  alignItems: 'center',
}

/** Células na ordem das colunas — formatos do plugin (VIT/MOR crus, defesas
 *  fmtPlain, sentidos fmtSigned, MOV fmtPlain; "—" quando falta a linha). */
function memberCells(stats: MemberStats): string[] {
  return [
    String(stats.v),
    String(stats.m),
    ...DEFENSE_NAMES.map((d) => (stats.defs[d] != null ? fmtPlain(stats.defs[d]) : '—')),
    ...SENSE_NAMES.map((s) => (stats.sns[s] != null ? fmtSigned(stats.sns[s]) : '—')),
    stats.sp != null ? fmtPlain(stats.sp) : '—',
  ]
}

export function PanelVida({
  members,
  docs,
}: {
  members: IndexDocEntry[]
  docs: Map<string, VaultDoc> | undefined
}) {
  const ordered = orderByLevelDesc(members, docs)
  const rows = ordered.map((member) => ({
    id: member.id,
    name: member.basename ?? member.id,
    stats: memberStats(docs?.get(member.id)?.frontmatter),
  }))
  const agg = computeGrupoAggregates(rows.map((r) => r.stats))
  const groupCells = agg
    ? [
        agg.hasVit ? fmtPlain(agg.sumVit) : '—',
        agg.hasMor ? fmtPlain(agg.sumMor) : '—',
        ...DEFENSE_NAMES.map((d) => (agg.defsAvg[d] != null ? fmtPlain(agg.defsAvg[d]) : '—')),
        ...SENSE_NAMES.map((s) => (agg.snsAvg[s] != null ? fmtSigned(agg.snsAvg[s]) : '—')),
        agg.minSp != null ? fmtPlain(agg.minSp) : '—',
      ]
    : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={sectionTitleStyle}>{'// VIDA, DEFESAS, SENTIDOS E MOVIMENTO'}</div>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 760, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ ...grid, padding: '0 4px 6px', borderBottom: '1px solid var(--line)' }}>
            <div />
            {VIDA_HEADS.map((h) => (
              <HeadCell key={h.l} ic={h.ic} label={h.l} />
            ))}
          </div>
          {rows.map((row) => (
            <div key={row.id} style={{ ...grid, ...rowShellStyle(false) }}>
              <NameCell name={row.name} />
              {memberCells(row.stats).map((v, i) => (
                <ValueCell key={VIDA_HEADS[i].l} value={v} />
              ))}
            </div>
          ))}
          {groupCells ? (
            <div style={{ ...grid, ...rowShellStyle(true) }}>
              <NameCell name="Grupo" isGroup />
              {groupCells.map((v, i) => (
                <ValueCell key={VIDA_HEADS[i].l} value={v} isGroup />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
