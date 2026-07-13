// Grafo de wikilinks resolvidos (links.json do extractor): id → ids de saída.
// Usado pelo avaliador dataview pra FROM [[]] (inlinks) e outgoing([[]]).
import { vaultUrl } from './base-url'


export type LinkEdges = Record<string, string[]>

let edgesPromise: Promise<LinkEdges> | undefined

export function fetchEdges(): Promise<LinkEdges> {
  edgesPromise ??= fetch(vaultUrl('links.json'))
    .then((res) => {
      if (!res.ok) throw new Error(`links.json: HTTP ${res.status}`)
      return res.json() as Promise<{ edges: LinkEdges }>
    })
    .then((manifest) => manifest.edges)
    .catch((err: unknown) => {
      // extract antigo sem links.json: backlinks ficam vazios, resto funciona
      console.warn('[dataview] links.json indisponível:', err)
      return {}
    })
  return edgesPromise
}
