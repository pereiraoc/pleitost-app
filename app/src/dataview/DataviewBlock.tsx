import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCatalog } from '../data/CatalogContext'
import { fetchEdges } from '../data/links'
import { loadDoc } from '../data/useDoc'
import type { VaultDoc } from '../data/types'
import { docPath } from '../paths'
import { isDvLink, type DvValue } from './model'
import { runQuery, type DvResult } from './eval'
import { parseQuery } from './parse'

function Cell({ value }: { value: DvValue }) {
  const catalog = useCatalog()
  if (value === null || value === undefined) return null
  if (Array.isArray(value)) {
    return (
      <>
        {value.map((item, i) => (
          <span key={i}>
            {i > 0 ? ', ' : ''}
            <Cell value={item} />
          </span>
        ))}
      </>
    )
  }
  if (isDvLink(value)) {
    const res = catalog.resolve(value.target)
    const label =
      value.label ?? (res.kind === 'doc' ? res.id.split('/').pop()! : value.target)
    if (res.kind === 'doc') return <Link to={docPath(res.id)}>{label}</Link>
    return <span>{label}</span>
  }
  return <>{String(value)}</>
}

/** Fallback quando a query não é suportada: o bloco colapsado com a query crua. */
function RawFallback({ lang, code }: { lang: string; code: string }) {
  return (
    <details className="fence-dataview">
      <summary>{lang}</summary>
      <pre>{code}</pre>
    </details>
  )
}

interface Props {
  lang: string
  code: string
  doc: VaultDoc
}

/** Fence dataview avaliada de verdade sobre o catálogo + docs reais. */
export function DataviewBlock({ lang, code, doc }: Props) {
  const catalog = useCatalog()
  const [state, setState] = useState<{ result?: DvResult; error?: unknown }>({})

  useEffect(() => {
    let alive = true
    setState({})
    ;(async () => {
      const query = parseQuery(code) // parse síncrono: erro cai no catch abaixo
      const edges = await fetchEdges()
      return runQuery(query, { catalog, current: doc, loadDoc, edges })
    })().then(
      (result) => alive && setState({ result }),
      (error: unknown) => {
        console.warn(`[dataview] fallback pra query em ${doc.id}:`, error)
        if (alive) setState({ error })
      },
    )
    return () => {
      alive = false
    }
  }, [code, doc, catalog])

  if (state.error) return <RawFallback lang={lang} code={code} />
  if (!state.result) return <p className="loading">Consultando…</p>

  const { headers, rows, kind } = state.result
  if (!rows.length) return <p className="dataview-empty">Nenhum resultado.</p>

  if (kind === 'LIST') {
    return (
      <ul className="dataview-list">
        {rows.map((row, i) => (
          <li key={i}>
            <Cell value={row[0]} />
          </li>
        ))}
      </ul>
    )
  }

  return (
    // #284: tabela de dataview larga rola de lado no mobile.
    <div className="table-scroll">
      <table className="doc-table dataview-table">
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>
                  <Cell value={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
