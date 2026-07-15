// #275: transclusões de nota `![[Alvo]]` viram nós `note-embed` (via
// remark-wikilinks) que o MarkdownBody rende como um BLOCO (a NoteTransclusion
// embute o corpo inteiro do alvo). Como o parser as coloca DENTRO de um
// parágrafo, um `<div>` de bloco cairia aninhado num `<p>` (HTML inválido).
// Este plugin ELEVA os note-embeds a nós de bloco no root, quebrando o parágrafo
// ao redor deles (a prosa antes/depois vira parágrafo próprio; o whitespace
// entre embeds é descartado).
import type { Paragraph, PhrasingContent, Root, RootContent } from 'mdast'
import { visit } from 'unist-util-visit'

function isNoteEmbed(node: PhrasingContent): boolean {
  return node.type === 'text' && (node.data as { hName?: string } | undefined)?.hName === 'note-embed'
}

function isBlank(node: PhrasingContent): boolean {
  return node.type === 'text' && node.value.trim() === ''
}

export function remarkLiftNoteEmbeds() {
  return (tree: Root) => {
    visit(tree, 'paragraph', (para: Paragraph, index, parent) => {
      if (!parent || index === undefined) return
      if (!para.children.some(isNoteEmbed)) return

      // Fatia o parágrafo: sequências de phrasing "normal" viram parágrafos;
      // cada note-embed vira um bloco solto (o whitespace entre eles some).
      const out: RootContent[] = []
      let buffer: PhrasingContent[] = []
      const flush = () => {
        if (buffer.some((n) => !isBlank(n))) {
          out.push({ type: 'paragraph', children: buffer })
        }
        buffer = []
      }
      for (const child of para.children) {
        if (isNoteEmbed(child)) {
          flush()
          // Promove o note-embed a nó de BLOCO: um parágrafo cujo `hName` é o do
          // embed (note-embed) → react-markdown rende a NoteTransclusion no lugar
          // do <p>, então o <div> da transclusão fica no nível do root (sem p>div).
          out.push({ type: 'paragraph', data: child.data, children: [] })
        } else {
          buffer.push(child)
        }
      }
      flush()

      ;(parent.children as RootContent[]).splice(index, 1, ...out)
      return index + out.length
    })
  }
}
