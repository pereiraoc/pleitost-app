import type { PhrasingContent, Root } from 'mdast'
import { findAndReplace } from 'mdast-util-find-and-replace'
import type { WikiResolution } from '../data/catalog'
import { docPath } from '../paths'

const WIKILINK = /!?\[\[([^\][|]+?)(?:\|([^\][]+?))?\]\]/g

interface Options {
  resolve: (target: string) => WikiResolution
}

/**
 * [[Alvo|Alias]] → link interno navegável quando o resolver acha o doc;
 * ambíguo/inexistente vira texto puro (M1). Embeds (![[...]]) ficam intactos
 * pro passo de imagens.
 */
export function remarkWikilinks({ resolve }: Options) {
  return (tree: Root) => {
    findAndReplace(tree, [
      WIKILINK,
      (match: string, target: string, alias?: string): PhrasingContent | false => {
        if (match.startsWith('!')) return false
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
