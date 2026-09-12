// METADADO DO ENCONTRO (2026-09-12, pedidos do mestre): o que a nota de Combate
// diz ALÉM do roster — onde ele pode acontecer e a descrição breve do que está
// acontecendo. Fonte única: o FRONTMATTER (`Onde`, `Situação`); o corpo da nota
// só exibe via `= this.Onde` / `= this.Situação`, então quem lê é o FM.
//
// Mora fora da CombateView porque três telas usam (a grade da pasta, a página
// do combate e a aba BESTIÁRIO do lugar) e porque importar a view arrasta os
// registros de doc-view por efeito colateral.
import type { VaultDoc } from '../data/types'

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/** Descrição breve do encontro — FM `Situação`. */
export function situacaoDe(doc: VaultDoc | undefined): string {
  return str(doc?.frontmatter?.['Situação'])
}

/** Onde o encontro pode acontecer — FM `Onde` (texto com wikilinks). */
export function ondeDe(doc: VaultDoc | undefined): string {
  return str(doc?.frontmatter?.['Onde'])
}

/** Balde dos encontros sem lugar declarado (rodam em qualquer bairro). */
export const GENERICOS = 'Genéricos'

/** Lugares citados no `Onde` (basenames dos wikilinks, sem repetir). Lista
 *  vazia = encontro genérico. */
export function locaisDoCombate(doc: VaultDoc | undefined): string[] {
  const nomes = [...ondeDe(doc).matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)].map((m) =>
    m[1]!.trim(),
  )
  return [...new Set(nomes)]
}
