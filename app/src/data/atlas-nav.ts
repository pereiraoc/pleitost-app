// Navegação do Atlas (#250, F6 do épico #243) — a hierarquia de lugares vem do
// FM `Geolocalização` (wikilink pro lugar-pai): Forte Norte → Campos do Provento
// → Federação Áurea → … → Atlas. Daqui saem o breadcrumb (subir: "o que dentro
// de o que") e os lugares-filhos (descer). Puro/testável; o mapa em si (pedido
// AS-IS) espera o mapa-raiz da vault ("vai existir") — até lá, breadcrumb+infos.
import type { Catalog } from './catalog'
import type { VaultDoc } from './types'

export const LOCALIZACAO_TYPE = 'Localização'

/** "[[A/B|C]]" | "[[X]]" | "[[X#h]]" → alvo bruto ("A/B" / "X"); null se não for wikilink. */
export function wikiTarget(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const m = /\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/.exec(raw)
  return m ? m[1]!.trim() : null
}

/** Id do lugar-pai (Geolocalização) de um doc, ou null (raiz / não resolvido). */
export function geoParentId(doc: VaultDoc, catalog: Catalog): string | null {
  const t = wikiTarget((doc.frontmatter as Record<string, unknown>)['Geolocalização'])
  if (!t) return null
  const r = catalog.resolve(t)
  return r.kind === 'doc' ? r.id : null
}

export interface AtlasNode {
  id: string
  basename: string
}

/** Cadeia raiz→atual (breadcrumb) a partir de um mapa parentOf. Corta ciclos. */
export function ancestorChain(
  id: string,
  parentOf: Map<string, string>,
  nameOf: (id: string) => string,
): AtlasNode[] {
  const chain: AtlasNode[] = []
  const seen = new Set<string>()
  let cur: string | undefined = id
  while (cur && !seen.has(cur)) {
    seen.add(cur)
    chain.unshift({ id: cur, basename: nameOf(cur) })
    cur = parentOf.get(cur)
  }
  return chain
}

/** Constrói parentOf + childrenOf a partir de um lote de docs de lugar. */
export function buildAtlasIndex(
  docs: Iterable<VaultDoc>,
  catalog: Catalog,
): { parentOf: Map<string, string>; childrenOf: Map<string, string[]> } {
  const parentOf = new Map<string, string>()
  const childrenOf = new Map<string, string[]>()
  for (const doc of docs) {
    const parent = geoParentId(doc, catalog)
    if (!parent) continue
    parentOf.set(doc.id, parent)
    const kids = childrenOf.get(parent) ?? []
    kids.push(doc.id)
    childrenOf.set(parent, kids)
  }
  return { parentOf, childrenOf }
}

/** Todos os lugares ABAIXO de `raiz` em ordem de leitura (pai, depois os
 *  filhos dele, recursivo), com o nível de cada um. Ciclo na Geolocalização
 *  não trava: cada lugar entra uma vez. */
export function arvoreDeLugares(
  children: string[],
  filhosDe: ((id: string) => string[]) | undefined,
): { id: string; nivel: number }[] {
  const out: { id: string; nivel: number }[] = []
  const visto = new Set<string>()
  const descer = (ids: string[], nivel: number) => {
    for (const id of ids) {
      if (visto.has(id)) continue
      visto.add(id)
      out.push({ id, nivel })
      if (filhosDe) descer(filhosDe(id), nivel + 1)
    }
  }
  descer(children, 0)
  return out
}
