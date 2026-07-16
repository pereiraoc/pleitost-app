import { useEffect, useState } from 'react'
import type { AssetEntry, AssetsManifest } from './types'
import { vaultUrl } from './base-url'

/** Extensões de imagem reconhecidas em embeds ![[...]]. */
export const IMAGE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'svg',
  'avif',
  'bmp',
])

export interface AssetIndex {
  byPath: Map<string, AssetEntry>
  byBasename: Map<string, AssetEntry[]>
}

export function buildAssetIndex(manifest: AssetsManifest): AssetIndex {
  const byPath = new Map<string, AssetEntry>()
  const byBasename = new Map<string, AssetEntry[]>()
  for (const entry of manifest.assets) {
    // Normaliza (NFC) a chave — nomes com acento (ç/ã) do filesystem podem vir
    // decompostos (NFD) e não casar com o basename do doc (NFC); normalizar os
    // dois lados garante o match (#123, ex.: Poção da Velocidade).
    byPath.set(entry.path.normalize('NFC'), entry)
    const bkey = entry.basename.normalize('NFC')
    const list = byBasename.get(bkey)
    if (list) list.push(entry)
    else byBasename.set(bkey, [entry])
  }
  return { byPath, byBasename }
}

/** URL servível do asset copiado (copiedTo tem espaços/acentos — escapa por segmento). */
export function assetUrl(entry: AssetEntry): string {
  return vaultUrl(entry.copiedTo.split('/').map(encodeURIComponent).join('/'))
}

// THUMBNAILS (#280): o build gera versões reduzidas (scripts/gen-thumbs.mjs)
// espelhando `assets/**` em `assets-thumb/**` com um `.webp` no fim. Só imagens
// RASTER ganham thumb — svg/gif ficam no original (svg é vetorial; gif animado
// perde o loop no reencode). Nos contextos PEQUENOS (retratos de lista, mini de
// item) o app usa thumbUrl; nos GRANDES (retrato da ficha, hero, lightbox) segue
// no assetUrl cheio.
const THUMB_RASTER_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'avif', 'bmp'])

/** copiedTo → caminho servível do thumb (assets/… → assets-thumb/….webp), ou o
 *  próprio copiedTo pra formatos sem thumb (svg/gif). Puro/derivado — o gerador
 *  usa a MESMA regra ao escrever no dist. */
export function thumbCopiedTo(copiedTo: string): string {
  const ext = copiedTo.split('.').pop()?.toLowerCase() ?? ''
  if (!copiedTo.startsWith('assets/') || !THUMB_RASTER_EXTENSIONS.has(ext)) return copiedTo
  return `assets-thumb/${copiedTo.slice('assets/'.length)}.webp`
}

/** URL do THUMB do asset (contexto pequeno). Formatos sem thumb caem no cheio. */
export function thumbUrl(entry: AssetEntry): string {
  return vaultUrl(thumbCopiedTo(entry.copiedTo).split('/').map(encodeURIComponent).join('/'))
}

/**
 * true quando o app deve PREFERIR thumbs (build de produção). Em dev os thumbs
 * não existem (só nascem no build) — background-image não tem onError pra cair
 * no cheio, então os call sites de retrato/mini de lista gateiam por aqui.
 * VaultImage/`<img>` não precisa: usa onError pra trocar pro cheio quando falta.
 */
export const preferThumb: boolean = import.meta.env.PROD

/** URL de um asset no contexto certo: thumb quando `small` (e o build prefere
 *  thumbs), cheio caso contrário. Ponto único — call sites não montam o caminho
 *  do thumb na mão. */
export function assetUrlFor(entry: AssetEntry, small: boolean): string {
  return small && preferThumb ? thumbUrl(entry) : assetUrl(entry)
}

/**
 * Resolve o alvo de um embed/frontmatter pra um asset copiado: path exato
 * primeiro, depois basename único. Ambíguo/inexistente → null (o caller
 * loga; nunca chutar).
 */
export function resolveAsset(index: AssetIndex, target: string): AssetEntry | null {
  const clean = target.trim().normalize('NFC')
  const exact = index.byPath.get(clean)
  if (exact) return exact
  const candidates = index.byBasename.get(clean) ?? []
  if (candidates.length === 1 && !candidates[0]!.ambiguous) return candidates[0]!
  return null
}

let indexPromise: Promise<AssetIndex> | undefined

export function fetchAssetIndex(): Promise<AssetIndex> {
  indexPromise ??= fetch(vaultUrl('assets.json'))
    .then((res) => {
      if (!res.ok) throw new Error(`assets.json: HTTP ${res.status}`)
      return res.json() as Promise<AssetsManifest>
    })
    .then(buildAssetIndex)
    .catch((err: unknown) => {
      indexPromise = undefined
      throw err
    })
  return indexPromise
}

export function useAssetIndex(): AssetIndex | undefined {
  const [index, setIndex] = useState<AssetIndex>()
  useEffect(() => {
    let alive = true
    fetchAssetIndex().then(
      (loaded) => alive && setIndex(loaded),
      (err: unknown) => console.warn('[assets] índice indisponível:', err),
    )
    return () => {
      alive = false
    }
  }, [])
  return index
}
