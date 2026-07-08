import type { CSSProperties } from 'react'
import { assetUrl, resolveAsset, useAssetIndex } from '../../data/assets'

interface Props {
  target: string
  /** Modificador de largura do embed (![[img.png|300]]). */
  width?: number
  className?: string
  style?: CSSProperties
}

export function VaultImage({ target, width, className, style }: Props) {
  const index = useAssetIndex()
  if (!index) return null

  const entry = resolveAsset(index, target)
  if (!entry) {
    console.warn(`[assets] alvo não resolvido (ambíguo ou inexistente): ${target}`)
    return null
  }
  return (
    <img
      className={className ?? 'vault-image'}
      src={assetUrl(entry)}
      alt={entry.basename}
      width={width}
      style={style}
      loading="lazy"
    />
  )
}
