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
  if (candidates.length === 1 && !candidates[0].ambiguous) return candidates[0]
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
