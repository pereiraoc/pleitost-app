// Hook React da projeção de regras: FM salvo (extraído + overlay) →
// RulesModel → extract (BFS + fixed-point) → HeroProjection. Async porque
// o BFS carrega docs do vault-data sob demanda (cache do useDoc/loadDoc).
// Enquanto carrega devolve undefined — slot sem dado renderiza vazio.
import { useEffect, useMemo, useState } from 'react'
import { useCatalog } from '../data/CatalogContext'
import { loadDoc } from '../data/useDoc'
import type { Catalog } from '../data/catalog'
import type { VaultDoc } from '../data/types'
import { rulesModelFromFm, type RulesModel } from './rules-model'
import { extractHeroRules, type DocResolver } from './extract'
import { buildHeroProjection, type HeroProjection } from './projection'

/** Resolver de wikilink → doc via catálogo (equivalente app do
 *  VaultReader.resolveLink+readFrontmatter do plugin,
 *  rule-elements-extractor.ts:45-51). Ambíguo/inexistente → null. */
export function catalogDocResolver(
  catalog: Catalog,
  load: (id: string) => Promise<VaultDoc>,
): DocResolver {
  return async (wikilinkOrName) => {
    const res = catalog.resolve(wikilinkOrName)
    if (res.kind !== 'doc') return null
    try {
      return await load(res.id)
    } catch {
      return null
    }
  }
}

/** Projeção completa a partir do FM (usável fora do React — testes). */
export async function projectHeroRules(
  fm: Record<string, unknown>,
  catalog: Catalog,
  load: (id: string) => Promise<VaultDoc>,
): Promise<{ model: RulesModel; projection: HeroProjection }> {
  const model = rulesModelFromFm(fm)
  const result = await extractHeroRules(model, catalogDocResolver(catalog, load))
  return { model, projection: buildHeroProjection(model, result, catalog, fm) }
}

/** Projeção reativa ao FM mesclado (useHeroModel.fm): recalcula quando o
 *  overlay muda (nível, classe, picks…). undefined enquanto resolve. */
export function useHeroRules(fm: Record<string, unknown>): HeroProjection | undefined {
  const catalog = useCatalog()
  const [state, setState] = useState<{ key: unknown; projection: HeroProjection } | undefined>()

  useEffect(() => {
    let alive = true
    projectHeroRules(fm, catalog, loadDoc).then(
      ({ projection }) => {
        if (alive) setState({ key: fm, projection })
      },
      () => {
        if (alive) setState(undefined)
      },
    )
    return () => {
      alive = false
    }
  }, [fm, catalog])

  return useMemo(() => (state?.key === fm ? state.projection : undefined), [state, fm])
}
