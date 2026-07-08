// Add/remove de técnica APRENDIDA por slot no Editável do app — PORTA de
// addTecnica/removeTecnica do plugin pleitost-autosheet (src/extract/
// apply-tecnicas-edit.ts), operando na LISTA PLANA do FM (Tecnicas.Lista =
// `[{ [wikilink]: source }]`) em vez do InternalSheetModel.
//
// addTecnicaToLista: adiciona `{ [link]: "Slot.<rank>" }`, idempotente por
//   alvo do wikilink. removeTecnicaFromLista: filtra o alvo, NUNCA remove
//   entradas de Regra (rule-granted, readonly). O merge reaplica as concessões
//   de regra por cima (merge-calculated.ts).

type Entry = Record<string, unknown>

const WIKILINK = /^\[\[([^\]|]+)(?:\|[^\]]+)?\]\]$/

function wikiTarget(s: string): string {
  const m = s.match(WIKILINK)
  return (m ? m[1] : s).trim()
}

function isRuleSource(src: unknown): boolean {
  return typeof src === 'string' && src.startsWith('Regra')
}

/** Adiciona a técnica `link` (source `Slot.<rank>`) na lista plana de técnicas.
 *  Idempotente: se o alvo do wikilink já está aprendido, no-op. */
export function addTecnicaToLista(lista: Entry[], link: string, rank: 'A' | 'E' | 'M'): Entry[] {
  const target = wikiTarget(link)
  if (lista.some((e) => wikiTarget(Object.keys(e)[0] ?? '') === target)) return lista
  return [...lista, { [link]: `Slot.${rank}` }]
}

/** Remove a técnica de alvo `target` da lista. Preserva entradas de Regra. */
export function removeTecnicaFromLista(lista: Entry[], target: string): Entry[] {
  const wt = wikiTarget(target)
  return lista.filter((e) => {
    const key = Object.keys(e)[0] ?? ''
    if (wikiTarget(key) !== wt) return true
    return isRuleSource(e[key])
  })
}
