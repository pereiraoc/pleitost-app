// Texto com [[wikilinks]] navegáveis — mesma regra do remark-wikilinks.ts do
// app (resolve → /doc/:id quando acha, senão texto puro; alias renderiza o
// alias). Usado nos objetivos/detalhes do bounty, que carregam [[Local]] cru.
import { Fragment } from 'react'
import { Link } from 'react-router-dom'
import { useCatalog } from '../../data/CatalogContext'
import { docPath } from '../../paths'

const WIKILINK = /\[\[([^\][|]+?)(?:\|([^\][]+?))?\]\]/g

export function BountyText({ text }: { text: string }) {
  const catalog = useCatalog()
  const parts: React.ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  WIKILINK.lastIndex = 0
  while ((m = WIKILINK.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    const target = m[1]
    const label = m[2] ?? target
    const res = catalog.resolve(target)
    if (res.kind === 'doc') {
      parts.push(
        <Link key={`${m.index}`} to={docPath(res.id)} className="internal-link">
          {label}
        </Link>,
      )
    } else {
      parts.push(label)
    }
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={i}>{p}</Fragment>
      ))}
    </>
  )
}
