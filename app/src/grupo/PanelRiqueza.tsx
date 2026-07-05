// Painel "RIQUEZA DA MESA" (aba RIQUEZA) — markup/estilos/semântica VERBATIM
// do design (Companion App.dc.html, §GRUPOS + build recuperado do renderVals):
//   - cabeçalhos ordenáveis (grpCycleSort/applySort, aba 'riqueza'); sem
//     sort → alfabético pt por nome; linha Grupo sempre por último;
//   - tooltips: heads 'riq:h1..h5', células 'riq:r<gi>c<i+1>' com gi = índice
//     na lista ORIGINAL (delta desc, a ordem de G.riqRows do design), rótulo
//     Grupo 'riq:r5c0', hero RIQUEZA TOTAL 'riq:f1';
//   - cores: membro var(--blue)/var(--text) com a coluna Δ via dltCor
//     (sinal + → #3fbf6a, − → #d8695c); linha Grupo toda var(--accent);
//     weight 500/800.
// Dados espelham o plugin: computeMemberWealthParts (runtime/wealth/
// pricing.ts), tabela de riqueza esperada (economy-table*.ts) e
// appendWealthSection (render-party-sheet.ts): delta = pers − esperado(nível),
// lista original por delta desc, linha Grupo com somas e hero RIQUEZA TOTAL.
// Preços vêm dos docs reais dos itens (`preço:: N PO` via vault-data).
import { useMemo, useState, type CSSProperties } from 'react'
import { useCatalog } from '../data/CatalogContext'
import { useDocs } from '../data/useDoc'
import type { IndexDocEntry, VaultDoc } from '../data/types'
import type { GrupoTip } from './gtip'
import { NameCell, SortHead, ValueCell, dltCor, rowShellStyle, sectionTitleStyle } from './panel-ui'
import { applySort, cycleSort, gnum, sortArrow, type GrpSort } from './sort'
import { fmtPlain, nivelOf } from './stats'
import {
  computeMemberWealthParts,
  expectedWealthForLevel,
  precoPO,
  priceTargets,
  type PriceOf,
} from './wealth'

// Verbatim do script do design (GRUPO.riqHeads) — emojis idênticos aos
// usados pelo plugin em appendWealthSection (EMOJI.subcategoria.
// Especializacao/Tesouro, EMOJI.categoria.Consumivel, EMOJI.glyph.
// GoldCoin/DeltaTri).
const RIQ_HEADS = [
  { ic: '🎖️', l: 'NVL' },
  { ic: '🧪', l: 'CNS' },
  { ic: '🪙', l: 'ORO' },
  { ic: '💍', l: 'TSR' },
  { ic: '△', l: 'DLT' },
]

const grid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(220px,3fr) minmax(46px,.65fr) repeat(4,minmax(80px,1fr))',
  gap: 6,
  alignItems: 'center',
}

interface Row {
  id: string
  nome: string
  cells: string[]
  grupo: boolean
  /** gi do design: índice na lista original (gidx antes do applySort). */
  gi: number
}

