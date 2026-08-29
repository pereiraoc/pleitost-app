import type { AssetsManifest, IndexDocEntry, IndexManifest } from './types'
import { withBase } from './base-url'
import { ensureFreshVaultData } from './vault-cache'
import { WORLD_DATA_DIR, type WorldId } from './world'
import { setWorldDataset } from './world-dataset'
import { thumbCopiedTo } from './assets'

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
  /** #519: mundo ativo sem dataset publicado (banner "em preparação";
   *  conteúdo = fallback total na fantasia). */
  worldDatasetAusente?: boolean
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

const catalogPromises = new Map<WorldId, Promise<Catalog>>()

async function fetchManifest(dir: string): Promise<IndexManifest | null> {
  const res = await fetch(withBase(`${dir}/index.json`))
  if (!res.ok) return null
  return (await res.json()) as IndexManifest
}

async function fetchFantasiaCatalog(): Promise<Catalog> {
  await ensureFreshVaultData('fantasia')
  const manifest = await fetchManifest(WORLD_DATA_DIR.fantasia)
  if (!manifest) throw new Error('index.json: dataset da fantasia indisponível')
  return buildCatalog(manifest)
}

/** Catálogo do CYBERPUNK (#519): UNIÃO — docs do dataset do mundo vencem por
 *  id; o resto herda da fantasia (fallback em camadas, inclusive imagens).
 *  Registra no world-dataset os rels que EXISTEM no mundo (docs + assets +
 *  thumbs + links) pro vaultUrl rotear; dataset ausente → catálogo fantasia
 *  com worldDatasetAusente (banner). */
async function fetchCyberpunkCatalog(): Promise<Catalog> {
  await Promise.all([ensureFreshVaultData('fantasia'), ensureFreshVaultData('cyberpunk')])
  const [base, mundo] = await Promise.all([
    fetchManifest(WORLD_DATA_DIR.fantasia),
    fetchManifest(WORLD_DATA_DIR.cyberpunk),
  ])
  if (!base) throw new Error('index.json: dataset da fantasia indisponível')
  if (!mundo) {
    setWorldDataset('cyberpunk', null)
    return { ...buildCatalog(base), worldDatasetAusente: true }
  }
  const rels = new Set<string>(['links.json', 'db-version.json'])
  for (const d of mundo.docs) rels.add(`${d.id}.json`)
  try {
    const res = await fetch(withBase(`${WORLD_DATA_DIR.cyberpunk}/assets.json`))
    if (res.ok) {
      const am = (await res.json()) as AssetsManifest
      for (const a of am.assets ?? []) {
        if (!a.copiedTo) continue
        rels.add(a.copiedTo)
        rels.add(thumbCopiedTo(a.copiedTo))
      }
    }
  } catch {
    /* sem assets.json no mundo — imagens caem todas na fantasia */
  }
  setWorldDataset('cyberpunk', rels)
  const porId = new Map(base.docs.map((d) => [d.id, d]))
  for (const d of mundo.docs) porId.set(d.id, d)
  const docs = [...porId.values()]
  const byType: Record<string, number> = {}
  for (const d of docs) {
    if (d.kind !== 'content') continue
    const t = d.type ?? SEM_CATEGORIA
    byType[t] = (byType[t] ?? 0) + 1
  }
  return buildCatalog({ ...mundo, docs, byType, counts: base.counts })
}

/** Catálogo do MUNDO (cacheado por mundo/sessão). Antes do índice, o check de
 *  FRESCOR purga o cache do SW se a database daquele mundo mudou. */
export function fetchCatalogForWorld(world: WorldId): Promise<Catalog> {
  const cached = catalogPromises.get(world)
  if (cached) return cached
  const p = (world === 'fantasia' ? fetchFantasiaCatalog() : fetchCyberpunkCatalog()).catch(
    (err: unknown) => {
      catalogPromises.delete(world)
      throw err
    },
  )
  catalogPromises.set(world, p)
  return p
}

/** SÓ testes: limpa o cache de catálogos por mundo. */
export function __resetCatalogForTests(): void {
  catalogPromises.clear()
}

/** Compat: catálogo da FANTASIA (call sites/testes legados). */
export function fetchCatalog(): Promise<Catalog> {
  return fetchCatalogForWorld('fantasia')
}
