// Página do grupo — markup/estilos VERBATIM da seção ===== GRUPOS ===== do
// design puxado (design/pulled/Companion App.dc.html), sem personagem
// claimed: recebe o doc do grupo e liga os dados reais.
// Abas (GRUPO_TABS) navegam um track deslizante ([data-track data-track-auto]
// do design: translateX(-idx*100%) + altura do painel ativo); trocar de aba
// limpa o tooltip (grupoTabs do design: setState({grupoTab,gtip:null})).
// O build do grupo no renderVals (cauda recuperada do pull) define:
//   - grpCycleSort/grpSort + applySort/headMap → sort.ts;
//   - buildGtip/gtipShow/gtipMove/gtipHide + window.__GTIPS → gtip.tsx/gtips.ts;
//   - roleCols, nameCor/weight, dltCor, chaves tipE ('bal:r<gi>c<n>', ...).
import { useMemo, useState, type CSSProperties } from 'react'
import { PanelTrack, TrackPanel } from '../components/ficha/bits'
import { useCatalog } from '../data/CatalogContext'
import { useAssetIndex } from '../data/assets'
import { useDoc, useDocs } from '../data/useDoc'
import { linkLabel } from '../markdown/dataview-value'
import {
  BAL_CAPTION,
  PAPEIS,
  groupMembers,
  groupTotals,
  papelValues,
  rankColors,
  rankLetter,
  sintoniaEmoji,
  tierBarColor,
  tierFromLevel,
  type Papel,
  type PapelValues,
} from './party'
import { orderAlphabetical } from './order'
import { NameCell, SortHead, papelTdWarnStyle, rowShellStyle, sectionTitleStyle } from './panel-ui'
import { applySort, cycleSort, sortArrow, type GrpSort } from './sort'
import { useGrupoTip, type GrupoTip } from './gtip'
import { resolveGroupImageUrl } from './group-image'
import { PanelExploracao } from './PanelExploracao'
import { PanelVida } from './PanelVida'
import { PanelRiqueza } from './PanelRiqueza'
import { PanelDestaques } from './PanelDestaques'
import { PanelAtaques } from './PanelAtaques'

// Verbatim do script do design (GRUPO_TABS / GRUPO.balHeads / roleCols).
// EXPLORAÇÃO (issue #36) é extensão sancionada: nova PRIMEIRA aba, sem
// design dedicado — as demais mantêm a ordem do design.
const GRUPO_TABS = [
  { id: 'exploracao', label: 'EXPLORAÇÃO' },
  { id: 'papeis', label: 'PAPÉIS' },
  { id: 'competencias', label: 'COMPETÊNCIAS' },
  { id: 'riqueza', label: 'RIQUEZA' },
  { id: 'pericias', label: 'PERÍCIAS' },
  { id: 'ataques', label: 'ATAQUES' },
]
const ROLE_COLS = ['#4ade80', '#c084fc', '#f87171', '#60a5fa']
const BAL_HEADS: { ic: string; l: string; cor: string; papel?: (typeof PAPEIS)[number] }[] = [
  { ic: '🎖️', l: 'TIR', cor: 'var(--accent)' },
  { ic: '★', l: 'LID', cor: ROLE_COLS[0], papel: 'Lider' },
  { ic: '★', l: 'CON', cor: ROLE_COLS[1], papel: 'Controlador' },
  { ic: '★', l: 'ABT', cor: ROLE_COLS[2], papel: 'Abatedor' },
  { ic: '★', l: 'VAN', cor: ROLE_COLS[3], papel: 'Vanguarda' },
]

const rowGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(240px,3fr) minmax(64px,.7fr) repeat(4,minmax(56px,1fr))',
  gap: 6,
  alignItems: 'center',
}

