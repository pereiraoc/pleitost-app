import type { IndexDocEntry, IndexManifest } from './types'

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

export interface Catalog {
  manifest: IndexManifest
  /** Só docs kind=content, na ordem do índice. */
  content: IndexDocEntry[]
  /** Agrupamento por type (null → SEM_CATEGORIA), espelhando manifest.byType. */
  docsByType: Map<string, IndexDocEntry[]>
  entryById: Map<string, IndexDocEntry>
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
  }

  function resolve(target: string): WikiResolution {
    // Âncoras (#heading, #^bloco) não são navegadas no M1 — resolvem pro doc.
    const clean = target.split('#')[0].trim()
    if (!clean) return { kind: 'missing' }

    if (clean.includes('/')) {
      const id = clean.replace(/\.md$/, '')
      if (entryById.has(id)) return { kind: 'doc', id }
      // Path parcial (Obsidian aceita sufixos de caminho)
      const suffix = '/' + id
      const candidates = content.filter((d) => d.id.endsWith(suffix)).map((d) => d.id)
      if (candidates.length === 1) return { kind: 'doc', id: candidates[0] }
      if (candidates.length > 1) return { kind: 'ambiguous', candidates }
      return { kind: 'missing' }
    }

    const ids =
      idsByBasename.get(clean) ?? idsByBasenameLower.get(clean.toLowerCase()) ?? []
    if (ids.length === 1) return { kind: 'doc', id: ids[0] }
    if (ids.length > 1) return { kind: 'ambiguous', candidates: ids }
    return { kind: 'missing' }
  }

  return { manifest, content, docsByType, entryById, resolve }
}

let catalogPromise: Promise<Catalog> | undefined

/** Carrega o índice uma vez por sessão e constrói o catálogo. */
export function fetchCatalog(): Promise<Catalog> {
  catalogPromise ??= fetch('/vault-data/index.json')
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
