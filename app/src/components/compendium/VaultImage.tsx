import { useState, type CSSProperties, type SyntheticEvent } from 'react'
import { assetUrl, thumbUrl, resolveAsset, useAssetIndex } from '../../data/assets'
import { Lightbox } from '../Lightbox'

interface Props {
  target: string
  /** Modificador de largura do embed (![[img.png|300]]). */
  width?: number
  className?: string
  style?: CSSProperties
  /** Clicar amplia a imagem em tela cheia (lightbox). */
  zoom?: boolean
  /**
   * #280: contexto PEQUENO (miniatura em lista/chip) — carrega o thumb gerado
   * no build. Se o thumb não existe (dev, ou imagem pulada por já ser pequena),
   * o onError troca o src pro cheio UMA vez (sem loop). O lightbox e o alvo do
   * zoom seguem sempre no cheio/nítido.
   */
  thumb?: boolean
}

export function VaultImage({ target, width, className, style, zoom, thumb }: Props) {
  const index = useAssetIndex()
  const [open, setOpen] = useState(false)
  if (!index) return null

  const entry = resolveAsset(index, target)
  if (!entry) {
    console.warn(`[assets] alvo não resolvido (ambíguo ou inexistente): ${target}`)
    return null
  }
  const full = assetUrl(entry)
  // thumb → carrega o reduzido; sem thumb → cheio. O zoom SEMPRE amplia o cheio.
  const src = thumb ? thumbUrl(entry) : full
  // Fallback robusto: se o thumb falhar (404 em dev/imagem pulada), troca pro
  // cheio uma única vez — o guard evita loop caso o cheio também falhe.
  const onError = thumb
    ? (e: SyntheticEvent<HTMLImageElement>) => {
        const img = e.currentTarget
        if (img.src !== full) img.src = full
      }
    : undefined
  return (
    <>
      <img
        className={className ?? 'vault-image'}
        src={src}
        alt={entry.basename}
        width={width}
        style={zoom ? { ...style, cursor: 'zoom-in' } : style}
        loading="lazy"
        onError={onError}
        onClick={zoom ? () => setOpen(true) : undefined}
      />
      {zoom && open ? <Lightbox src={full} alt={entry.basename} onClose={() => setOpen(false)} /> : null}
    </>
  )
}
