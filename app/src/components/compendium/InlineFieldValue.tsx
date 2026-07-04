import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useCatalog } from '../../data/CatalogContext'
import { docPath } from '../../paths'

import { unquote } from '../../markdown/dataview-value'

const WIKILINK = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g

/**
 * Valor de inline field com a sintaxe dataview renderizada: wikilinks viram
 * links navegáveis (via resolver do catálogo) e string literals perdem as
 * aspas. Alvos ambíguos/inexistentes ficam como texto (M1).
 */
export function InlineFieldValue({ value }: { value: string }) {
  const catalog = useCatalog()
  const text = unquote(value)
  const parts: ReactNode[] = []
  let last = 0
  let match: RegExpExecArray | null
  WIKILINK.lastIndex = 0
  while ((match = WIKILINK.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index))
    const [, target, alias] = match
    const label = alias ?? target
    const res = catalog.resolve(target)
    parts.push(
      res.kind === 'doc' ? (
        <Link key={parts.length} to={docPath(res.id)}>
          {label}
        </Link>
      ) : (
        <span key={parts.length}>{label}</span>
      ),
    )
    last = match.index + match[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}
