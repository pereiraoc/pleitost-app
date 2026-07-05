// Hook React: carrega as fontes (docs das Condições + refs do herói) e
// computa o ConditionContext espelhado sobre o FM COM overlay (useHeroModel)
// — recomputa a cada toggle persistido. Fontes/semântica: ver hero-context.ts.
import { useMemo } from 'react'
import type { VaultDoc } from '../data/types'
import { useCatalog } from '../data/CatalogContext'
import { useDocs } from '../data/useDoc'
import { useHeroModel } from '../data/useHeroModel'
import type { HeroRefs } from '../components/ficha/useHeroRefs'
import { fmOf, fmPath, str } from '../components/ficha/hero-model'
import {
  CONDICOES_FOLDER,
  ERGUER_ESCUDO_ID,
  computeInterativaCtx,
  isCondicaoDoc,
  type InterativaComputed,
} from './hero-context'
import type { EffectDescriptor } from './descriptor'

/** Docs universais da engine além das condições (toggle ERGUER do design). */
const EXTRA_EFFECT_IDS = [ERGUER_ESCUDO_ID]

/** Ids dos docs da pasta de condições no catálogo. */
export function useCondicaoDocs(): { docs: VaultDoc[]; loaded: boolean } {
  const catalog = useCatalog()
  const ids = useMemo(
    () =>
      catalog.content
        .filter((e) => e.id.startsWith(CONDICOES_FOLDER) && e.basename !== 'Condições')
        .map((e) => e.id)
        .concat(EXTRA_EFFECT_IDS.filter((id) => catalog.content.some((e) => e.id === id))),
    [catalog],
  )
  const docs = useDocs(ids)
  return useMemo(
    () => ({ docs: docs ? [...docs.values()] : [], loaded: docs !== undefined }),
    [docs],
  )
}

export interface InterativaCtxState extends InterativaComputed {
  loaded: boolean
  /** Docs da pasta de condições (fonte dos chips do popover CONDIÇÕES). */
  condicaoDocs: VaultDoc[]
}

/** ConditionContext do herói (condições ativas + efeitos ligados) sobre o
 *  FM overlaid. `refs` deve ser o HeroRefs da ficha (mesmos docs). */
export function useInterativaCtx(doc: VaultDoc, refs: HeroRefs): InterativaCtxState {
  const model = useHeroModel(doc, 'combate')
  const fm = model.fm
  const catalog = useCatalog()
  const { docs: allExtra, loaded } = useCondicaoDocs()

  // 2ª fase de carga: propriedades INTRÍNSECAS das armas equipadas (inline
  // `propriedades::` do doc da arma — Apunhalante etc.) declaram efeitos e
  // não estão nos targets do useHeroRefs (que só vê o FM do herói). Deriva
  // os alvos dos docs das armas já carregados e carrega esses docs também.
  const propIds = useMemo(() => {
    const out = new Set<string>()
    const armas = fmPath(fm, 'Inventario', 'Armas', 'Lista')
    if (Array.isArray(armas)) {
      for (const arma of armas as Record<string, unknown>[]) {
        const armaDoc = refs.refDoc(arma['Nome'])
        const raw = str((armaDoc?.inlineFields as Record<string, unknown> | undefined)?.['propriedades'])
        const re = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g
        let m: RegExpExecArray | null
        while ((m = re.exec(raw)) !== null) {
          const res = catalog.resolve(m[1].trim())
          if (res.kind === 'doc') out.add(res.id)
        }
      }
    }
    return [...out]
  }, [fm, refs, catalog])
  const propDocs = useDocs(propIds)

  return useMemo(() => {
    const condicaoDocs = allExtra.filter((d) => isCondicaoDoc(d))
    const extraDocs = allExtra.filter((d) => !isCondicaoDoc(d))
    // refDoc estendido: docs de propriedade primeiro, HeroRefs depois.
    const refDoc = (value: unknown): VaultDoc | undefined => {
      const fromRefs = refs.refDoc(value)
      if (fromRefs) return fromRefs
      const target = str(value).replace(/^\[\[|\]\]$/g, '').split('|')[0].trim()
      if (target && propDocs) {
        const res = catalog.resolve(target)
        if (res.kind === 'doc') return propDocs.get(res.id)
      }
      return undefined
    }
    const computed = computeInterativaCtx({
      fm,
      refDoc,
      condicaoDocs,
      extraDocs,
    })
    return {
      ...computed,
      condicaoDocs,
      loaded: loaded && refs.loaded && propDocs !== undefined,
    }
  }, [fm, refs, catalog, allExtra, loaded, propDocs])
}

// ──────────────────────────────────────────────────────────────────────────
// Chips de condição (popover CONDIÇÕES do design)
// ──────────────────────────────────────────────────────────────────────────

export interface CondChipDef {
  nome: string
  grupo: 'Positiva' | 'Negativa'
  ic: string
}

/** Lista completa de condições togláveis — união das condições do sistema
 *  (Sistema/Regras/Condições, grupo do FM) com os efeitos `tipo: Condição`
 *  visíveis pro herói (Inspiração, Encantar Arma, Celeridade, …), como a
 *  Lista de Condições do plugin (tab-recursos). Ícone = visual.iconeLigado
 *  do bloco; default 🌟 (bonusType.Condicao do registro). */
export function condChipDefs(
  condicaoDocs: readonly VaultDoc[],
  descriptors: readonly EffectDescriptor[],
  fallbackIcon: string,
): CondChipDef[] {
  const out = new Map<string, CondChipDef>()
  for (const doc of condicaoDocs) {
    if (!isCondicaoDoc(doc)) continue
    const fm = fmOf(doc)
    const nome = doc.basename ?? doc.id
    const grupo = str(fm['grupo']) === 'Positiva' ? 'Positiva' : 'Negativa'
    // Ícone do bloco Efeitos_Interativos da própria condição, se houver.
    const blocos = fm['Efeitos_Interativos']
    let ic = fallbackIcon
    if (Array.isArray(blocos)) {
      const own = blocos.find(
        (b) => b && typeof b === 'object' && str((b as Record<string, unknown>)['label']) === nome,
      ) as Record<string, unknown> | undefined
      const visual = (own?.['visual'] ?? {}) as Record<string, unknown>
      if (str(visual['iconeLigado'])) ic = str(visual['iconeLigado'])
    }
    out.set(nome, { nome, grupo, ic })
  }
  for (const desc of descriptors) {
    if (desc.tipo !== 'Condição' || desc.sharedFrom) continue
    if (out.has(desc.label)) continue
    out.set(desc.label, {
      nome: desc.label,
      grupo: desc.grupo === 'Negativa' ? 'Negativa' : 'Positiva',
      ic: desc.parameters['IconeLigado'] || fallbackIcon,
    })
  }
  return [...out.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}
