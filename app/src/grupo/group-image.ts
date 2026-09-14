// Imagem do grupo — ESPELHA resolveGroupImage do plugin
// (src/render/modes/grupo/resolve-group-image.ts). Hierarquia (1ª que existir):
//   1. property `Imagem` do FM do grupo (wikilink ou path)
//   2. Retratos/<basename da nota>.{png,jpg,jpeg,webp}
//   3. o retrato PADRÃO, ciente do mundo (defaultGroupImageUrl): a arte do
//      mundo em Recursos de Contextos/ vence o default do sistema em Retratos/
//   4. null → caller mantém o fallback ⚔️ do design.
// Passos 2–3 reusam groupImageUrl (src/data/creature-image.ts, já testado).
import { assetUrl, resolveAsset, type AssetIndex } from '../data/assets'
import { defaultGroupImageUrl, groupImageUrl } from '../data/creature-image'
import type { VaultDoc } from '../data/types'

export function resolveGroupImageUrl(
  doc: VaultDoc | undefined,
  basename: string | undefined,
  assets: AssetIndex | undefined,
): string | null {
  if (!assets) return null
  // 1. FM Imagem (mesma extração de wikilink do creature-image.ts).
  const imagem = doc?.frontmatter['Imagem']
  if (typeof imagem === 'string' && imagem.trim()) {
    const target = (/\[\[([^\]|]+)/.exec(imagem)?.[1] ?? imagem).trim()
    const byPath = assets.byPath.get(target)
    if (byPath) return assetUrl(byPath)
    const base = target.split('/').pop()?.trim()
    const entry = base ? resolveAsset(assets, base) : null
    if (entry) return assetUrl(entry)
  }
  // 2–3. Retratos/<basename> → retrato padrão (do mundo, se houver).
  return groupImageUrl(basename, assets) ?? defaultGroupImageUrl(assets)
}
