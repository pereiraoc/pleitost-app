import { useMemo } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Link } from 'react-router-dom'
import { useCatalog } from '../data/CatalogContext'
import type { VaultDoc } from '../data/types'
import { FENCES, FenceFallback } from './fence-registry'
import { remarkCallouts } from './remark-callouts'
import { remarkInlineDataview } from './remark-inline-dataview'
import { remarkWikilinks } from './remark-wikilinks'
import { stripComments } from './strip-comments'

export function MarkdownBody({ doc }: { doc: VaultDoc }) {
  const catalog = useCatalog()
  const body = useMemo(() => stripComments(doc.body), [doc.body])

  const plugins = useMemo(
    () => [
      remarkGfm,
      // ordem importa: `= this.x` substitui antes dos wikilinks linkificarem
      () => remarkInlineDataview(doc),
      () => remarkWikilinks({ resolve: catalog.resolve }),
      remarkCallouts,
    ],
    [doc, catalog],
  )

  const components = useMemo<Components>(
    () => ({
      a({ href, children }) {
        // links internos (gerados pelo remark-wikilinks) roteiam pela SPA
        if (href?.startsWith('/')) return <Link to={href}>{children}</Link>
        return (
          <a href={href} target="_blank" rel="noreferrer">
            {children}
          </a>
        )
      },
      // fences renderizam via registro; o <pre> padrão sai do caminho
      pre({ children }) {
        return <>{children}</>
      },
      code({ className, children }) {
        const lang = /language-([\w-]+)/.exec(className ?? '')?.[1]
        const code = String(children).replace(/\n$/, '')
        if (lang) {
          const Fence = FENCES[lang] ?? FenceFallback
          return <Fence lang={lang} code={code} doc={doc} />
        }
        // bloco sem lang (perdeu o <pre> acima) vs code inline
        if (code.includes('\n')) {
          return (
            <pre>
              <code>{code}</code>
            </pre>
          )
        }
        return <code>{children}</code>
      },
    }),
    [doc],
  )

  return (
    <ReactMarkdown remarkPlugins={plugins} components={components}>
      {body}
    </ReactMarkdown>
  )
}
