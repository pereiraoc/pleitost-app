// ESCOLHA DO TESOURO (#598 + pedido do mestre 2026-11-23): alguns tesouros
// existem "de alguma coisa" — a Ferramenta Obra-prima é de uma PERÍCIA (e de
// uma atividade dela: "+1 escalar", não "+1 em tudo de Atletismo"), o Colar da
// Eloquência é de um IDIOMA. A NOTA declara no FM (`escolha: Perícia` /
// `escolha: <rótulo do campo>`, texto livre) e a escolha fica no NOME do
// tesouro na ficha — o link segue na nota:
//   [[Ferramenta Obra-prima|Ferramenta Obra-prima de Atletismo (Escalar) (Adepto)]]
//   [[Colar da Eloquência|Colar da Eloquência (Élfico) (Experiente)]]
// Por isso o herói pode ter mais de uma de cada, cada uma com a sua escolha.
import type { VaultDoc } from './types'

export type EscolhaTesouro = { tipo: 'pericia' } | { tipo: 'texto'; rotulo: string }
export interface ValorEscolha {
  /** Perícia (nome canônico da vault) — só na escolha de perícia. */
  pericia: string
  /** Atividade da perícia / texto livre (idioma). */
  detalhe: string
}

/** O que a nota pede pra escolher (FM `escolha`), ou null. "Perícia" = seletor
 *  de perícia + atividade; qualquer outro valor = texto livre com esse rótulo. */
export function escolhaDoTesouro(doc: VaultDoc | undefined): EscolhaTesouro | null {
  const v = doc?.frontmatter?.['escolha']
  const s = typeof v === 'string' ? v.trim() : ''
  if (!s) return null
  return /^per[íi]cia$/i.test(s) ? { tipo: 'pericia' } : { tipo: 'texto', rotulo: s }
}

/** Nome do tesouro com a escolha ("Ferramenta Obra-prima de Atletismo
 *  (Escalar)", "Colar da Eloquência (Élfico)"); sem escolha, o nome da nota. */
export function rotuloComEscolha(alvo: string, escolha: EscolhaTesouro, valor: ValorEscolha): string {
  const detalhe = valor.detalhe.trim()
  const parens = detalhe ? ` (${detalhe})` : ''
  if (escolha.tipo === 'pericia') {
    const pericia = valor.pericia.trim()
    return pericia ? `${alvo} de ${pericia}${parens}` : `${alvo}${parens}`
  }
  return `${alvo}${parens}`
}

/** Inverso de rotuloComEscolha: o nome mostrado → a escolha gravada nele. */
export function lerEscolha(alvo: string, nome: string, escolha: EscolhaTesouro): ValorEscolha {
  const resto = nome.startsWith(alvo) ? nome.slice(alvo.length) : ''
  if (escolha.tipo === 'pericia') {
    const m = /^ de (.+?)(?: \((.*)\))?$/.exec(resto)
    if (m) return { pericia: m[1]!.trim(), detalhe: (m[2] ?? '').trim() }
  }
  const t = /^ \((.*)\)$/.exec(resto)
  return { pericia: '', detalhe: t ? t[1]!.trim() : '' }
}
