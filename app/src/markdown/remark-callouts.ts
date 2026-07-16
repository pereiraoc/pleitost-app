import type { Root } from 'mdast'
import { visit } from 'unist-util-visit'

const MARKER = /^\[!([\w-]+)\][ \t]*/

/**
 * Callouts do Obsidian: blockquote iniciando com [!tipo] ganha classes
 * `callout callout-<tipo>`; o marcador sai do texto (o tipo vem do próprio
 * marcador, nenhum título é inventado).
 */
export function remarkCallouts() {
  return (tree: Root) => {
    visit(tree, 'blockquote', (node) => {
      const paragraph = node.children[0]
      if (paragraph?.type !== 'paragraph') return
      const text = paragraph.children[0]
      if (text?.type !== 'text') return
      const match = MARKER.exec(text.value)
      if (!match) return
      text.value = text.value.slice(match[0].length).replace(/^\n/, '')
      node.data = {
        ...node.data,
        hProperties: {
          ...(node.data?.hProperties as object | undefined),
          className: ['callout', `callout-${match[1]!.toLowerCase()}`],
        },
      }
    })
  }
}
