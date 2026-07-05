// Painel "RIQUEZA DA MESA" (aba RIQUEZA) — markup/estilos VERBATIM do design
// (Companion App.dc.html, linhas 1181-1201); dados espelham o plugin:
// computeMemberWealthParts (runtime/wealth/pricing.ts), tabela de riqueza
// esperada (runtime/wealth/economy-table*.ts) e appendWealthSection
// (render-party-sheet.ts): delta = pers − esperado(nível), ordenação por
// delta desc, linha Grupo com somas e hero "RIQUEZA TOTAL".
// Preços vêm dos docs reais dos itens (`preço:: N PO` via vault-data).
import { useMemo, type CSSProperties } from 'react'
import { useCatalog } from '../data/CatalogContext'
import { useDocs } from '../data/useDoc'
import type { IndexDocEntry, VaultDoc } from '../data/types'
import { HeadCell, NameCell, ValueCell, rowShellStyle, sectionTitleStyle } from './panel-ui'
import { fmtPlain, nivelOf } from './stats'
import {
  DELTA_COLORS,
  computeMemberWealthParts,
  deltaTone,
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

export function PanelRiqueza({
  members,
  docs,
}: {
  members: IndexDocEntry[]
  docs: Map<string, VaultDoc> | undefined
}) {
  const catalog = useCatalog()

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

  // Espelha appendWealthSection (render-party-sheet.ts).
  const rows = ready
    ? members.map((member) => {
        const doc = docs.get(member.id)
        const nivel = nivelOf(doc)
        const parts = computeMemberWealthParts(doc?.frontmatter, priceOf)
        const expected = expectedWealthForLevel(nivel)
        const delta = parts.ouro + parts.itensSemConsumiveis - expected
        return {
          id: member.id,
          name: member.basename ?? member.id,
          nivel,
          parts,
          delta,
          tone: deltaTone(delta, expected),
        }
      })
    : []
  rows.sort((a, b) => b.delta - a.delta || a.name.localeCompare(b.name, 'pt'))

  const maxNivel = rows.length ? Math.max(...rows.map((r) => r.nivel)) : 1
  const sumConsum = rows.reduce((a, r) => a + r.parts.consumiveis, 0)
  const sumOuro = rows.reduce((a, r) => a + r.parts.ouro, 0)
  const sumItens = rows.reduce((a, r) => a + r.parts.itensSemConsumiveis, 0)
  const sumDelta = rows.reduce((a, r) => a + r.delta, 0)
  const sumTotal = rows.reduce((a, r) => a + r.parts.totalComTudo, 0)

  const deltaStr = (delta: number) => `${delta >= 0 ? '+' : ''}${Math.round(delta)} PO`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={sectionTitleStyle}>{'// RIQUEZA DA MESA'}</div>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 680, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ ...grid, padding: '0 4px 6px', borderBottom: '1px solid var(--line)' }}>
            <div />
            {RIQ_HEADS.map((h) => (
              <HeadCell key={h.l} ic={h.ic} label={h.l} letterSpacing=".04em" />
            ))}
          </div>
          {rows.map((row) => (
            <div key={row.id} style={{ ...grid, ...rowShellStyle(false) }}>
              <NameCell name={row.name} />
              <ValueCell value={String(row.nivel)} />
              <ValueCell value={`${Math.round(row.parts.consumiveis)} PO`} />
              <ValueCell value={`${Math.round(row.parts.ouro)} PO`} />
              <ValueCell value={`${Math.round(row.parts.itensSemConsumiveis)} PO`} />
              <ValueCell value={deltaStr(row.delta)} color={DELTA_COLORS[row.tone]} />
            </div>
          ))}
          {rows.length ? (
            <div style={{ ...grid, ...rowShellStyle(true) }}>
              <NameCell name="Grupo" isGroup />
              <ValueCell value={String(maxNivel)} isGroup />
              <ValueCell value={`${Math.round(sumConsum)} PO`} isGroup />
              <ValueCell value={`${Math.round(sumOuro)} PO`} isGroup />
              <ValueCell value={`${Math.round(sumItens)} PO`} isGroup />
              <ValueCell value={deltaStr(sumDelta)} isGroup />
            </div>
          ) : null}
        </div>
      </div>
      {/* Hero "RIQUEZA TOTAL" — verbatim do design (linhas 1198-1200). */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '13px 18px',
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
