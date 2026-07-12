// Visão TABELA do Mestre (#192) — nas listas de pasta do compêndio, agrupa
// os docs pelo TIPO (registro central em list-columns.ts) e renderiza uma
// tabela por grupo com colunas do frontmatter real, ordenáveis por clique
// (asc/desc). Cabeçalhos são as próprias chaves de campo e valores vêm de
// columnValue (inline → FM, mesma regra do DocTable); célula sem valor no
// doc mostra '—' e ordena sempre pro fim — nunca se inventa dado.
import { useMemo, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { useDocs } from '../../data/useDoc'
import type { IndexDocEntry, VaultDoc } from '../../data/types'
import { docPath } from '../../paths'
import { unquote } from '../../markdown/dataview-value'
import { columnValue } from './DocTable'
import { InlineFieldValue } from './InlineFieldValue'
import { mestreGroupOf, type MestreGroup } from './list-columns'

// ──────────────────────────────────────────────────────────────────────────
// Estilos — vocabulário dos painéis (mono, var(--...), canto cortado)
// ──────────────────────────────────────────────────────────────────────────

/** clip-path de canto cortado (mesmo polígono do design). */
function clip(n: number): NonNullable<CSSProperties['clipPath']> {
  return `polygon(0 0,calc(100% - ${n}px) 0,100% ${n}px,100% 100%,${n}px 100%,0 calc(100% - ${n}px))`
}

/** Pill mono (skin do badge do design — mesma do HexMapEditor). */
export function pillStyle(active: boolean): CSSProperties {
  return {
    fontFamily: 'var(--mono)',
    fontSize: 10,
    letterSpacing: '.16em',
    color: active ? 'var(--panel)' : 'var(--accent)',
    background: active ? 'var(--accent)' : 'color-mix(in srgb,var(--accent) 12%,transparent)',
    border: '1px solid color-mix(in srgb,var(--accent) 40%,transparent)',
    padding: '5px 12px',
    clipPath: clip(6),
    cursor: 'pointer',
  }
}

/** Cabeçalho ordenável: herda a tipografia do th (.doc-table th). */
const sortBtnStyle: CSSProperties = {
  font: 'inherit',
  letterSpacing: 'inherit',
  textTransform: 'inherit',
  color: 'inherit',
  background: 'none',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
}

// ──────────────────────────────────────────────────────────────────────────
// Ordenação
// ──────────────────────────────────────────────────────────────────────────

const WIKILINK = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g

/** Chave de ordenação: wikilinks viram o texto exibido (alias, senão alvo)
 *  e string literals perdem as aspas — ordena pelo que o usuário vê. */
function sortText(value: string | null): string {
  if (!value) return ''
  return unquote(value)
    .replace(WIKILINK, (_m, alvo: string, alias?: string) => alias ?? alvo)
    .trim()
}

// numeric: "5 PO" < "10 PO", "d4+2" < "d12+6"
const collator = new Intl.Collator('pt', { numeric: true })

interface Sort {
  col: string
  dir: 1 | -1
}

// ──────────────────────────────────────────────────────────────────────────
// Tabela de um grupo (tipo)
// ──────────────────────────────────────────────────────────────────────────

function MestreTypeTable({
  group,
  entries,
  docs,
}: {
  group: MestreGroup
  entries: IndexDocEntry[]
  docs: Map<string, VaultDoc> | undefined
}) {
  const [sort, setSort] = useState<Sort | null>(null)

  // mesma coluna alterna asc↔desc; coluna nova começa asc
  const toggleSort = (col: string) =>
    setSort((cur) => ({ col, dir: cur?.col === col ? ((-cur.dir) as 1 | -1) : 1 }))

  const rows = useMemo(() => {
    if (!sort) return entries
    return [...entries].sort((a, b) => {
      const va = sortText(columnValue(docs?.get(a.id), sort.col))
      const vb = sortText(columnValue(docs?.get(b.id), sort.col))
      if (!va && !vb) return 0
      if (!va) return 1 // vazio ('—') sempre no fim
      if (!vb) return -1
      return sort.dir * collator.compare(va, vb)
    })
  }, [entries, docs, sort])

  return (
    <div>
      <div className="kicker">
        {'// '}
        {group.label.toLocaleUpperCase('pt-BR')}
        <span style={{ marginLeft: 8, color: 'var(--accent)' }}>{entries.length}</span>
      </div>
      <table className="doc-table" data-mestre-tabela={group.label}>
        <thead>
          <tr>
            <th />
            {group.columns.map((col) => (
              <th
                key={col}
                aria-sort={
                  sort?.col === col ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined
                }
              >
                <button type="button" onClick={() => toggleSort(col)} style={sortBtnStyle}>
                  {col}
                  {sort?.col === col ? (
                    <span aria-hidden="true">{sort.dir === 1 ? ' ▲' : ' ▼'}</span>
                  ) : null}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((entry) => (
            <tr key={entry.id}>
              <td>
                <Link to={docPath(entry.id)}>{entry.basename ?? entry.id}</Link>
              </td>
              {group.columns.map((col) => {
                const value = columnValue(docs?.get(entry.id), col)
                return <td key={col}>{value ? <InlineFieldValue value={value} /> : '—'}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────────────
// Agrupamento por tipo
// ──────────────────────────────────────────────────────────────────────────

export function MestreTables({ entries }: { entries: IndexDocEntry[] }) {
  // carrega os docs uma vez pra lista toda (cache compartilhado do useDocs)
  const ids = useMemo(() => entries.map((e) => e.id), [entries])
  const docs = useDocs(ids)

  // um grupo por tipo, na ordem de aparição no índice
  const groups = useMemo(() => {
    const byLabel = new Map<string, { group: MestreGroup; entries: IndexDocEntry[] }>()
    for (const entry of entries) {
      const group = mestreGroupOf(entry)
      const cur = byLabel.get(group.label)
      if (cur) cur.entries.push(entry)
      else byLabel.set(group.label, { group, entries: [entry] })
    }
    return [...byLabel.values()]
  }, [entries])

  if (!entries.length) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {groups.map(({ group, entries: groupEntries }) => (
        <MestreTypeTable key={group.label} group={group} entries={groupEntries} docs={docs} />
      ))}
    </div>
  )
}
