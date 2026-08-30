// #519: cascata de termos do mundo sobre os nós de TEXTO do markdown —
// roda DEPOIS do remarkWikilinks (labels de link já reskinados lá; a prosa
// solta é reskinada aqui). Pula inlineCode/code (conteúdo literal). No-op
// quando o mundo não tem reskin ativo.
import type { Root } from 'mdast'
import { reskinAtivo, reskinText } from '../data/reskin'

interface NoLike {
  type?: string
  value?: unknown
  children?: NoLike[]
}

export function remarkReskinText() {
  return (tree: Root) => {
    if (!reskinAtivo()) return
    const walk = (node: NoLike): void => {
      if (node.type === 'code' || node.type === 'inlineCode') return
      if (node.type === 'text' && typeof node.value === 'string') {
        node.value = reskinText(node.value)
      }
      if (Array.isArray(node.children)) node.children.forEach(walk)
    }
    walk(tree as NoLike)
  }
}
