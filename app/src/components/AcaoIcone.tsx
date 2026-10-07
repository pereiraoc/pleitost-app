// <AcaoIcone>: o ícone de custo de ação (1/2/3 ações, reação, ação livre) —
// glifo vetorial inline, fill=currentColor (herda a cor do texto: tema claro/
// escuro, badges coloridos) e imprime sem depender de mask/background.
// Altura 1em, largura proporcional ao glifo (3 ações é mais larga).
//
// <CustoIcone>: ponto ÚNICO onde um custo cru da vault vira ícone — custo de
// ação → <AcaoIcone>; os outros seguem a representação de antes de cada modo
// (emoji do registro `custo`, ▫️ das técnicas, dígito/sigla do badge).
import type { CSSProperties, ReactNode } from 'react'
import { ACAO_GLIFOS, ACAO_GLIFO_ALTURA } from '../generated/acao-icones'
import { ACAO_ROTULO, custoAcaoTipo, custoDigits, type AcaoTipo } from './acao-custo'
import { custoEmoji, tecnicaCustoEmoji } from './ficha/registry'
import { linkAcaoForEntry, linkIconForEntry, type IconEntry } from '../markdown/link-icon'

export function AcaoIcone({ tipo, style }: { tipo: AcaoTipo; style?: CSSProperties }) {
  const g = ACAO_GLIFOS[tipo]
  const rotulo = ACAO_ROTULO[tipo]
  return (
    // span com role=img: o title dá o tooltip e o svg não entra no textContent
    <span
      className="acao-icone"
      role="img"
      aria-label={rotulo}
      title={rotulo}
      data-acao={tipo}
      style={{ display: 'inline-block', lineHeight: 0, verticalAlign: '-0.14em', flex: 'none', ...style }}
    >
      <svg
        viewBox={`0 0 ${g.w} ${ACAO_GLIFO_ALTURA}`}
        aria-hidden="true"
        focusable="false"
        style={{ height: '1em', width: `${(g.w / ACAO_GLIFO_ALTURA).toFixed(3)}em`, fill: 'currentColor', display: 'block' }}
      >
        <path fillRule="evenodd" d={g.d} />
      </svg>
    </span>
  )
}

/** Antes do rótulo de um link (no lugar do `emoji + ' '` do ::before). */
export const ACAO_NO_LINK: CSSProperties = { marginRight: '0.3em' }

/** acao: emoji do registro pros demais · tecnica: ▫️/emojiCostExtra (1A = ▫️)
 *  · badge: dígito/sigla · texto: o custo verbatim (papel). */
export type CustoModo = 'acao' | 'tecnica' | 'badge' | 'texto'

/** Representação de um custo cru — ícone se é de ação; senão o que o modo
 *  mostrava antes ('' quando não há nada). */
export function custoIcone(custo: unknown, modo: CustoModo = 'acao', style?: CSSProperties): ReactNode {
  const c = typeof custo === 'string' ? custo.trim() : ''
  // técnicas: 1A é o custo padrão do slot e o design mostra ▫️ (Empty)
  if (modo === 'tecnica' && c === '1A') return tecnicaCustoEmoji(c)
  const tipo = custoAcaoTipo(c)
  if (tipo) return <AcaoIcone tipo={tipo} style={style} />
  if (modo === 'tecnica') return tecnicaCustoEmoji(c)
  if (modo === 'badge') return custoDigits(c)
  if (modo === 'texto') return c
  return custoEmoji(c)
}

export function CustoIcone({ custo, modo = 'acao', style }: { custo: unknown; modo?: CustoModo; style?: CSSProperties }) {
  return <>{custoIcone(custo, modo, style)}</>
}

/** Ícone supercharged do doc-alvo como NÓ: custo de ação → <AcaoIcone>; senão
 *  o emoji de linkIconForEntry ('' = sem ícone, falsy pros `||` de fallback). */
export function linkIcone(entry: IconEntry | undefined, style?: CSSProperties): ReactNode {
  const acao = linkAcaoForEntry(entry)
  return acao ? <AcaoIcone tipo={acao} style={style} /> : linkIconForEntry(entry)
}
