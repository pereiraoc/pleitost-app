import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useCatalog } from '../../data/CatalogContext'
import { loadDoc } from '../../data/useDoc'
import type { IndexDocEntry, VaultDoc } from '../../data/types'
import { docPath } from '../../paths'
import { InlineFieldValue } from './InlineFieldValue'
import { LIST_COLUMNS } from './list-columns'
import { COMPENDIO_KICKER } from '../layout/design-nav'

/** Agrupa por subtype na ordem do índice; docs sem subtype ficam na seção sem título. */
function groupBySubtype(entries: IndexDocEntry[]): Map<string | null, IndexDocEntry[]> {
  const groups = new Map<string | null, IndexDocEntry[]>()
  for (const entry of entries) {
    const key = entry.subtype ?? null
    const group = groups.get(key)
    if (group) group.push(entry)
    else groups.set(key, [entry])
  }
  return groups
}

function grupoValues(entry: IndexDocEntry): string[] {
  if (!entry.grupo) return []
  return Array.isArray(entry.grupo) ? entry.grupo : [entry.grupo]
}

export function DocList() {
  const { type = '' } = useParams()
  const catalog = useCatalog()
  const entries = catalog.docsByType.get(type) ?? []
  const columns = LIST_COLUMNS[type]
  const [docs, setDocs] = useState<Map<string, VaultDoc>>()

  useEffect(() => {
    if (!columns || entries.length === 0) {
      setDocs(undefined)
      return
    }
    let alive = true
    Promise.all(entries.map((entry) => loadDoc(entry.id).catch(() => null))).then((loaded) => {
      if (!alive) return
      const byId = new Map<string, VaultDoc>()
      for (const doc of loaded) if (doc) byId.set(doc.id, doc)
      setDocs(byId)
    })
    return () => {
      alive = false
    }
  }, [catalog, type]) // entries/columns derivam de catalog+type

  if (!entries.length) return <p>Nenhum doc do tipo “{type}”.</p>

  const groups = groupBySubtype(entries)

  const row = (entry: IndexDocEntry) => {
    const chips = grupoValues(entry)
    return (
      <>
        <Link to={docPath(entry.id)}>{entry.basename ?? entry.id}</Link>
        {chips.map((chip) => (
          <span key={chip} className="grupo-chip">
            <InlineFieldValue value={chip} />
          </span>
        ))}
      </>
    )
  }

  return (
    <section className="doc-list page">
      <div className="kicker">{COMPENDIO_KICKER}</div>
      <h1>
        {type} <small>({entries.length})</small>
      </h1>
      {[...groups].map(([subtype, group]) => (
        <section key={subtype ?? ''}>
          {subtype ? <h2>{subtype}</h2> : null}
          {columns ? (
            <table className="doc-table">
              <thead>
                <tr>
                  <th />
                  {columns.map((col) => (
                    <th key={col}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {group.map((entry) => {
                  const doc = docs?.get(entry.id)
                  return (
                    <tr key={entry.id}>
                      <td>{row(entry)}</td>
                      {columns.map((col) => {
                        const value = doc?.inlineFields[col]
                        return <td key={col}>{value ? <InlineFieldValue value={value} /> : null}</td>
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <ul>
              {group.map((entry) => (
                <li key={entry.id}>{row(entry)}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </section>
  )
}
