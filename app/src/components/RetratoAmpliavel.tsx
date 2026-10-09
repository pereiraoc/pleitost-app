// Retrato de CARD de lista (heróis, bestiário, pessoas, grupos) que AMPLIA ao
// clicar (pedido do mestre, 2026-10-09): "quando tem imagem eu quero poder
// clicar na imagem pra ver ela maior … se eu clico no resto do cartão, pode
// manter como tá". Mesmo idioma da FiguraDaCriatura (BestiarioTab) e do
// RecursoThumb: o clique na imagem para ali (`stopPropagation`) e abre o
// Lightbox com a versão CHEIA; o resto do card segue abrindo a ficha.
//
// `focavel={false}` quando o card já é um `<button>` de verdade (GroupCard,
// PessoaDeAnotacaoCard): botão dentro de botão não deve entrar no Tab — o
// clique continua ampliando.
import { useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { Lightbox } from './Lightbox'

export function RetratoAmpliavel({
  src,
  cheia,
  nome,
  className,
  as: Tag = 'span',
  focavel = true,
}: {
  /** imagem do card (thumb) */
  src: string
  /** versão cheia pro lightbox; sem ela amplia o próprio `src` */
  cheia?: string | null
  nome: string
  className: string
  as?: 'span' | 'div'
  focavel?: boolean
}) {
  const [aberta, setAberta] = useState(false)
  const abre = (e: ReactMouseEvent | ReactKeyboardEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setAberta(true)
  }
  const style: CSSProperties = { backgroundImage: `url("${src}")`, cursor: 'zoom-in' }
  return (
    <Tag
      className={className}
      data-retrato-ampliavel=""
      role="button"
      tabIndex={focavel ? 0 : -1}
      aria-label={`Ampliar imagem de ${nome}`}
      title="Ampliar imagem"
      onClick={abre}
      onKeyDown={(e: ReactKeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') abre(e)
      }}
      style={style}
    >
      {aberta ? <Lightbox src={cheia || src} alt={nome} onClose={() => setAberta(false)} /> : null}
    </Tag>
  )
}
