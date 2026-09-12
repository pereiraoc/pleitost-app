// BESTIÁRIO DO LUGAR (2026-09-12) — quais criaturas podem ser encontradas
// numa Localização. A fonte é a CRIATURA: o FM `Bairros` dela diz onde
// aparece, e o extract publica isso como a faceta `bairros` do índice (mesmo
// desenho do `vende` dos Serviços). O lugar herda dos ancestrais: um ponto de
// interesse mostra o bestiário do bairro, e quem vale pra cidade inteira
// aparece em todos os lugares dela.
import type { IndexDocEntry } from '../data/types'

/** Nomes que um lugar "cobre": ele mesmo e a cadeia de ancestrais. */
export function escoposDoLugar(nome: string, ancestrais: readonly string[]): string[] {
  const fora = new Set<string>()
  const saida: string[] = []
  for (const n of [nome, ...[...ancestrais].reverse()]) {
    const limpo = (n ?? '').trim()
    if (!limpo || fora.has(limpo)) continue
    fora.add(limpo)
    saida.push(limpo)
  }
  return saida
}

/** Criaturas cujo `bairros` cruza com os escopos, na ordem do índice. */
export function criaturasEm(
  criaturas: readonly IndexDocEntry[],
  escopos: readonly string[],
): IndexDocEntry[] {
  const alvo = new Set(escopos)
  return criaturas.filter((c) => (c.bairros ?? []).some((b) => alvo.has(b)))
}
