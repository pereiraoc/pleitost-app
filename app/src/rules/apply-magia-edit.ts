// Add/remove de magia APRENDIDA por slot no Editável do app — PORTA de
// addMagia/removeMagia do plugin pleitost-autosheet (src/extract/
// apply-magias-edit.ts), operando nas LINHAS do FM (Magias.Lista = escolas com
// `Lista: [{ [wikilink]: source }]`) em vez do InternalSheetModel.
//
// addMagiaToEscola: adiciona `{ [link]: "Slot.<rank>" }` na escola alvo,
//   idempotente por alvo do wikilink. removeMagiaFromEscola: filtra o alvo,
//   NUNCA remove entradas de Regra (rule-granted, readonly). O merge reaplica
//   as concessões de regra por cima (merge-calculated.ts, appendMergeFmList).

type Escola = Record<string, unknown>
type Entry = Record<string, unknown>

const WIKILINK = /^\[\[([^\]|]+)(?:\|[^\]]+)?\]\]$/

function wikiTarget(s: string): string {
  const m = s.match(WIKILINK)
  return (m ? m[1]! : s).trim()
}

function slugify(s: string): string {
  return String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '')
}

function isRuleSource(src: unknown): boolean {
  return typeof src === 'string' && src.startsWith('Regra')
}

function listaOf(esc: Escola): Entry[] {
  return Array.isArray(esc.Lista) ? (esc.Lista as Entry[]) : []
}

function matchEscola(esc: Escola, nome: string): boolean {
  const n = String(esc.Nome)
  return n === nome || slugify(n) === slugify(nome)
}

/** Adiciona a magia `link` (com source `Slot.<rank>`) na escola `escolaNome`.
 *  Idempotente: se o alvo do wikilink já está aprendido na escola, no-op. */
export function addMagiaToEscola(
  escolas: Escola[],
  escolaNome: string,
  link: string,
  rank: 'B' | 'A' | 'E' | 'M',
): Escola[] {
  const target = wikiTarget(link)
  return escolas.map((esc) => {
    if (!matchEscola(esc, escolaNome)) return esc
    const lista = listaOf(esc)
    if (lista.some((e) => wikiTarget(Object.keys(e)[0] ?? '') === target)) return esc
    return { ...esc, Lista: [...lista, { [link]: `Slot.${rank}` }] }
  })
}

/** Remove a magia de alvo `target` da escola `escolaNome`. Preserva entradas
 *  de Regra (rule-granted). */
export function removeMagiaFromEscola(escolas: Escola[], escolaNome: string, target: string): Escola[] {
  const wt = wikiTarget(target)
  return escolas.map((esc) => {
    if (!matchEscola(esc, escolaNome)) return esc
    const lista = listaOf(esc)
    const next = lista.filter((e) => {
      const key = Object.keys(e)[0] ?? ''
      if (wikiTarget(key) !== wt) return true
      return isRuleSource(e[key])
    })
    return { ...esc, Lista: next }
  })
}