/**
 * Célula de estrelas do design: 1ª estrela, guia tracejada, resto, e "+"
 * (plus do build; cor do "+" = t.cor). O markup lê t.s1.c/t.s1.o e t.rest,
 * mas o build recuperado só fornece slots:[{on}] + cor — o enriquecimento
 * s1/rest não existe em lugar nenhum do pull; a opacidade da estrela vazia
 * (0.18) é a única aproximação restante.
 */
function StarCell({
  value,
  cor,
  warn,
  onTipEnter,
  tip,
}: {
  value: number
  cor: string
  /** Coluna com soma do Grupo <1 estrela → aviso do plugin (papelTdWarnStyle). */
  warn?: boolean
  onTipEnter?: (e: React.MouseEvent) => void
  tip?: GrupoTip
}) {
  const slots = [0, 1, 2].map((k) => k < value)
  const star = (on: boolean, key: number) => (
    <span key={key} style={{ fontSize: 15, lineHeight: 1, color: cor, opacity: on ? 1 : 0.18 }}>
      ★
    </span>
  )
  return (
    <div
      onMouseEnter={onTipEnter}
      onMouseMove={tip?.move}
      onMouseLeave={tip?.hide}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        cursor: 'help',
        ...(warn ? papelTdWarnStyle : null),
      }}
    >
      {star(slots[0], 0)}
      <span
        style={{
          width: 0,
          alignSelf: 'stretch',
          borderLeft: '1px dashed color-mix(in srgb,var(--muted) 60%,transparent)',
          margin: '1px -1.5px',
        }}
      />
      {star(slots[1], 1)}
      {star(slots[2], 2)}
      {value > 3 ? (
        <span style={{ fontSize: 12, color: cor, marginLeft: 2, fontWeight: 700 }}>+</span>
      ) : null}
    </div>
  )
}

interface BalRowData {
  id: string
  label: string
  em: string | null
  tier: number
  values: PapelValues
  grupo: boolean
  /** gi do design: índice na lista original (gidx antes do applySort). */
  gi: number
}

function BalRow({
  row,
  tierUnbalanced,
  warnCols,
  tip,
}: {
  row: BalRowData
  /** Tier divergente entre membros (section-papel.ts:50) — só células de membro. */
  tierUnbalanced: boolean
  /** Papéis com soma do Grupo <1 (section-papel.ts:136/161) — membros E linha Grupo. */
  warnCols: Record<Papel, boolean>
  tip?: GrupoTip
}) {
  const g = row.grupo ? 1 : 0
  return (
    <div style={{ ...rowGrid, ...rowShellStyle(row.grupo) }}>
      <NameCell
        name={row.label}
        em={row.em}
        weight={row.grupo ? 800 : 600}
        cor={row.grupo ? 'var(--accent)' : 'var(--text)'}
        onTipEnter={row.grupo ? tip?.tipE('bal:r5c0') : undefined}
        tip={tip}
      />
      <div
        onMouseEnter={tip?.tipE(`bal:r${row.gi}c1`)}
        onMouseMove={tip?.move}
        onMouseLeave={tip?.hide}
        style={{
          textAlign: 'center',
          fontFamily: 'var(--mono)',
          fontSize: 13,
          fontWeight: 700,
          cursor: 'help',
          color: `color-mix(in srgb,var(--accent) ${g * 55}%,var(--text))`,
          // Plugin: célula de tier de MEMBRO recebe o warn quando os tiers
          // divergem (section-papel.ts:127); a linha Grupo não (ts:154-159).
          ...(tierUnbalanced && !row.grupo ? papelTdWarnStyle : null),
        }}
      >
        Tier {row.tier}
      </div>
      {BAL_HEADS.slice(1).map((head, i) => (
        <StarCell
          key={head.l}
          value={row.values[head.papel!]}
          cor={ROLE_COLS[i] || 'var(--accent)'}
          warn={warnCols[head.papel!]}
          onTipEnter={tip?.tipE(`bal:r${row.gi}c${i + 2}`)}
          tip={tip}
        />
      ))}
    </div>
  )
}

