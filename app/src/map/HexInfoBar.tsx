// Barra horizontal de INFO de um hex — o LUGAR pontual do hex (NESTE HEX, cor
// de destaque) separado das ÁREAS/regiões que o englobam (DENTRO DE). Nasceu no
// /mapa do mestre (AtlasMapaPage, #426) e virou compartilhada pra exploração
// dos grupos (pedido: "clicar num lugar mostra embaixo tipo o atlas"). Nomes/
// tipos vêm do catálogo/FM (nunca inventados); clicar num chip abre o doc.
import { useMemo, type CSSProperties } from 'react'
import { clip } from '../components/ficha/bits'
import { useCatalog } from '../data/CatalogContext'
import { useDocs } from '../data/useDoc'
import { areasAt, cellAt, type HexMapCell } from '../data/hexmap-store'

const mono9: CSSProperties = {
  fontFamily: 'var(--mono)',
  fontSize: 9.5,
  letterSpacing: '.1em',
  color: 'var(--muted)',
}

export function HexInfoBar({
  cells,
  col,
  row,
  onOpenDoc,
  onClose,
}: {
  cells: HexMapCell[]
  col: number
  row: number
  onOpenDoc: (id: string) => void
  onClose: () => void
}) {
  const catalog = useCatalog()
  const cel = cellAt(cells, col, row)
  const areas = useMemo(() => areasAt(cells, col, row), [cells, col, row])
  const ids = useMemo(() => {
    const out: string[] = []
    if (cel?.localId) out.push(cel.localId)
    for (const a of areas) if (!out.includes(a)) out.push(a)
    return out
  }, [cel, areas])
  const docs = useDocs(ids)

  if (!cel?.localId && areas.length === 0) return null

  const chip = (id: string, destaque: boolean) => {
    const d = docs?.get(id)
    const nome = d?.basename ?? catalog.entryById.get(id)?.basename ?? id.split('/').pop()
    const tipo = typeof d?.subtype === 'string' ? d.subtype : ''
    return (
      <button
        key={id}
        data-hex-info-lugar={destaque ? '' : undefined}
        onClick={() => onOpenDoc(id)}
        style={{
          display: 'inline-flex',
          alignItems: 'baseline',
          gap: 7,
          padding: '5px 11px',
          background: 'var(--card)',
          border: destaque
            ? '1px solid color-mix(in srgb,var(--accent) 55%,var(--line2))'
            : '1px solid var(--line2)',
          color: destaque ? 'var(--accent)' : 'var(--blue)',
          cursor: 'pointer',
          clipPath: clip(6),
          fontSize: 13.5,
          fontWeight: destaque ? 700 : 600,
        }}
      >
        {nome}
        {tipo ? <span style={{ ...mono9, fontSize: 9 }}>{tipo.toUpperCase()}</span> : null}
      </button>
    )
  }

  const lugar = cel?.localId ?? null
  const areasSoltas = areas.filter((a) => a !== lugar)
  return (
    <div
      data-hex-info=""
      style={{
        position: 'absolute',
        left: 10,
        right: 10,
        bottom: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
        padding: '10px 14px',
        background: 'color-mix(in srgb,var(--panel) 92%,transparent)',
        border: '1px solid var(--line2)',
        clipPath: clip(10),
        backdropFilter: 'blur(3px)',
        zIndex: 5,
      }}
    >
      {lugar ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span style={{ ...mono9, fontSize: 8.5, color: 'var(--accent)' }}>NESTE HEX</span>
          {chip(lugar, true)}
        </span>
      ) : null}
      {lugar && areasSoltas.length > 0 ? (
        <span
          aria-hidden
          style={{ alignSelf: 'stretch', borderLeft: '1px solid var(--line2)', margin: '0 4px' }}
        />
      ) : null}
      {areasSoltas.length > 0 ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ ...mono9, fontSize: 8.5 }}>DENTRO DE</span>
          {areasSoltas.map((id) => chip(id, false))}
        </span>
      ) : null}
      <span style={{ flex: 1 }} />
      <button
        aria-label="Fechar info do hex"
        onClick={onClose}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--muted)',
          cursor: 'pointer',
          fontSize: 15,
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  )
}
