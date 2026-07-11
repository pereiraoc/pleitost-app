// Lightbox: amplia uma imagem em tela cheia (overlay via portal, fora do fluxo
// pra não ser cortado pelo clip/overflow das sidebars). Clicar em qualquer lugar
// (ou Esc) volta ao normal. Usado pelo VaultImage quando `zoom`.
import { useEffect, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'

const OVERLAY: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 1000,
  background: 'rgba(0,0,0,.86)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
  cursor: 'zoom-out',
}

export function Lightbox({ src, alt, onClose }: { src: string; alt?: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div
      data-lightbox=""
      role="dialog"
      aria-label={alt ? `Imagem ampliada: ${alt}` : 'Imagem ampliada'}
      onClick={onClose}
      style={OVERLAY}
    >
      <img
        src={src}
        alt={alt}
        style={{
          maxWidth: '100%',
          maxHeight: '100%',
          objectFit: 'contain',
          boxShadow: '0 8px 40px rgba(0,0,0,.6)',
        }}
      />
    </div>,
    document.body,
  )
}