/** Painel "BALANCEAMENTO DE PAPÉIS" (aba PAPÉIS) — dados espelham
 *  section-papel.ts; lista original alfabética (orderMembersAlphabetical =
 *  ordem de G.balRows do design); applySort: coluna clicada ou classe pt. */
function PanelBalanceamento({
  rows,
  tierUnbalanced,
  warnCols,
  tip,
}: {
  rows: BalRowData[]
  tierUnbalanced: boolean
  warnCols: Record<Papel, boolean>
  tip?: GrupoTip
}) {
  const [sort, setSort] = useState<GrpSort | null>(null)
  const sorted = applySort(
    rows,
    sort,
    (r, c) => (c === 0 ? r.tier : r.values[PAPEIS[c - 1]] || 0),
    (r) => r.label,
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={sectionTitleStyle}>{'// BALANCEAMENTO DE PAPÉIS'}</div>
      <div style={{ overflowX: 'auto', scrollbarWidth: 'thin' }}>
        <div style={{ minWidth: 640, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ ...rowGrid, padding: '0 4px 6px', borderBottom: '1px solid var(--line)' }}>
            <div />
            {BAL_HEADS.map((head, i) => (
              <SortHead
                key={head.l}
                ic={head.ic}
                label={head.l}
                fontSize={9}
                letterSpacing=".06em"
                icColor={head.cor}
                active={sort?.col === i}
                arr={sortArrow(sort, i)}
                warn={i === 0 && tierUnbalanced}
                onClick={() => setSort((s) => cycleSort(s, i))}
                onTipEnter={tip?.tipE(`bal:h${i + 1}`)}
                tip={tip}
              />
            ))}
          </div>
          {sorted.map((row) => (
            <BalRow
              key={row.id}
              row={row}
              tierUnbalanced={tierUnbalanced}
              warnCols={warnCols}
              tip={tip}
            />
          ))}
        </div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, textWrap: 'pretty' }}>
        {BAL_CAPTION}
      </div>
    </div>
  )
}

