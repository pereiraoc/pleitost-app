import type { IndexDocEntry, IndexManifest } from './types'
import { vaultUrl } from './base-url'

/**
 * Label que o extractor grava em byType para docs content sem `type`
 * (extractor/extract-vault.mjs). O teste de integração garante que agrupar
 * por esta regra reproduz manifest.byType exatamente.
 */
export const SEM_CATEGORIA = '(sem categoria)'

export type WikiResolution =
  | { kind: 'doc'; id: string }
  | { kind: 'ambiguous'; candidates: string[] }
  | { kind: 'missing' }

/** Nó da árvore de pastas da vault (derivada dos ids dos docs content). */
export interface FolderNode {
  path: string
  name: string
  folders: FolderNode[]
  /** Docs diretamente nesta pasta, na ordem do índice. */
  docs: IndexDocEntry[]
  /** Total de docs na subárvore. */
  count: number
}

export interface Catalog {
  manifest: IndexManifest
  /** Só docs kind=content, na ordem do índice. */
  content: IndexDocEntry[]
  /** Agrupamento por type (null → SEM_CATEGORIA), espelhando manifest.byType. */
  docsByType: Map<string, IndexDocEntry[]>
  entryById: Map<string, IndexDocEntry>
  /** Raiz da árvore de pastas + acesso direto por path. */
  folderTree: FolderNode
  folderByPath: Map<string, FolderNode>
  /** Resolve um alvo de wikilink para um doc do catálogo. */
  resolve: (target: string) => WikiResolution
}

export function buildCatalog(manifest: IndexManifest): Catalog {
  const content = manifest.docs.filter((d) => d.kind === 'content')

  const docsByType = new Map<string, IndexDocEntry[]>()
  const entryById = new Map<string, IndexDocEntry>()
  const idsByBasename = new Map<string, string[]>()
  const idsByBasenameLower = new Map<string, string[]>()

  const push = (map: Map<string, string[]>, key: string, id: string) => {
    const ids = map.get(key)
    if (ids) ids.push(id)
    else map.set(key, [id])
  }

  const folderTree: FolderNode = { path: '', name: '', folders: [], docs: [], count: 0 }
  const folderByPath = new Map<string, FolderNode>([['', folderTree]])
  const ensureFolder = (path: string): FolderNode => {
    const existing = folderByPath.get(path)
    if (existing) return existing
    const cut = path.lastIndexOf('/')
    const parent = ensureFolder(cut === -1 ? '' : path.slice(0, cut))
    const node: FolderNode = {
      path,
      name: path.slice(cut + 1),
      folders: [],
      docs: [],
      count: 0,
    }
    parent.folders.push(node)
    folderByPath.set(path, node)
    return node
  }

  for (const doc of content) {
    const typeKey = doc.type ?? SEM_CATEGORIA
    const group = docsByType.get(typeKey)
    if (group) group.push(doc)
    else docsByType.set(typeKey, [doc])

    entryById.set(doc.id, doc)
    if (doc.basename) {
      push(idsByBasename, doc.basename, doc.id)
      push(idsByBasenameLower, doc.basename.toLowerCase(), doc.id)
    }

    const cut = doc.id.lastIndexOf('/')
    ensureFolder(cut === -1 ? '' : doc.id.slice(0, cut)).docs.push(doc)
  }

  const tally = (node: FolderNode): number =>
    (node.count = node.docs.length + node.folders.reduce((sum, f) => sum + tally(f), 0))
  tally(folderTree)

  function resolveUncached(target: string): WikiResolution {
    // Âncoras (#heading, #^bloco) não são navegadas no M1 — resolvem pro doc.
    const clean = target.split('#')[0]!.trim()
    if (!clean) return { kind: 'missing' }

    if (clean.includes('/')) {
      const id = clean.replace(/\.md$/, '')
      if (entryById.has(id)) return { kind: 'doc', id }
      // Path parcial (Obsidian aceita sufixos de caminho)
      const suffix = '/' + id
      const candidates = content.filter((d) => d.id.endsWith(suffix)).map((d) => d.id)
      if (candidates.length === 1) return { kind: 'doc', id: candidates[0]! }
      if (candidates.length > 1) return { kind: 'ambiguous', candidates }
      return { kind: 'missing' }
    }

    const ids =
      idsByBasename.get(clean) ?? idsByBasenameLower.get(clean.toLowerCase()) ?? []
    if (ids.length === 1) return { kind: 'doc', id: ids[0]! }
    if (ids.length > 1) return { kind: 'ambiguous', candidates: ids }
    return { kind: 'missing' }
  }

  // #291: memoiza — o catálogo é IMUTÁVEL na sessão, e o branch de path parcial
  // (`content.filter(...endsWith)`) era O(n) por chamada; Atlas/comércio resolvem
  // por-doc, virando O(n²) no agregado. O cache torna cada alvo único O(n) uma vez.
  const resolveCache = new Map<string, WikiResolution>()
  function resolve(target: string): WikiResolution {
    const hit = resolveCache.get(target)
    if (hit) return hit
    const res = resolveUncached(target)
    resolveCache.set(target, res)
    return res
  }

  return { manifest, content, docsByType, entryById, folderTree, folderByPath, resolve }
}

let catalogPromise: Promise<Catalog> | undefined

/** Carrega o índice uma vez por sessão e constrói o catálogo. */
export function fetchCatalog(): Promise<Catalog> {
  catalogPromise ??= fetch(vaultUrl('index.json'))
    .then((res) => {
      if (!res.ok) throw new Error(`index.json: HTTP ${res.status}`)
      return res.json() as Promise<IndexManifest>
    })
    .then(buildCatalog)
    .catch((err: unknown) => {
      catalogPromise = undefined
      throw err
    })
  return catalogPromise
}
