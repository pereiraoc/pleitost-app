import type { ReactNode } from 'react'
import { useCatalog } from '../../data/CatalogContext'
import { DetailLink } from '../DetailLink'

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
  // matchAll usa iterador próprio (não muta o lastIndex do regex de módulo) —
  // evita estado compartilhado mutável durante o render (react-hooks/immutability).
  for (const match of text.matchAll(WIKILINK)) {
    const idx = match.index
    if (idx > last) parts.push(text.slice(last, idx))
    const [, target, alias] = match
    const label = alias ?? target
    const res = catalog.resolve(target!)
    parts.push(
      res.kind === 'doc' ? (
        // #88: abre nos DETALHES da sidebar quando há uma; senão navega
        <DetailLink key={parts.length} id={res.id}>
          {label}
        </DetailLink>
      ) : (
        <span key={parts.length}>{label}</span>
      ),
    )
    last = idx + match[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}
