// AJUSTES DE REGRA DO MUNDO (#544 — semente do C7). Pós-processo PURO sobre o
// FM derivado da projeção, dirigido pelos dados do Contexto-Def
// (`regras.companheiroAnimal` no POA 1987; fantasia sem o bloco = intocada):
//
//  - `tamanho`: todo Empregado é Médio — fixa o Tamanho derivado e remove os
//    fragmentos de tamanho do alias composto da Classe (display/materializer).
//  - `semArmasNaturais`: o Empregado não luta de mandíbula — remove da lista
//    de Ataques os que apontam pra arma de grupo `natural` (o dado vem do
//    índice, nunca de heurística de nome); sobram desarmado, manobras e a
//    arma que o jogador escolher no Inventário (grupos/mãos do def).
import type { Catalog } from '../data/catalog'
import { contextoRegras } from '../data/reskin'
import { wikiTarget } from '../components/ficha/hero-model'

/** Vocabulário canônico de tamanhos do sistema (fragmentos do Alias Compor). */
const TAMANHOS = new Set(['Minúsculo', 'Pequeno', 'Médio', 'Grande', 'Enorme', 'Colossal'])

function ehFamiliaCa(fm: Record<string, unknown>): boolean {
  return String(fm['subcategoria'] ?? '') === 'Companheiro Animal'
}

/** Remove tokens de tamanho do LABEL do alias composto ("Segurança Médio" →
 *  "Segurança"); o target do wikilink nunca muda. */
export function aliasSemTamanho(classeWl: string): string {
  const m = /^\[\[([^\]|]+)\|([^\]]+)\]\]$/.exec(classeWl.trim())
  if (!m) return classeWl
  const label = m[2]!
    .split(/\s+/)
    .filter((t) => !TAMANHOS.has(t))
    .join(' ')
    .trim()
  return label ? `[[${m[1]}|${label}]]` : `[[${m[1]}]]`
}

/** Aplica os ajustes do mundo ao FM DERIVADO (muta a cópia recebida). */
export function aplicarRegrasDoMundo(
  derivedFm: Record<string, unknown>,
  catalog: Catalog | null,
): void {
  const ca = contextoRegras().companheiroAnimal
  if (!ca || !ehFamiliaCa(derivedFm)) return

  if (ca.tamanho) {
    derivedFm['Tamanho'] = ca.tamanho
    const classe = derivedFm['Classe']
    if (typeof classe === 'string') derivedFm['Classe'] = aliasSemTamanho(classe)
  }

  if (ca.semArmasNaturais && catalog) {
    const acoes = derivedFm['Ataques'] as Record<string, unknown> | undefined
    const lista = acoes?.['Lista']
    if (Array.isArray(lista)) {
      acoes!['Lista'] = lista.filter((row) => {
        const alvo = wikiTarget(String(Object.keys(row as Record<string, unknown>)[0] ?? ''))
        if (!alvo) return true
        const res = catalog.resolve(alvo)
        if (res.kind !== 'doc') return true
        return catalog.entryById.get(res.id)?.grupo !== 'natural'
      })
    }
  }
}
