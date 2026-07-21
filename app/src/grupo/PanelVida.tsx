// Painel "VIDA, DEFESAS, SENTIDOS E MOVIMENTO" (aba COMPETÊNCIAS) —
// markup/estilos/semântica VERBATIM do design (Companion App.dc.html,
// §GRUPOS + build recuperado do renderVals):
//   - cabeçalhos ordenáveis (grpCycleSort/applySort, aba 'competencias');
//     sem sort → alfabético pt por nome; linha Grupo sempre por último;
//   - tooltips: heads 'vida:h1..h9', células 'vida:r<gi>c<i+1>' com gi =
//     índice na lista ORIGINAL (ordem do plugin: nível desc + nome, que é a
//     ordem das linhas de G.vidaRows do design), rótulo Grupo 'vida:r5c0';
//   - nameCor membro var(--blue) / Grupo var(--accent); weight 500/800;
//     células var(--text) / var(--accent).
// Dados espelham o plugin: buildStatsRows/computeGrupoAggregates
// (aggregates.ts) e orderMembersLevelDescThenName (render-party-sheet.ts).
import { useState, type CSSProperties } from 'react'
import type { IndexDocEntry, VaultDoc } from '../data/types'
import { useDetail } from '../data/detail-context'
import type { GrupoTip } from './gtip'
import { abrirMembroDetalhe, NameCell, SortHead, ValueCell, rowShellStyle, sectionTitleStyle } from './panel-ui'
import { applySort, cycleSort, gnum, sortArrow, type GrpSort } from './sort'
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

interface Row {
  id: string
  nome: string
  cells: string[]
  grupo: boolean
  /** gi do design: índice na lista original (gidx antes do applySort). */
  gi: number
}

export function PanelVida({
  members,
  docs,
  tip,
}: {
  members: IndexDocEntry[]
  docs: Map<string, VaultDoc> | undefined
  tip?: GrupoTip
}) {
  const [sort, setSort] = useState<GrpSort | null>(null)
  const detail = useDetail()

  // Lista original na ordem do plugin (espelha G.vidaRows do design).
  const ordered = orderByLevelDesc(members, docs)
  const stats = ordered.map((m) => memberStats(docs?.get(m.id)?.frontmatter))
  const agg = computeGrupoAggregates(stats)
  const base: Row[] = ordered.map((member, i) => ({
    id: member.id,
    nome: member.basename ?? member.id,
    cells: memberCells(stats[i]!),
    grupo: false,
    gi: i,
  }))
  if (agg) {
    base.push({
      id: '::grupo',
      nome: 'Grupo',
      cells: [
        agg.hasVit ? fmtPlain(agg.sumVit) : '—',
        agg.hasMor ? fmtPlain(agg.sumMor) : '—',
        ...DEFENSE_NAMES.map((d) => (agg.defsAvg[d] != null ? fmtPlain(agg.defsAvg[d]) : '—')),
        ...SENSE_NAMES.map((s) => (agg.snsAvg[s] != null ? fmtSigned(agg.snsAvg[s]) : '—')),
        agg.minSp != null ? fmtPlain(agg.minSp) : '—',
      ],
      grupo: true,
      gi: base.length,
    })
  }
  const rows = applySort(base, sort, (r, c) => gnum(r.cells[c]), (r) => r.nome)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={sectionTitleStyle}>{'// VIDA, DEFESAS, SENTIDOS E MOVIMENTO'}</div>
      <div style={{ overflowX: 'auto', scrollbarWidth: 'thin' }}>
        <div style={{ minWidth: 760, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ ...grid, padding: '0 4px 6px', borderBottom: '1px solid var(--line)' }}>
            <div />
            {VIDA_HEADS.map((h, i) => (
              <SortHead
                key={h.l}
                ic={h.ic}
                label={h.l}
                active={sort?.col === i}
                arr={sortArrow(sort, i)}
                onClick={() => setSort((s) => cycleSort(s, i))}
                onTipEnter={tip?.tipE(`vida:h${i + 1}`)}
                tip={tip}
              />
            ))}
          </div>
          {rows.map((row) => (
            <div key={row.id} style={{ ...grid, ...rowShellStyle(row.grupo) }}>
              <NameCell
                name={row.nome}
                weight={row.grupo ? 800 : 500}
                cor={row.grupo ? 'var(--accent)' : 'var(--blue)'}
                onTipEnter={row.grupo ? tip?.tipE('vida:r5c0') : undefined}
                onOpen={row.grupo ? undefined : () => abrirMembroDetalhe(detail, row.id)}
                tip={tip}
              />
              {row.cells.map((v, i) => (
                <ValueCell
                  key={VIDA_HEADS[i]!.l}
                  value={v}
                  weight={row.grupo ? 800 : 500}
                  cor={row.grupo ? 'var(--accent)' : 'var(--text)'}
                  onTipEnter={tip?.tipE(`vida:r${row.gi}c${i + 1}`)}
                  tip={tip}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
