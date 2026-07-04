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
 * resolve contra assets.json. Transclusões de nota ficam como texto (M1).
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
