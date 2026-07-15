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
import { remarkLiftNoteEmbeds } from './remark-note-embeds'
import { stripComments } from './strip-comments'
import { stripLeadingTitle } from './strip-leading-title'
import {
  FOLDER_NOTE_SUPPRESSED_FENCES,
  normalizeNoteEmbeds,
  remarkStripFences,
} from './folder-note-body'
import { NoteTransclusion, TransclusionScope } from './NoteTransclusion'

/** Contexto de render do corpo. 'folder-note' (#275): o corpo da nota-da-pasta
 *  genérica — suprime os fences da listagem (a grade já é a lista). */
export type MarkdownContext = 'folder-note'

export function MarkdownBody({
  doc,
  hideLeadingTitle,
  context,
}: {
  doc: VaultDoc
  hideLeadingTitle?: boolean
  /** Contexto de render — liga supressões específicas (ex.: dataview na folder-note). */
  context?: MarkdownContext
}) {
  const catalog = useCatalog()
  const body = useMemo(() => {
    const stripped = stripComments(doc.body)
    const titled = hideLeadingTitle ? stripLeadingTitle(stripped, doc.basename ?? '') : stripped
    // #275: colapsa a `#subpath` das transclusões de nota ANTES do parse (senão
    // o inline code da seção fragmenta o embed e nada casa).
    return normalizeNoteEmbeds(titled)
  }, [doc.body, doc.basename, hideLeadingTitle])

  const plugins = useMemo(
    () => [
      remarkGfm,
      // ordem importa: `= this.x` substitui antes dos wikilinks linkificarem
      () => remarkInlineDataview(doc),
      () => remarkWikilinks({ resolve: catalog.resolve }),
      // eleva as transclusões de nota a blocos (evita <div> aninhado em <p>)
      remarkLiftNoteEmbeds,
      // #275: no contexto folder-note, a grade da pasta já é a listagem —
      // suprime os fences da query pra não duplicar como tabela/pre.
      ...(context === 'folder-note'
        ? [() => remarkStripFences(FOLDER_NOTE_SUPPRESSED_FENCES)]
        : []),
      remarkCallouts,
    ],
    [doc, catalog, context],
  )

  const components = useMemo<Components>(
    () =>
      ({
        // #275: nó custom emitido pelo remark-wikilinks pra transclusão de nota.
        // Não é uma tag HTML — o cast (fora do tipo Components) o inclui no mapa.
        // #282: na folder-note, NÃO embute o preview (a nota-alvo já aparece como
        // card na listagem abaixo — ex.: Armaduras/Sem·Leve·Pesada); some.
        'note-embed': context === 'folder-note' ? () => null : NoteTransclusion,
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
        // #277: fence VAZIO (ex.: ```autosheet-rules``` no fim de várias notas)
        // chega com children `undefined` → `String(undefined)` era "undefined" e
        // vazava como texto. Trata nulo como string vazia.
        const code = (children == null ? '' : String(children)).replace(/\n$/, '')
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
      }) as Components,
    [doc, context],
  )

  return (
    // #275: empilha o id deste doc na cadeia de transclusão — as NoteTransclusion
    // filhas usam pra detectar ciclo (nota que embute a si mesma).
    <TransclusionScope id={doc.id}>
      <ReactMarkdown remarkPlugins={plugins} components={components}>
        {body}
      </ReactMarkdown>
    </TransclusionScope>
  )
}
