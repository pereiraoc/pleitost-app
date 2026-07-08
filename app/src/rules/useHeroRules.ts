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
import { extractHeroRules, ruleModelKey, type DocResolver, type HeroRulesResult } from './extract'
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

/** Projeção reativa ao FM mesclado (useHeroModel.fm). undefined enquanto resolve.
 *
 *  GATE (#57): o BFS + fixed-point (async, caro — carrega dezenas de docs) só
 *  re-dispara quando um campo que a REGRA lê muda (via `ruleModelKey`). Digitar
 *  nome/motivação/idade — novo objeto `fm` a cada tecla, mas mesma key — NÃO
 *  re-extrai: reaproveita a extração cacheada e apenas REFUNDE o `calculated` no
 *  fm atual (buildHeroProjection é síncrono e barato), então a bio nova reflete
 *  na hora no `derivedFm` sem o custo (nem o flicker de "loading") da extração. */
export function useHeroRules(fm: Record<string, unknown>): HeroProjection | undefined {
  const catalog = useCatalog()

  // RulesModel do fm atual — barato, mas referência nova a cada edit (o fm é
  // recriado a cada tecla). Só lê campos que a avaliação de regra usa.
  const liveModel = useMemo(() => rulesModelFromFm(fm), [fm])
  // Assinatura do que a EXTRAÇÃO depende: muda sse (e só se) um seed/condition muda.
  const ruleKey = useMemo(() => ruleModelKey(liveModel), [liveModel])
  // Modelo ESTÁVEL entre edits irrelevantes: mesma referência enquanto a key não
  // muda (bio/nome → mesma), então o efeito de extração não re-dispara ao digitar.
  // Duas capturas com a mesma key são estruturalmente idênticas (a key serializa
  // o model inteiro), logo usar a captura "presa" na projeção é seguro.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const model = useMemo(() => liveModel, [ruleKey])

  const [extract, setExtract] = useState<{ key: string; result: HeroRulesResult } | undefined>()

  useEffect(() => {
    let alive = true
    extractHeroRules(model, catalogDocResolver(catalog, loadDoc)).then(
      (result) => {
        if (alive) setExtract({ key: ruleKey, result })
      },
      () => {
        if (alive) setExtract(undefined)
      },
    )
    return () => {
      alive = false
    }
  }, [model, catalog, ruleKey])

  // Projeção reconstruída SÍNCRONA a cada fm (barata): reaproveita a extração
  // cacheada e refunde `calculated` no fm corrente — derivedFm sempre fresco.
  return useMemo(() => {
    if (!extract || extract.key !== ruleKey) return undefined
    return buildHeroProjection(model, extract.result, catalog, fm)
  }, [extract, ruleKey, model, catalog, fm])
}