export function GrupoView({ groupId }: { groupId: string }) {
  const catalog = useCatalog()
  const assets = useAssetIndex()
  const { doc: groupDoc } = useDoc(groupId)
  const [tab, setTab] = useState('exploracao')
  const tabIdx = Math.max(0, GRUPO_TABS.findIndex((t) => t.id === tab))
  const tip = useGrupoTip()

  const members = useMemo(() => groupMembers(catalog, groupId), [catalog, groupId])
  const memberDocs = useDocs(useMemo(() => members.map((m) => m.id), [members]))

  const entry = catalog.entryById.get(groupId)
  const names = entry?.basename ?? groupId
  const subcategoria =
    typeof groupDoc?.frontmatter['subcategoria'] === 'string'
      ? (groupDoc.frontmatter['subcategoria'] as string)
      : ''
  const imageUrl = resolveGroupImageUrl(groupDoc, entry?.basename, assets)

  // Lista original alfabética (espelha orderMembersAlphabetical / G.balRows).
  const balRows: BalRowData[] = orderAlphabetical(members).map((member, i) => {
    const doc = memberDocs?.get(member.id)
    return {
      id: member.id,
      label: linkLabel(doc?.frontmatter['Classe']) || member.basename || member.id,
      em: sintoniaEmoji(doc),
      tier: tierFromLevel(doc?.frontmatter['Nível']),
      values: papelValues(doc),
      grupo: false,
      gi: i,
    }
  })
  const maxTier = balRows.length ? Math.max(...balRows.map((r) => r.tier)) : 1
  const totals = groupTotals(balRows.map((r) => r.values))
  const rank = rankLetter(groupDoc?.frontmatter ?? {}, maxTier)
  // Cores do rank/barrinha via registro (tiers-display.ts espelhado em party.ts).
  const rk = rankColors(rank)
  const barColor = tierBarColor(maxTier)
  // Avisos do plugin (section-papel.ts): tiers de MEMBRO divergentes (ts:50)
  // e papéis com soma do Grupo <1 estrela (ts:136/161).
  const tierUnbalanced = new Set(balRows.map((r) => r.tier)).size > 1
  const warnCols = Object.fromEntries(PAPEIS.map((p) => [p, totals[p] < 1])) as Record<
    Papel,
    boolean
  >
  const balAll: BalRowData[] = [
    ...balRows,
    { id: '::grupo', label: 'Grupo', em: null, tier: maxTier, values: totals, grupo: true, gi: balRows.length },
  ]

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
          {/* Rank box do design com as cores do registro partyBountyRank —
              espelha o rankBadge do plugin (render-party-sheet.ts:215-219:
              color/bg/border = rk.*) e o glow via --party-glow (styles.css:12420). */}
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
              color: rk.color,
              background: rk.bg,
              border: `1.5px solid ${rk.color}`,
              clipPath: 'polygon(0 0,calc(100% - 10px) 0,100% 10px,100% 100%,10px 100%,0 calc(100% - 10px))',
              boxShadow: `0 0 18px ${rk.glow}`,
            }}
          >
            {rank}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* Slot 60×60: imagem do grupo (espelha resolveGroupImage do plugin);
              fallback ⚔️ verbatim do design. */}
          <span
            style={{
              width: 60,
              height: 60,
              flex: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 26,
              overflow: 'hidden',
              background:
                'linear-gradient(135deg,color-mix(in srgb,var(--accent) 18%,var(--card)),var(--panel2))',
              border: '1px solid color-mix(in srgb,var(--accent) 35%,var(--line2))',
              clipPath: 'polygon(0 0,calc(100% - 11px) 0,100% 11px,100% 100%,11px 100%,0 calc(100% - 11px))',
            }}
          >
            {imageUrl ? (
              <img
                src={imageUrl}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            ) : (
              '⚔️'
            )}
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
        {/* Barrinha lateral = tier máximo do grupo — gradiente verbatim do
            plugin (render-party-sheet.ts:208) com a cor do registro partyTierBar. */}
        <div
          style={{
            position: 'absolute',
            left: -24,
            top: 0,
            bottom: 0,
            width: 3,
            background: `linear-gradient(180deg,${barColor},color-mix(in srgb,${barColor} 60%,black))`,
            opacity: 0.7,
          }}
        />
      </div>

      {/* TABS (navegação real — grupoTabs do design limpa o gtip ao trocar) */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--line)', overflowX: 'auto', scrollbarWidth: 'none', marginTop: 2 }}>
        {GRUPO_TABS.map((t) => {
          const on = t.id === tab
          return (
            <button
              key={t.id}
              onClick={() => {
                setTab(t.id)
                tip.clear()
              }}
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
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {/* TRACK deslizante (data-track data-track-auto do design) */}
      <PanelTrack index={tabIdx}>
        <TrackPanel pad="0">
          <PanelExploracao groupId={groupId} />
        </TrackPanel>
        <TrackPanel pad="0">
          <PanelBalanceamento
            rows={balAll}
            tierUnbalanced={tierUnbalanced}
            warnCols={warnCols}
            tip={tip}
          />
        </TrackPanel>
        <TrackPanel pad="0">
          <PanelVida members={members} docs={memberDocs} tip={tip} />
        </TrackPanel>
        <TrackPanel pad="0">
          <PanelRiqueza members={members} docs={memberDocs} tip={tip} />
        </TrackPanel>
        <TrackPanel pad="0">
          <PanelDestaques members={members} docs={memberDocs} tip={tip} />
        </TrackPanel>
        <TrackPanel pad="0">
          <PanelAtaques members={members} docs={memberDocs} tip={tip} />
        </TrackPanel>
      </PanelTrack>

      {/* Tooltip flutuante (sc-if grupo.gtip do design) */}
      {tip.overlay}
    </div>
  )
}
