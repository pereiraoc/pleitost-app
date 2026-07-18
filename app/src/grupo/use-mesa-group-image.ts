// Imagem da MESA da sessão (#74, feedback do mestre) — fonte ÚNICA usada tanto
// pela ficha do grupo cheia (GrupoView) quanto pelo botão FICHA DO GRUPO da
// sidebar, pra não divergirem. Precedência: a imagem SUBIDA (state.grupoImagem,
// sincronizada por conta) → senão a HERDADA do grupo persistente dos heróis da
// sessão (ex.: "Aventureiros", via FM `grupo` do herói) → null (caller usa o
// fallback ⚔️/👥). Aditivo e seguro: se nada resolver, devolve null.
import { useMemo } from 'react'
import { useCatalog } from '../data/CatalogContext'
import { useAssetIndex } from '../data/assets'
import { useDoc } from '../data/useDoc'
import { useEntityImageUrl } from '../data/images'
import { useLiveSession } from '../data/session-repo/live-session'
import { resolveGroupImageUrl } from './group-image'

export function useMesaGroupImageUrl(): string | null {
  const live = useLiveSession()
  const catalog = useCatalog()
  const assets = useAssetIndex()
  // grupo persistente que os heróis da sessão referenciam no FM `grupo`.
  const heroGroupId = useMemo(() => {
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
  const heroGroupDoc = useDoc(heroGroupId ?? '').doc
  const heroGroupLocalImg = useEntityImageUrl(heroGroupId)
  const inherited =
    heroGroupLocalImg ??
    (heroGroupDoc ? resolveGroupImageUrl(heroGroupDoc, heroGroupDoc.basename, assets) : null)
  return live?.state?.grupoImagem ?? inherited ?? null
}
