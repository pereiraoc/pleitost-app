import type { ReactNode } from 'react'
import { useCatalog } from '../../data/CatalogContext'
import { DetailLink } from '../DetailLink'

import { unquote } from '../../markdown/dataview-value'
import { reskinName, reskinText } from '../../data/reskin'
import { useRefInterna } from '../../markdown/ref-interna'

const WIKILINK = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g
/** `**negrito**` e `*itálico*` — os campos de uma linha caíam como texto cru,
 *  e a ficha do NPC mostrava "um **revólver de serviço** no coldre" com os
 *  asteriscos na cara (report 2026-09-10: "difícil de ler"). */
const ENFASE = /\*\*([^*]+)\*\*|\*([^*]+)\*/g

/** Trecho de texto puro com a ênfase do markdown aplicada. */
function comEnfase(texto: string, chave: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  for (const m of texto.matchAll(ENFASE)) {
    const i = m.index
    if (i > last) out.push(texto.slice(last, i))
    out.push(
      m[1] !== undefined ? (
        <strong key={`${chave}-${i}`}>{m[1]}</strong>
      ) : (
        <em key={`${chave}-${i}`}>{m[2]}</em>
      ),
    )
    last = i + m[0].length
  }
  if (last < texto.length) out.push(texto.slice(last))
  return out
}

/**
 * Valor de inline field com a sintaxe dataview renderizada: wikilinks viram
 * links navegáveis (via resolver do catálogo) e string literals perdem as
 * aspas. Alvos ambíguos/inexistentes ficam como texto (M1).
 */
export function InlineFieldValue({ value }: { value: string }) {
  const catalog = useCatalog()
  // `[[#Âncora]]` (registro da própria aventura) — quem sabe abrir é a tela
  const refInterna = useRefInterna()
  const text = unquote(value)
  const parts: ReactNode[] = []
  let last = 0
  // matchAll usa iterador próprio (não muta o lastIndex do regex de módulo) —
  // evita estado compartilhado mutável durante o render (react-hooks/immutability).
  for (const match of text.matchAll(WIKILINK)) {
    const idx = match.index
    if (idx > last) parts.push(...comEnfase(reskinText(text.slice(last, idx)), `t${idx}`))
    const [, target, alias] = match
    // #519: rótulo exibido passa pelo reskin do mundo (target segue canônico).
    const label = reskinName(alias ?? target!.replace(/^#/, ''))
    if (target!.startsWith('#')) {
      const interno = refInterna?.(target!.slice(1).trim(), label)
      parts.push(interno ?? <span key={parts.length}>{label}</span>)
      last = idx + match[0].length
      continue
    }
    const res = catalog.resolve(target!)
    parts.push(
      res.kind === 'doc' ? (
        // #88: abre nos DETALHES da sidebar quando há uma; senão navega
        <DetailLink key={parts.length} id={res.id}>
          {label}
        </DetailLink>
      ) : (
        <span key={parts.length}>{label}</span>
      ),
    )
    last = idx + match[0].length
  }
  if (last < text.length) parts.push(...comEnfase(reskinText(text.slice(last)), 'fim'))
  return <>{parts}</>
}
