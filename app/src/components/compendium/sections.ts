import type { Catalog, FolderNode } from '../../data/catalog'

// Registro central do escopo do compêndio (decisão do usuário, 2026-07-04):
// as seções espelham as pastas de topo da vault. Sistema/Criaturas fica fora
// (heróis/NPCs têm telas próprias na sidebar); Recursos e Mídia e README não
// são conteúdo de jogo.
export const COMPENDIUM_SECTIONS = ['Atlas', 'Campanhas', 'Contexto', 'Sistema']

export const COMPENDIUM_HIDDEN_FOLDERS = new Set(['Sistema/Criaturas'])

// #441: pastas SÓ do mestre — jogadores não veem (spoiler de campanha:
// aventuras/combates preparados). Ocultas quando o Modo Mestre está OFF.
export const COMPENDIUM_MESTRE_ONLY = new Set(['Campanhas'])

/** A pasta (ou uma ancestral dela) é só do mestre? */
export function isMestreOnlyFolder(path: string): boolean {
  for (const m of COMPENDIUM_MESTRE_ONLY) if (under(path, m)) return true
  return false
}

// #213: os GRUPOS puxados do Obsidian são EXEMPLOS navegáveis no compêndio
// (saíram da aba GRUPOS, que agora é só do usuário) — exceção dentro da
// subárvore oculta.
export const COMPENDIUM_VISIBLE_EXCEPTIONS = new Set(['Sistema/Criaturas/Grupos de Criaturas'])

function under(path: string, root: string): boolean {
  return path === root || path.startsWith(root + '/')
}

export function isHidden(path: string, mestre = true): boolean {
  for (const ex of COMPENDIUM_VISIBLE_EXCEPTIONS) if (under(path, ex)) return false
  for (const hidden of COMPENDIUM_HIDDEN_FOLDERS) if (under(path, hidden)) return true
  if (!mestre && isMestreOnlyFolder(path)) return true // #441: Campanhas só do GM
  return false
}

/** Pasta oculta ainda aparece se tiver uma EXCEÇÃO visível lá dentro (senão
 *  a exceção fica inalcançável na navegação). */
export function hasVisibleDescendant(node: FolderNode, mestre = true): boolean {
  return node.folders.some((f) => !isHidden(f.path, mestre) || hasVisibleDescendant(f, mestre))
}

/** Subpastas navegáveis no compêndio (esconde as registradas acima). */
export function visibleFolders(node: FolderNode, mestre = true): FolderNode[] {
  return node.folders.filter((f) => !isHidden(f.path, mestre) || hasVisibleDescendant(f, mestre))
}

/** Contagem exibida: subárvore menos os docs em pastas ocultas (as exceções
 *  visíveis dentro delas contam) e menos as FOLDER-NOTES de cada nível — a
 *  nota-índice homônima é a página da pasta, não um item (report 2026-08-29:
 *  os cards contavam o índice junto, "em vários casos"). Mesma régua da
 *  listagem/subtreeDocs. */
export function visibleCount(node: FolderNode): number {
  let count = 0
  const walk = (n: FolderNode) => {
    if (!isHidden(n.path)) {
      for (const d of n.docs) if (d.basename !== n.name) count++
    }
    for (const f of n.folders) walk(f)
  }
  walk(node)
  return count
}

/** Seções de topo do compêndio, na ordem do registro. */
export function compendiumSections(catalog: Catalog): FolderNode[] {
  return COMPENDIUM_SECTIONS.map((name) => catalog.folderByPath.get(name)).filter(
    (node): node is FolderNode => node !== undefined,
  )
}

/** #267: TODOS os docs (content) da SUBÁRVORE de um nó, exceto os das pastas
 *  ocultas e as folder-notes (basename = nome da pasta). Usado pela folha de
 *  Items pra achatar as subpastas (Armas Simples/Corpo-a-Corpo Simples/…) numa
 *  única grade agrupada — a subárvore é a fonte, o visualizador agrupa. */
export function subtreeDocs(node: FolderNode) {
  const out: FolderNode['docs'] = []
  const walk = (n: FolderNode) => {
    if (isHidden(n.path)) return
    for (const d of n.docs) {
      // pula a folder-note da pasta (é a página da pasta, não um item)
      if (d.basename === n.name) continue
      out.push(d)
    }
    for (const f of n.folders) walk(f)
  }
  walk(node)
  return out
}
