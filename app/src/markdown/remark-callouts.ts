import type { Paragraph, PhrasingContent, Root } from 'mdast'
import { visit } from 'unist-util-visit'

// O sufixo `-`/`+` depois do marcador é a DOBRA do Obsidian: `-` nasce
// fechado, `+` nasce aberto. Sem sufixo, o callout não dobra.
const MARKER = /^\[!([\w-]+)\]([-+])?[ \t]*/

/**
 * Callouts do Obsidian: blockquote iniciando com [!tipo] ganha classes
 * `callout callout-<tipo>`; o marcador sai do texto (o tipo vem do próprio
 * marcador, nenhum título é inventado).
 *
 * Com sufixo de dobra o blockquote vira `<details>` e a PRIMEIRA LINHA vira o
 * `<summary>` — é assim que as notas guardam tabela/mecânica sem poluir a
 * leitura. Raw HTML não é alternativa aqui: o ReactMarkdown do app roda sem
 * rehype-raw, então um `<details>` escrito na nota não renderizaria.
 *
 * Roda ANTES do remarkSoftBreaks, então a quebra da primeira linha ainda é um
 * "\n" dentro do nó de texto (e não um nó `break`).
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
      const className = ['callout', `callout-${match[1]!.toLowerCase()}`]
      const dobra = match[2]

      if (!dobra) {
        node.data = {
          ...node.data,
          hProperties: { ...(node.data?.hProperties as object | undefined), className },
        }
        return
      }

      // Primeira linha -> <summary>; o que sobrar do parágrafo volta como
      // parágrafo normal, antes do resto do corpo.
      const titulo: PhrasingContent[] = []
      const resto: PhrasingContent[] = []
      let cortou = false
      for (const filho of paragraph.children) {
        if (cortou) {
          resto.push(filho)
          continue
        }
        if (filho.type === 'text' && filho.value.includes('\n')) {
          const i = filho.value.indexOf('\n')
          const antes = filho.value.slice(0, i)
          const depois = filho.value.slice(i + 1)
          if (antes) titulo.push({ ...filho, value: antes })
          if (depois) resto.push({ ...filho, value: depois })
          cortou = true
          continue
        }
        if (filho.type === 'break') {
          cortou = true
          continue
        }
        titulo.push(filho)
      }

      const summary: Paragraph = {
        type: 'paragraph',
        children: titulo,
        data: { hName: 'summary' },
      }
      const corpo: Paragraph[] = resto.length
        ? [{ type: 'paragraph', children: resto }]
        : []
      node.children = [summary, ...corpo, ...node.children.slice(1)]
      node.data = {
        ...node.data,
        hName: 'details',
        hProperties: {
          ...(node.data?.hProperties as object | undefined),
          className,
          ...(dobra === '+' ? { open: true } : {}),
        },
      }
    })
  }
}
