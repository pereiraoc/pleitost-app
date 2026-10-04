// Lightbox: amplia uma imagem em tela cheia (overlay via portal, fora do fluxo
// pra não ser cortado pelo clip/overflow das sidebars). Clicar em qualquer lugar
// (ou Esc) volta ao normal. Usado pelo VaultImage quando `zoom`.
//
// O overlay SEGURA o clique (`stopPropagation`). Não é detalhe: portal do React
// propaga o evento pela ÁRVORE DE COMPONENTES, não pela do DOM, então sem isso
// o clique atravessa o overlay e cai em quem renderizou o Lightbox. Na aba
// RECURSOS isso travava a imagem — fechava e a própria figura reabria na mesma
// hora (report do mestre, 2026-09-13) — e nas linhas clicáveis da sessão ainda
// trocava a seleção por baixo.
import { useEffect, type CSSProperties, type ReactNode } from 'react'
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

/** `acoes`: botões por cima da imagem (ex.: 📌 MURAL do mestre). Clicar
 *  neles NÃO fecha — a faixa segura o próprio clique. */
export function Lightbox({ src, alt, onClose, acoes }: { src: string; alt?: string; onClose: () => void; acoes?: ReactNode }) {
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
      onClick={(e) => {
        e.stopPropagation()
        onClose()
      }}
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
      {acoes ? (
        <div
          data-lightbox-acoes=""
          onClick={(e) => e.stopPropagation()}
          style={{ position: 'absolute', top: 14, right: 14, display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'default' }}
        >
          {acoes}
        </div>
      ) : null}
    </div>,
    document.body,
  )
}
