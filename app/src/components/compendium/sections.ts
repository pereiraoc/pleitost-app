import type { Catalog, FolderNode } from '../../data/catalog'

// Registro central do escopo do compêndio (decisão do usuário, 2026-07-04):
// as seções espelham as pastas de topo da vault. Sistema/Criaturas fica fora
// (heróis/NPCs têm telas próprias na sidebar); Recursos e Mídia e README não
// são conteúdo de jogo.
export const COMPENDIUM_SECTIONS = ['Atlas', 'Campanhas', 'Contexto', 'Sistema']

export const COMPENDIUM_HIDDEN_FOLDERS = new Set(['Sistema/Criaturas'])

export function isHidden(path: string): boolean {
  for (const hidden of COMPENDIUM_HIDDEN_FOLDERS) {
    if (path === hidden || path.startsWith(hidden + '/')) return true
  }
  return false
}

/** Subpastas navegáveis no compêndio (esconde as registradas acima). */
export function visibleFolders(node: FolderNode): FolderNode[] {
  return node.folders.filter((f) => !isHidden(f.path))
}

/** Contagem exibida: subárvore menos as pastas ocultas dentro dela. */
export function visibleCount(node: FolderNode): number {
  let hiddenCount = 0
  const walk = (n: FolderNode) => {
    for (const f of n.folders) {
      if (isHidden(f.path)) hiddenCount += f.count
      else walk(f)
    }
  }
  walk(node)
  return node.count - hiddenCount
}

/** Seções de topo do compêndio, na ordem do registro. */
export function compendiumSections(catalog: Catalog): FolderNode[] {
  return COMPENDIUM_SECTIONS.map((name) => catalog.folderByPath.get(name)).filter(
    (node): node is FolderNode => node !== undefined,
  )
}
