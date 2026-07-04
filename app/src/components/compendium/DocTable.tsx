import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { loadDoc } from '../../data/useDoc'
import type { IndexDocEntry, VaultDoc } from '../../data/types'
import { docPath } from '../../paths'
import { InlineFieldValue } from './InlineFieldValue'

function grupoValues(entry: IndexDocEntry): string[] {
  if (!entry.grupo) return []
  return Array.isArray(entry.grupo) ? entry.grupo : [entry.grupo]
}

/** Valor de coluna: inline field primeiro, senão escalar do frontmatter. */
function columnValue(doc: VaultDoc | undefined, key: string): string | null {
  if (!doc) return null
  const inline = doc.inlineFields[key]
  if (inline !== undefined && inline.trim() !== '') return inline
  const fm = doc.frontmatter[key]
  if (typeof fm === 'string' || typeof fm === 'number' || typeof fm === 'boolean') {
    return String(fm)
  }
  return null
}

interface Props {
  entries: IndexDocEntry[]
  /** Colunas (chaves de campo dos docs); sem colunas vira lista simples. */
  columns?: readonly string[]
}

export function DocTable({ entries, columns }: Props) {
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
  }, [entries, columns])

  if (!entries.length) return null

  const name = (entry: IndexDocEntry) => (
    <>
      <Link to={docPath(entry.id)}>{entry.basename ?? entry.id}</Link>
      {grupoValues(entry).map((chip) => (
        <span key={chip} className="grupo-chip">
          <InlineFieldValue value={chip} />
        </span>
      ))}
    </>
  )

  if (!columns) {
    return (
      <ul className="doc-ul">
        {entries.map((entry) => (
          <li key={entry.id}>{name(entry)}</li>
        ))}
      </ul>
    )
  }

  return (
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
        {entries.map((entry) => {
          const doc = docs?.get(entry.id)
          return (
            <tr key={entry.id}>
              <td>{name(entry)}</td>
              {columns.map((col) => {
                const value = columnValue(doc, col)
                return <td key={col}>{value ? <InlineFieldValue value={value} /> : null}</td>
              })}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
