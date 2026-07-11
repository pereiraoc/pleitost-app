import { useState, type CSSProperties } from 'react'
import { assetUrl, resolveAsset, useAssetIndex } from '../../data/assets'
import { Lightbox } from '../Lightbox'

interface Props {
  target: string
  /** Modificador de largura do embed (![[img.png|300]]). */
  width?: number
  className?: string
  style?: CSSProperties
  /** Clicar amplia a imagem em tela cheia (lightbox). */
  zoom?: boolean
}

export function VaultImage({ target, width, className, style, zoom }: Props) {
  const index = useAssetIndex()
  const [open, setOpen] = useState(false)
  if (!index) return null

  const entry = resolveAsset(index, target)
  if (!entry) {
    console.warn(`[assets] alvo não resolvido (ambíguo ou inexistente): ${target}`)
    return null
  }
  const src = assetUrl(entry)
  return (
    <>
      <img
        className={className ?? 'vault-image'}
        src={src}
        alt={entry.basename}
        width={width}
        style={zoom ? { ...style, cursor: 'zoom-in' } : style}
        loading="lazy"
        onClick={zoom ? () => setOpen(true) : undefined}
      />
      {zoom && open ? <Lightbox src={src} alt={entry.basename} onClose={() => setOpen(false)} /> : null}
    </>
  )
}
