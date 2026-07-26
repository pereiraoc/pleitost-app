// Imagem da MESA da sessão (#74, feedback do mestre) — fonte ÚNICA usada tanto
// pela ficha do grupo cheia (GrupoView) quanto pelo botão FICHA DO GRUPO da
// sidebar, pra não divergirem. Precedência: a imagem SUBIDA (state.grupoImagem,
// sincronizada por conta) → senão a HERDADA do grupo persistente dos heróis da
// sessão (ex.: "Aventureiros", via FM `grupo` do herói) → senão a imagem
// DEFAULT "Grupo de Criaturas" (Retratos/Grupo de Criaturas.png) → null.
// Aditivo e seguro: se nem o default existir nos assets, devolve null e o
// caller mantém o fallback ⚔️/👥.
import { useMemo } from 'react'
import { useCatalog } from '../data/CatalogContext'
import { useAssetIndex } from '../data/assets'
import { groupImageUrl } from '../data/creature-image'
import { useDoc } from '../data/useDoc'
import { useEntityImageUrl } from '../data/images'
import { useLiveSession } from '../data/session-repo/live-session'
import { resolveGroupImageUrl } from './group-image'

const DEFAULT_GROUP_BASENAME = 'Grupo de Criaturas'

/** Grupo PERSISTENTE da mesa: o primeiro grupo que os personagens publicados
 *  referenciam no FM `grupo` (fmBlob). Fonte única da ponte mesa↔grupo — usada
 *  pela imagem herdada (#74) e pelo armazenamento da EXPLORAÇÃO (#379 r2: a
 *  trilha é do GRUPO, não da sessão). null = mesa sem grupo persistente. */
export function useMesaGrupoPersistenteId(): string | null {
  const live = useLiveSession()
  const catalog = useCatalog()
  return useMemo(() => {
    for (const c of live?.characters ?? []) {
      const raw = (c.fmBlob as Record<string, unknown> | undefined)?.['grupo']
      const list = Array.isArray(raw) ? raw : raw != null ? [raw] : []
      for (const v of list) {
        const t = typeof v === 'string' ? (/\[\[([^\]|#]+)/.exec(v)?.[1] ?? v).trim() : ''
        if (!t) continue
        const res = catalog.resolve(t)
        if (res.kind === 'doc') return res.id
      }
    }
    return null
  }, [live, catalog])
}

export function useMesaGroupImageUrl(): string | null {
  const live = useLiveSession()
  const assets = useAssetIndex()
  // grupo persistente que os heróis da sessão referenciam no FM `grupo`.
  const heroGroupId = useMesaGrupoPersistenteId()
  const heroGroupDoc = useDoc(heroGroupId ?? '').doc
  const heroGroupLocalImg = useEntityImageUrl(heroGroupId)
  const inherited =
    heroGroupLocalImg ??
    (heroGroupDoc ? resolveGroupImageUrl(heroGroupDoc, heroGroupDoc.basename, assets) : null)
  return (
    live?.state?.grupoImagem ??
    inherited ??
    groupImageUrl(DEFAULT_GROUP_BASENAME, assets)
  )
}
