// QUEBRA DE LINHA SIMPLES como no Obsidian (report 2026-09-07: callouts da
// aventura "sem quebra de linha"). A vault não usa "Strict line breaks", então
// no Obsidian um `\n` dentro de um parágrafo vira <br> — em callouts de campos
// (`> **Público:** …\n> **Secreto:** …`) cada linha é uma linha. O CommonMark
// (react-markdown) trata como espaço. Este plugin insere um nó `break` em cada
// `\n` de texto, MANTENDO o `\n` no texto anterior (o textContent não muda —
// só o visual ganha a quebra).
import type { Root, Text, Break, PhrasingContent } from 'mdast'
import { visit } from 'unist-util-visit'

export function remarkSoftBreaks() {
  return (tree: Root) => {
    visit(tree, 'text', (node: Text, index, parent) => {
      if (!parent || index == null || !node.value.includes('\n')) return
      const partes = node.value.split('\n')
      if (partes.length < 2) return
      const novos: PhrasingContent[] = []
      partes.forEach((p, i) => {
        // o `\n` fica no texto (whitespace) — o <br> é só visual
        novos.push({ type: 'text', value: i < partes.length - 1 ? `${p}\n` : p } as Text)
        if (i < partes.length - 1) novos.push({ type: 'break' } as Break)
      })
      ;(parent.children as PhrasingContent[]).splice(index, 1, ...novos)
      return index + novos.length
    })
  }
}
