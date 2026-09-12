// ENQUADRAMENTO DO RETRATO (report 2026-09-07, de novo em 2026-09-12): imagem
// de gente cortada mostra a CARA, nunca o centro geométrico. O token único vive
// no app.css; quem renderiza retrato espalha este estilo em vez de repetir
// percentual no call-site.
import type { CSSProperties } from 'react'

export const ENQUADRAMENTO_RETRATO = 'var(--enquadramento-retrato)'

/** <img> de retrato: preenche o quadro e ancora no terço superior. */
export const retratoCover: CSSProperties = {
  objectFit: 'cover',
  objectPosition: ENQUADRAMENTO_RETRATO,
}
