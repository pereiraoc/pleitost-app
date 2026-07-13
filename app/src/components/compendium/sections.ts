import type { Catalog, FolderNode } from '../../data/catalog'

// Registro central do escopo do compêndio (decisão do usuário, 2026-07-04):
// as seções espelham as pastas de topo da vault. Sistema/Criaturas fica fora
// (heróis/NPCs têm telas próprias na sidebar); Recursos e Mídia e README não
// são conteúdo de jogo.
export const COMPENDIUM_SECTIONS = ['Atlas', 'Campanhas', 'Contexto', 'Sistema']

export const COMPENDIUM_HIDDEN_FOLDERS = new Set(['Sistema/Criaturas'])

// #213: os GRUPOS puxados do Obsidian são EXEMPLOS navegáveis no compêndio
// (saíram da aba GRUPOS, que agora é só do usuário) — exceção dentro da
// subárvore oculta.
export const COMPENDIUM_VISIBLE_EXCEPTIONS = new Set(['Sistema/Criaturas/Grupos de Criaturas'])

function under(path: string, root: string): boolean {
  return path === root || path.startsWith(root + '/')
}

export function isHidden(path: string): boolean {
  for (const ex of COMPENDIUM_VISIBLE_EXCEPTIONS) if (under(path, ex)) return false
  for (const hidden of COMPENDIUM_HIDDEN_FOLDERS) if (under(path, hidden)) return true
  return false
}

/** Pasta oculta ainda aparece se tiver uma EXCEÇÃO visível lá dentro (senão
 *  a exceção fica inalcançável na navegação). */
export function hasVisibleDescendant(node: FolderNode): boolean {
  return node.folders.some((f) => !isHidden(f.path) || hasVisibleDescendant(f))
}

/** Subpastas navegáveis no compêndio (esconde as registradas acima). */
export function visibleFolders(node: FolderNode): FolderNode[] {
  return node.folders.filter((f) => !isHidden(f.path) || hasVisibleDescendant(f))
}

/** Contagem exibida: subárvore menos os docs em pastas ocultas (as exceções
 *  visíveis dentro delas contam). */
export function visibleCount(node: FolderNode): number {
  let hiddenDocs = 0
  const walk = (n: FolderNode) => {
    if (isHidden(n.path)) hiddenDocs += n.docs.length
    for (const f of n.folders) walk(f)
  }
  walk(node)
  return node.count - hiddenDocs
}

/** Seções de topo do compêndio, na ordem do registro. */
export function compendiumSections(catalog: Catalog): FolderNode[] {
  return COMPENDIUM_SECTIONS.map((name) => catalog.folderByPath.get(name)).filter(
    (node): node is FolderNode => node !== undefined,
  )
}
