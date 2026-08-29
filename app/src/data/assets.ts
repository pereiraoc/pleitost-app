import { useEffect, useState } from 'react'
import type { AssetEntry, AssetsManifest } from './types'
import { activeWorld, onWorldChange } from './world'
import { vaultUrl, withBase } from './base-url'

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
 * primeiro, depois basename. Basename NÃO-ÚNICO resolve pro arquivo de path
 * mais CURTO (desempate lexicográfico) — espelho do getFirstLinkpathDest do
 * Obsidian, VERIFICADO no Obsidian vivo da vault (2026-08-03) com
 * Krasnogor.png/Canto Alto-bw.png/Poção de Cura Adepta.png. A política antiga
 * ("ambíguo → null, nunca chutar") divergia do que o Obsidian mostra pro MESMO
 * embed e apagava a imagem quando um sprite homônimo entrava na vault.
 * Inexistente → null.
 */
export function resolveAsset(index: AssetIndex, target: string): AssetEntry | null {
  const clean = target.trim().normalize('NFC')
  const exact = index.byPath.get(clean)
  if (exact) return exact
  const candidates = index.byBasename.get(clean) ?? []
  if (candidates.length === 0) return null
  if (candidates.length === 1) return candidates[0]!
  return [...candidates].sort(
    (a, b) => a.path.length - b.path.length || a.path.localeCompare(b.path),
  )[0]!
}

let indexPromise: Promise<AssetIndex> | undefined
// troca de MUNDO invalida o índice (#519 G4): o assets.json efetivo muda
onWorldChange(() => {
  indexPromise = undefined
})

/** Índice de assets do MUNDO (#519): no cyberpunk é a UNIÃO — assets do
 *  dataset do mundo vencem por path; o resto herda da fantasia (imagens de
 *  sistema). URLs explícitas: o assets.json não passa pelo vaultUrl ambiente
 *  (senão o mapa da POA nunca entrava no índice — report 2026-08-29). */
async function carregarIndice(): Promise<AssetIndex> {
  const baseRes = await fetch(withBase('vault-data/assets.json'))
  if (!baseRes.ok) throw new Error(`assets.json: HTTP ${baseRes.status}`)
  const base = (await baseRes.json()) as AssetsManifest
  if (activeWorld() === 'fantasia') return buildAssetIndex(base)
  try {
    const res = await fetch(withBase('vault-data-cyberpunk/assets.json'))
    if (res.ok) {
      const mundo = (await res.json()) as AssetsManifest
      const porPath = new Map(base.assets.map((a) => [a.path, a]))
      for (const a of mundo.assets ?? []) porPath.set(a.path, a)
      return buildAssetIndex({ ...base, assets: [...porPath.values()] })
    }
  } catch {
    /* dataset do mundo ausente — índice da fantasia basta */
  }
  return buildAssetIndex(base)
}

export function fetchAssetIndex(): Promise<AssetIndex> {
  indexPromise ??= carregarIndice().catch((err: unknown) => {
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
