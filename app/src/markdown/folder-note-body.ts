// #275: preparo do CORPO de uma folder-note GENÉRICA (Armaduras/Armas/Escudos…)
// pra ser renderizado ACIMA da listagem. Fonte de verdade central de:
//   - QUAIS fences são suprimidos nesse contexto (a grade já é a lista — não
//     duplicar a query dataview como tabela/pre); e
//   - se, DEPOIS de remover título + fences suprimidos, sobra conteúdo útil
//     (senão a folder-note fica só título + lista, como antes).
// O call-site do render NÃO decide nada disso — só consulta estas funções.
import type { Root } from 'mdast'
import { visit } from 'unist-util-visit'
import type { VaultDoc } from '../data/types'
import { stripComments } from './strip-comments'
import { stripLeadingTitle } from './strip-leading-title'
import { IMAGE_EXTENSIONS } from '../data/assets'

/** Fences que a folder-note NÃO deve renderizar (a listagem da pasta já cobre a
 *  query). Central — a supressão é ligada só no contexto 'folder-note', nunca
 *  global. Novas linguagens a suprimir entram AQUI. */
// `dataview` (a grade da pasta já é a lista) e `button` (botão QuickAdd do
// Obsidian — sem plugin no app, só vazava o config cru como <pre>).
export const FOLDER_NOTE_SUPPRESSED_FENCES: readonly string[] = ['dataview', 'button']

/**
 * Transclusões de nota `![[Alvo#Seção]]` chegam FRAGMENTADAS pelo parser quando
 * a seção tem inline code (`#\`= this.file.name\``): o remark quebra em
 * text+inlineCode+text e nem o wikilink nem o inline-dataview conseguem casar o
 * embed inteiro. Colapsa a `#subpath` no nível da STRING (antes do parse) — o
 * embed vira um `![[Alvo]]`/`![[Alvo|alias]]` que sobrevive como um único token,
 * casável pelo remark-wikilinks. Só toca embeds de NOTA (alvo sem extensão de
 * imagem); embeds de imagem (com `#anchor|300`) ficam intactos.
 */
export function normalizeNoteEmbeds(body: string): string {
  return body.replace(
    /!\[\[([^\]|#]+?)#[^\]|]*(\|[^\]]*)?\]\]/g,
    (match, target: string, alias: string | undefined) => {
      const ext = /\.([a-z0-9]+)$/i.exec(target.trim())?.[1]?.toLowerCase()
      if (ext && IMAGE_EXTENSIONS.has(ext)) return match
      return `![[${target}${alias ?? ''}]]`
    },
  )
}

/** remark plugin: remove os nós de fence cujas linguagens estão na lista (usado
 *  só no contexto folder-note — a grade da pasta substitui a query). */
export function remarkStripFences(langs: readonly string[]) {
  const set = new Set(langs)
  return (tree: Root) => {
    visit(tree, 'code', (node, index, parent) => {
      if (!parent || index === undefined) return
      if (node.lang && set.has(node.lang)) {
        parent.children.splice(index, 1)
        return index // revisita o índice (a lista encolheu)
      }
    })
  }
}

/**
 * Corpo "limpo" da folder-note pra decidir se vale renderizar: sem comentários,
 * sem o heading-título repetido, sem os fences suprimidos. Reproduz o mesmo
 * pré-processamento do render (menos os wikilinks) — assim a decisão de
 * mostrar/não bate com o que apareceria.
 */
export function cleanFolderNoteBody(doc: VaultDoc): string {
  const noComments = stripComments(doc.body)
  const noTitle = stripLeadingTitle(noComments, doc.basename ?? '')
  // remove blocos ```lang ... ``` das linguagens suprimidas (nível string, só
  // pra medir "sobrou conteúdo"; a remoção real no render é via remarkStripFences).
  const fenceRe = new RegExp(
    '```(' + FOLDER_NOTE_SUPPRESSED_FENCES.join('|') + ')[^\\n]*\\n[\\s\\S]*?```',
    'g',
  )
  return noTitle.replace(fenceRe, '')
}

/** true quando, removidos título + fences suprimidos, ainda há prosa/embeds úteis
 *  no corpo da folder-note. Só separadores (`---`), HEADINGS (rótulos de seção
 *  de queries removidas), âncoras de bloco (`^id`) e espaços contam como vazio —
 *  uma nota-índice que é só isso (ex.: Campanhas/Aventuras: headings + dataview +
 *  botão QuickAdd) não tem corpo útil, a grade da pasta já é a lista. */
export function folderNoteHasBody(doc: VaultDoc): boolean {
  const clean = cleanFolderNoteBody(doc)
    .replace(/^-{3,}\s*$/gm, '') // separadores horizontais soltos
    .replace(/^#{1,6}\s.*$/gm, '') // headings soltos (rótulo de seção sem prosa)
    .replace(/^\^[\w-]+\s*$/gm, '') // âncoras de bloco (^id) — metadado, não conteúdo
    .trim()
  return clean.length > 0
}
