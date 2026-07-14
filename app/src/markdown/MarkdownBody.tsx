import { useMemo } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Link } from 'react-router-dom'
import { useCatalog } from '../data/CatalogContext'
import type { VaultDoc } from '../data/types'
import { VaultImage } from '../components/compendium/VaultImage'
import { DetailLink } from '../components/DetailLink'
import { FENCES, FenceFallback } from './fence-registry'
import { remarkCallouts } from './remark-callouts'
import { remarkInlineDataview } from './remark-inline-dataview'
import { remarkWikilinks } from './remark-wikilinks'
import { stripComments } from './strip-comments'

/** Remove o PRIMEIRO heading do corpo quando ele repete o título do doc — as
 *  views com header próprio (Regra/Criação/História) já mostram o nome, então
 *  o `# Título`/`# = this.file.name` do corpo vira duplicata feia (#246). */
function stripLeadingTitle(body: string, basename: string): string {
  const m = /^\s*#{1,6}\s+(.+?)\s*$/m.exec(body)
  if (!m || body.slice(0, m.index).trim() !== '') return body
  const titulo = m[1].replace(/`?=\s*this\.file\.name`?/g, basename).trim()
  if (titulo !== basename.trim()) return body
  return body.slice(0, m.index) + body.slice(m.index + m[0].length)
}

export function MarkdownBody({ doc, hideLeadingTitle }: { doc: VaultDoc; hideLeadingTitle?: boolean }) {
  const catalog = useCatalog()
  const body = useMemo(() => {
    const stripped = stripComments(doc.body)
    return hideLeadingTitle ? stripLeadingTitle(stripped, doc.basename ?? '') : stripped
  }, [doc.body, doc.basename, hideLeadingTitle])

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
        // #88: links de doc abrem nos DETALHES da sidebar (se houver); demais
        // internos roteiam pela SPA; externos abrem em nova aba.
        if (href?.startsWith('/doc/')) return <DetailLink to={href}>{children}</DetailLink>
        if (href?.startsWith('/')) return <Link to={href}>{children}</Link>
        return (
          <a href={href} target="_blank" rel="noreferrer">
            {children}
          </a>
        )
      },
      img({ src, alt, ...rest }) {
        // embeds ![[...]] chegam com URL vault: do remark-wikilinks
        if (typeof src === 'string' && src.startsWith('vault:')) {
          const target = decodeURIComponent(src.slice('vault:'.length))
          const width = alt && /^\d+$/.test(alt) ? Number(alt) : undefined
          return <VaultImage target={target} width={width} />
        }
        return <img src={src} alt={alt} {...rest} />
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
