// Imagem do grupo — ESPELHA resolveGroupImage do plugin
// (src/render/modes/grupo/resolve-group-image.ts). Hierarquia (1ª que existir):
//   1. property `Imagem` do FM do grupo (wikilink ou path)
//   2. Retratos/<basename da nota>.{png,jpg,jpeg,webp}
//   3. Retratos/Grupo de Criaturas.{png,jpg,jpeg,webp}
//   4. null → caller mantém o fallback ⚔️ do design.
// Passos 2–3 reusam groupImageUrl (src/data/creature-image.ts, já testado).
import { assetUrl, resolveAsset, type AssetIndex } from '../data/assets'
import { groupImageUrl } from '../data/creature-image'
import type { VaultDoc } from '../data/types'

const DEFAULT_GROUP_BASENAME = 'Grupo de Criaturas'

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
  // 2–3. Retratos/<basename> → Retratos/Grupo de Criaturas.
  return groupImageUrl(basename, assets) ?? groupImageUrl(DEFAULT_GROUP_BASENAME, assets)
}
