// Hook React da projeção de regras: FM salvo (extraído + overlay) →
// RulesModel → extract (BFS + fixed-point) → HeroProjection. Async porque
// o BFS carrega docs do vault-data sob demanda (cache do useDoc/loadDoc).
// Enquanto carrega devolve undefined — slot sem dado renderiza vazio.
import { useEffect, useMemo, useState } from 'react'
import { useCatalog } from '../data/CatalogContext'
import { loadDoc } from '../data/useDoc'
import { localDocByBasename, useLocalStoreVersion } from '../data/local-entities'
import type { Catalog } from '../data/catalog'
import type { VaultDoc } from '../data/types'
import { rulesModelFromFm, type RulesModel } from './rules-model'
import { extractHeroRules, ruleModelKey, type DocResolver, type HeroRulesResult } from './extract'
import { wikilinkBasename } from './rule-applier'
import { buildHeroProjection, type HeroProjection } from './projection'

/** Resolver de wikilink → doc via catálogo (equivalente app do
 *  VaultReader.resolveLink+readFrontmatter do plugin,
 *  rule-elements-extractor.ts:45-51). Ambíguo/inexistente → null.
 *  Fallback (#206): nome que a vault não resolve pode ser uma entidade LOCAL
 *  (ex.: Tutor de CA apontando pra herói criado no app) — vault primeiro pra
 *  um herói local homônimo nunca sombrear um doc de regra da vault. */
export function catalogDocResolver(
  catalog: Catalog,
  load: (id: string) => Promise<VaultDoc>,
): DocResolver {
  return async (wikilinkOrName) => {
    const res = catalog.resolve(wikilinkOrName)
    if (res.kind !== 'doc') return localDocByBasename(wikilinkBasename(wikilinkOrName)) ?? null
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

  // Tutor LOCAL vivo (#206): tutor da vault nunca muda, mas um herói criado no
  // app pode subir de nível — o CA satélite precisa re-extrair. A dep é o
  // NÍVEL atual do tutor local (não a versão bruta do store), então editar
  // qualquer outra entidade local NÃO fura o gate do #57.
  const localVersion = useLocalStoreVersion()
  const tutorNivelKey = useMemo(() => {
    if (!model.meta.tutor) return ''
    const doc = localDocByBasename(wikilinkBasename(model.meta.tutor))
    return doc ? String(doc.frontmatter['Nível'] ?? '') : ''
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, localVersion])

  useEffect(() => {
    let alive = true
    extractHeroRules(model, catalogDocResolver(catalog, loadDoc)).then(
      (result) => {
        if (alive) setExtract({ key: ruleKey, result })
      },
      // Falha do resolver: NÃO zera a extração — mantém a anterior (a projeção
      // segue viva pela última boa, evitando o flicker/undefined do #59).
      () => {},
    )
    return () => {
      alive = false
    }
  }, [model, catalog, ruleKey, tutorNivelKey])

  // Projeção reconstruída SÍNCRONA a cada fm (barata). Enquanto uma re-extração
  // está pendente (mudou um seed/condition → ruleKey novo, extract ainda com a
  // key velha), reusamos a ÚLTIMA extração em vez de devolver `undefined` — as
  // abas não voltam ao FM cru por um frame (issue #59: subclasses/atributos
  // piscando). CRUCIAL: reconstruímos com o `model`/`fm` ATUAIS, não uma
  // projeção congelada — o `derivedFm` reflete o FM salvo fresco (merge sobre o
  // fm corrente), então toggles que leem derivedFm (ex.: tier de arma) veem a
  // última edição na hora; só as ADIÇÕES de regra (calculated) ficam um ciclo
  // atrás, corrigidas quando a nova extração aterrissa. Preserva o gate do #57:
  // com o ruleKey inalterado (bio/nome) o extract já casa e a bio reflete na
  // hora sem re-extrair. Só devolve `undefined` no 1º load (nenhuma extração).
  return useMemo(() => {
    if (!extract) return undefined
    return buildHeroProjection(model, extract.result, catalog, fm)
  }, [extract, model, catalog, fm])
}
