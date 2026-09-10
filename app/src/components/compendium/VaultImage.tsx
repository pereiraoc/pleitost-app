import { useEffect, useRef, useState, type CSSProperties, type SyntheticEvent } from 'react'
import { assetUrl, thumbUrl, resolveAsset, useAssetIndex } from '../../data/assets'
import { useArquivoCifrado } from '../../data/arquivos-cifrados'
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
  /** Carrega já, sem esperar entrar em tela (impressão: a página inteira vai
   *  pro papel mesmo sem rolar até ela). Só afeta figura cifrada. */
  eager?: boolean
}

export function VaultImage({ target, width, className, style, zoom, thumb, eager }: Props) {
  const index = useAssetIndex()
  // FIGURA DA CAMPANHA: alvo que só um doc TRANCADO embute não está no
  // manifesto público — vem cifrado e só existe depois de destravar.
  const cifrado = useArquivoCifrado(target)
  const [open, setOpen] = useState(false)

  const entry = index ? resolveAsset(index, target) : null
  if (!entry) {
    if (cifrado.url) return <Figura src={cifrado.url} full={cifrado.url} alt={target} width={width} className={className} style={style} zoom={zoom} open={open} setOpen={setOpen} />
    // alvo cifrado ainda sem bytes: reserva o espaço e só baixa quando entra em
    // tela (as figuras de aventura são PNGs de mesa, pesados).
    if (cifrado.conhecido) return <EsperaFigura pedir={cifrado.pedir} imediato={eager} className={className} style={style} />
    if (!index) return null
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
    <Figura
      src={src}
      full={full}
      alt={entry.basename}
      width={width}
      className={className}
      style={style}
      zoom={zoom}
      onError={onError}
      open={open}
      setOpen={setOpen}
    />
  )
}

/** URL da imagem CHEIA de um alvo pelos mesmos dois caminhos do VaultImage
 *  (manifesto público ou figura cifrada do doc em contexto), já pedindo os
 *  bytes cifrados. Pra quem precisa dos BYTES, não só mostrar (o papel lê a
 *  escala física do PNG com grid). */
export function useUrlCheia(target: string | null): string | null {
  const index = useAssetIndex()
  const cifrado = useArquivoCifrado(target ?? '')
  const entry = index && target ? resolveAsset(index, target) : null
  const { conhecido, pedir } = cifrado
  useEffect(() => {
    if (!entry && conhecido) pedir()
  }, [entry, conhecido, pedir])
  return entry ? assetUrl(entry) : cifrado.url
}

/** Espaço reservado da figura cifrada: pede os bytes quando entra em tela
 *  (sem IntersectionObserver — jsdom dos testes — pede na hora). */
function EsperaFigura({ pedir, imediato, className, style }: { pedir: () => void; imediato?: boolean; className?: string; style?: CSSProperties }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (imediato || typeof IntersectionObserver === 'undefined') {
      pedir()
      return
    }
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver((entradas) => {
      if (entradas.some((e) => e.isIntersecting)) {
        pedir()
        io.disconnect()
      }
    })
    io.observe(el)
    return () => io.disconnect()
  }, [pedir, imediato])
  return <span ref={ref} className={className ?? 'vault-image'} style={{ display: 'block', ...style }} data-figura-cifrada="" aria-hidden />
}

/** A imagem em si (+ lightbox no zoom) — uma só forma pros dois caminhos:
 *  asset público do manifesto e figura decifrada de um doc trancado. */
function Figura({
  src,
  full,
  alt,
  width,
  className,
  style,
  zoom,
  onError,
  open,
  setOpen,
}: {
  src: string
  full: string
  alt: string
  width?: number
  className?: string
  style?: CSSProperties
  zoom?: boolean
  onError?: (e: SyntheticEvent<HTMLImageElement>) => void
  open: boolean
  setOpen: (v: boolean) => void
}) {
  return (
    <>
      <img
        className={className ?? 'vault-image'}
        src={src}
        alt={alt}
        width={width}
        style={zoom ? { ...style, cursor: 'zoom-in' } : style}
        loading="lazy"
        onError={onError}
        onClick={zoom ? () => setOpen(true) : undefined}
      />
      {zoom && open ? <Lightbox src={full} alt={alt} onClose={() => setOpen(false)} /> : null}
    </>
  )
}