export function PanelRiqueza({
  members,
  docs,
  tip,
}: {
  members: IndexDocEntry[]
  docs: Map<string, VaultDoc> | undefined
  tip?: GrupoTip
}) {
  const catalog = useCatalog()
  const [sort, setSort] = useState<GrpSort | null>(null)

  // Pré-carrega os docs dos itens precificáveis (mesmos campos que
  // pricing.ts lê); resolução de link espelha getFirstLinkpathDest.
  const priceIds = useMemo(() => {
    if (!docs) return []
    const ids = new Set<string>()
    for (const member of members) {
      for (const target of priceTargets(docs.get(member.id)?.frontmatter)) {
        const res = catalog.resolve(target)
        if (res.kind === 'doc') ids.add(res.id)
      }
    }
    return [...ids].sort()
  }, [members, docs, catalog])
  const priceDocs = useDocs(priceIds)

  const ready = docs != null && priceDocs != null
  const priceOf: PriceOf = (target) => {
    const res = catalog.resolve(target)
    return res.kind === 'doc' ? precoPO(priceDocs?.get(res.id)) : 0
  }

  const deltaStr = (delta: number) => `${delta >= 0 ? '+' : ''}${Math.round(delta)} PO`

  // Lista original na ordem do plugin (delta desc — a ordem de G.riqRows).
  const computed = ready
    ? members.map((member) => {
        const doc = docs.get(member.id)
        const nivel = nivelOf(doc)
        const parts = computeMemberWealthParts(doc?.frontmatter, priceOf)
        const delta = parts.ouro + parts.itensSemConsumiveis - expectedWealthForLevel(nivel)
        return { id: member.id, name: member.basename ?? member.id, nivel, parts, delta }
      })
    : []
  computed.sort((a, b) => b.delta - a.delta || a.name.localeCompare(b.name, 'pt'))

  const base: Row[] = computed.map((r, i) => ({
    id: r.id,
    nome: r.name,
    cells: [
      String(r.nivel),
      `${Math.round(r.parts.consumiveis)} PO`,
      `${Math.round(r.parts.ouro)} PO`,
      `${Math.round(r.parts.itensSemConsumiveis)} PO`,
      deltaStr(r.delta),
    ],
    grupo: false,
    gi: i,
  }))
  const maxNivel = computed.length ? Math.max(...computed.map((r) => r.nivel)) : 1
  const sumTotal = computed.reduce((a, r) => a + r.parts.totalComTudo, 0)
  if (computed.length) {
    base.push({
      id: '::grupo',
      nome: 'Grupo',
      cells: [
        String(maxNivel),
        `${Math.round(computed.reduce((a, r) => a + r.parts.consumiveis, 0))} PO`,
        `${Math.round(computed.reduce((a, r) => a + r.parts.ouro, 0))} PO`,
        `${Math.round(computed.reduce((a, r) => a + r.parts.itensSemConsumiveis, 0))} PO`,
        deltaStr(computed.reduce((a, r) => a + r.delta, 0)),
      ],
      grupo: true,
      gi: base.length,
    })
  }
  const rows = applySort(base, sort, (r, c) => gnum(r.cells[c]), (r) => r.nome)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={sectionTitleStyle}>{'// RIQUEZA DA MESA'}</div>
      <div style={{ overflowX: 'auto', scrollbarWidth: 'thin' }}>
        <div style={{ minWidth: 680, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ ...grid, padding: '0 4px 6px', borderBottom: '1px solid var(--line)' }}>
            <div />
            {RIQ_HEADS.map((h, i) => (
              <SortHead
                key={h.l}
                ic={h.ic}
                label={h.l}
                letterSpacing=".04em"
                active={sort?.col === i}
                arr={sortArrow(sort, i)}
                onClick={() => setSort((s) => cycleSort(s, i))}
                onTipEnter={tip?.tipE(`riq:h${i + 1}`)}
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
                onTipEnter={row.grupo ? tip?.tipE('riq:r5c0') : undefined}
                tip={tip}
              />
              {row.cells.map((v, i) => (
                <ValueCell
                  key={RIQ_HEADS[i].l}
                  value={v}
                  weight={row.grupo ? 800 : 500}
                  cor={row.grupo ? 'var(--accent)' : i === 4 ? dltCor(v) : 'var(--text)'}
                  onTipEnter={tip?.tipE(`riq:r${row.gi}c${i + 1}`)}
                  tip={tip}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      {/* Hero "RIQUEZA TOTAL" — verbatim do design (heroTipE:'riq:f1'). */}
      <div
        onMouseEnter={tip?.tipE('riq:f1')}
        onMouseMove={tip?.move}
        onMouseLeave={tip?.hide}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '13px 18px',
          cursor: 'help',
          background:
            'linear-gradient(135deg,color-mix(in srgb,var(--accent) 10%,var(--panel2)),var(--panel))',
          border: '1px solid color-mix(in srgb,var(--accent) 35%,var(--line2))',
          clipPath: 'polygon(0 0,calc(100% - 13px) 0,100% 13px,100% 100%,13px 100%,0 calc(100% - 13px))',
          marginTop: 2,
        }}
      >
        <span style={{ fontSize: 20 }}>💰</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.12em', color: 'var(--muted)' }}>
          RIQUEZA TOTAL
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent)' }}>
          {ready ? `${fmtPlain(sumTotal)} PO` : '—'}
        </span>
      </div>
    </div>
  )
}
