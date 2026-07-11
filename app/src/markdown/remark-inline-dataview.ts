import type { Root, Text } from 'mdast'
import { visit } from 'unist-util-visit'
import type { VaultDoc } from '../data/types'
import { unquote } from './dataview-value'

/**
 * Avalia inline dataview (`= this.x`) contra o próprio doc — fonte de verdade:
 * `this.file.name` → basename; demais chaves → inlineFields, depois frontmatter
 * escalar ou ARRAY (v2: propriedades etc. viraram lista de wikilinks — junta com
 * ", "). Sem valor → vazio (nunca inventar fallback). Precisa rodar ANTES do
 * remark-wikilinks pra que valores com [[...]] virem links.
 */
export function remarkInlineDataview(doc: VaultDoc) {
  return (tree: Root) => {
    visit(tree, 'inlineCode', (node, index, parent) => {
      if (!parent || index === undefined) return
      if (!node.value.startsWith('=')) return
      const expr = node.value.slice(1).trim()
      const match = /^this\.(.+)$/.exec(expr)
      if (!match) return
      const replacement: Text = { type: 'text', value: evaluate(match[1], doc) }
      parent.children[index] = replacement
    })
  }
}

function evaluate(path: string, doc: VaultDoc): string {
  if (path === 'file.name') return doc.basename
  const inline = doc.inlineFields[path]
  if (inline !== undefined) return unquote(inline)
  const fm = doc.frontmatter[path]
  if (typeof fm === 'string' || typeof fm === 'number' || typeof fm === 'boolean') {
    return String(fm)
  }
  // Base v2: campos como `propriedades` viraram array de wikilinks — junta com
  // ", " pra que o remark-wikilinks transforme cada [[...]] num link.
  if (Array.isArray(fm)) {
    return fm.map((el) => (typeof el === 'string' ? el : String(el ?? ''))).join(', ')
  }
  return ''
}
