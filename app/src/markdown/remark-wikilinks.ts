import type { PhrasingContent, Root } from 'mdast'
import { findAndReplace } from 'mdast-util-find-and-replace'
import { IMAGE_EXTENSIONS } from '../data/assets'
import type { WikiResolution } from '../data/catalog'
import { docPath } from '../paths'

const WIKILINK = /!?\[\[([^\][|]+?)(?:\|([^\][]+?))?\]\]/g

interface Options {
  resolve: (target: string) => WikiResolution
}

/**
 * [[Alvo|Alias]] → link interno navegável quando o resolver acha o doc;
 * ambíguo/inexistente vira texto puro (M1). Embeds de imagem (![[x.png|300]])
 * viram nós de imagem com URL `vault:` — o componente <img> do MarkdownBody
 * resolve contra assets.json. Transclusões de NOTA (![[Alvo]]) que resolvem pra
 * um doc viram um nó custom `note-embed` que o MarkdownBody renderiza com o
 * componente de transclusão (#275); alvo ambíguo/inexistente cai no texto (M1).
 * A `#subpath` já foi colapsada no nível da string (normalizeNoteEmbeds), então
 * aqui o embed chega como um único token casável.
 */
export function remarkWikilinks({ resolve }: Options) {
  return (tree: Root) => {
    findAndReplace(tree, [
      WIKILINK,
      (match: string, target: string, alias?: string): PhrasingContent | false => {
        if (match.startsWith('!')) {
          const ext = /\.([a-z0-9]+)$/i.exec(target.trim())?.[1]?.toLowerCase()
          if (ext && IMAGE_EXTENSIONS.has(ext)) {
            return {
              type: 'image',
              url: `vault:${encodeURIComponent(target.trim())}`,
              alt: alias ?? '',
            }
          }
          // Transclusão de nota: se resolve pra um doc, nó custom que o
          // MarkdownBody rende com a NoteTransclusion; senão, texto (como antes).
          const embedRes = resolve(target)
          if (embedRes.kind === 'doc') {
            return {
              type: 'text',
              value: '',
              data: {
                hName: 'note-embed',
                hProperties: {
                  'data-target-id': embedRes.id,
                  'data-label': alias ?? target,
                },
              },
            }
          }
          return { type: 'text', value: alias ?? target }
        }
        const label = alias ?? target
        const res = resolve(target)
        if (res.kind !== 'doc') return { type: 'text', value: label }
        return {
          type: 'link',
          url: docPath(res.id),
          children: [{ type: 'text', value: label }],
        }
      },
    ])
  }
}
