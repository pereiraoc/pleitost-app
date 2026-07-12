// Carrega em lote os docs da vault referenciados pelo modelo do herói
// (armas, imbuições, tesouros, magias, habilidades, técnicas, ações,
// especializações, condições ativas) e devolve um resolvedor wikilink→doc.
import { useMemo } from 'react'
import { useCatalog } from '../../data/CatalogContext'
import { useDocs } from '../../data/useDoc'
import type { VaultDoc } from '../../data/types'
import { fmOf, fmPath, listaEntries, str, wikiTarget } from './hero-model'

function pushTarget(out: Set<string>, value: unknown) {
  const target = wikiTarget(value)
  if (target) out.add(target)
}

function collectTargets(hero: VaultDoc | undefined, fmEffective?: Record<string, unknown>): string[] {
  if (!hero) return []
  // fm EFETIVO (derivado da projeção, com overlay + concessões de regra) quando
  // fornecido — sem ele, itens concedidos por regra (magias de essência,
  // habilidades de classe…) nunca eram carregados e os painéis não conseguiam
  // resolver rank/custo/emoji deles (bug #4c: ficha criada no app ficava sem
  // as magias no card, porque nada estava assado no FM salvo).
  const fm = fmEffective ?? fmOf(hero)
  const out = new Set<string>()

  const armas = fmPath(fm, 'Inventario', 'Armas', 'Lista')
  if (Array.isArray(armas)) {
    for (const arma of armas as Record<string, unknown>[]) {
      pushTarget(out, arma['Nome'])
      pushTarget(out, arma['Propriedade'])
    }
  }
  // Perfil: classe inicial + sintonia (docs reais pro card no hover do Perfil).
  pushTarget(out, fm['Classe'])
  pushTarget(out, fm['Sintonia'])
  pushTarget(out, fmPath(fm, 'Inventario', 'Armadura', 'Propriedade'))
  pushTarget(out, fmPath(fm, 'Inventario', 'Escudo', 'Propriedade'))
  pushTarget(out, fmPath(fm, 'Inventario', 'Armadura', 'Nome'))
  pushTarget(out, fmPath(fm, 'Inventario', 'Escudo', 'Nome'))
  for (const t of (fmPath(fm, 'Inventario', 'Tesouros') as unknown[]) ?? []) pushTarget(out, t)
  for (const c of (fmPath(fm, 'Inventario', 'Consumiveis') as unknown[]) ?? []) pushTarget(out, c)
  for (const e of (fmPath(fm, 'Inventario', 'Armas', 'Proficiencia', 'Especificas') as unknown[]) ?? [])
    pushTarget(out, e)

  for (const entry of listaEntries(fmPath(fm, 'Habilidades', 'Lista'))) {
    out.add(entry.target)
    if (entry.fonte.target) out.add(entry.fonte.target)
  }
  for (const entry of listaEntries(fmPath(fm, 'Tecnicas', 'Lista'))) out.add(entry.target)
  for (const entry of listaEntries(fmPath(fm, 'Acoes', 'Lista'))) out.add(entry.target)

  for (const escolasPath of [
    fmPath(fm, 'Magias', 'Lista'),
    fmPath(fm, 'Magias', 'Secundaria', 'Lista'),
  ]) {
    if (!Array.isArray(escolasPath)) continue
    for (const escola of escolasPath as Record<string, unknown>[]) {
      for (const entry of listaEntries(escola['Lista'])) {
        out.add(entry.target)
        if (entry.fonte.target) out.add(entry.fonte.target)
      }
    }
  }

  const pericias = fmPath(fm, 'Pericias', 'Lista')
  if (Array.isArray(pericias)) {
    for (const p of pericias as Record<string, unknown>[]) {
      if (str(p['Especializacao'])) pushTarget(out, p['Especializacao'])
    }
  }

  const condicoes = fmPath(fm, 'Interativa', 'Condicoes_Ativas')
  if (condicoes && typeof condicoes === 'object') {
    for (const nome of Object.keys(condicoes)) out.add(nome)
  }

  return [...out]
}

export interface HeroRefs {
  /** Doc referenciado por alvo de wikilink (basename ou path). */
  refDoc: (value: unknown) => VaultDoc | undefined
  loaded: boolean
}

export function useHeroRefs(
  hero: VaultDoc | undefined,
  fmEffective?: Record<string, unknown>,
): HeroRefs {
  const catalog = useCatalog()
  const targets = useMemo(() => collectTargets(hero, fmEffective), [hero, fmEffective])
  const idByTarget = useMemo(() => {
    const map = new Map<string, string>()
    for (const target of targets) {
      const res = catalog.resolve(target)
      if (res.kind === 'doc') map.set(target, res.id)
    }
    return map
  }, [catalog, targets])
  const ids = useMemo(() => [...new Set(idByTarget.values())], [idByTarget])
  const docs = useDocs(ids)

  return useMemo(
    () => ({
      loaded: docs !== undefined,
      refDoc: (value: unknown) => {
        const target = wikiTarget(value)
        if (!target || !docs) return undefined
        const id = idByTarget.get(target)
        if (id) return docs.get(id)
        const res = catalog.resolve(target)
        return res.kind === 'doc' ? docs.get(res.id) : undefined
      },
    }),
    [docs, idByTarget, catalog],
  )
}
