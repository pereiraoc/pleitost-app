// FILTRO DO BESTIÁRIO (pedido do mestre, 2026-09-13): filtrar por tier,
// modificador, classe e afiliação. Com 130 criaturas, agrupar já não basta —
// o mestre monta encontro perguntando "o que a Gradiente tem de tier 2 que não
// seja comum?", e isso é cruzamento, não agrupamento.
//
// Puro (só dados) pra ficar testável sem montar a página, como o
// `agrupar-bestiario` ao lado. As duas regras: dentro de uma dimensão vale
// QUALQUER UMA das marcadas (OU), entre dimensões valem TODAS (E) — e dimensão
// sem nada marcado não filtra nada.
import type { IndexDocEntry, VaultDoc } from '../../data/types'
import { chavesDoCriterio, ptAlpha, SEM_AFILIACAO, tierDoDoc } from './agrupar-bestiario'

export interface FiltroBestiario {
  tiers: number[]
  modificadores: string[]
  classes: string[]
  afiliacoes: string[]
}

export const FILTRO_VAZIO: FiltroBestiario = {
  tiers: [], modificadores: [], classes: [], afiliacoes: [],
}

/** Os quatro degraus, na escada do bestiário. "Comum" não é um valor escrito no
 *  frontmatter: é a AUSÊNCIA de `Modificador`, e o mestre quer poder pedir só
 *  esses — daí ele entrar na lista como os outros três. A ordem é a mesma de
 *  `ORDEM_MODIFICADOR` (comum < Competente < Elite < Solo). */
export const MODIFICADORES = ['Comum', 'Competente', 'Elite', 'Solo'] as const
const CONHECIDOS = new Set<string>(MODIFICADORES)

/** Degrau da criatura. Valor que a vault não conhece não vira opção nova — cai
 *  em Comum, a mesma política de `postoModificador`. */
export function modificadorDoDoc(doc: VaultDoc | undefined): string {
  const v = doc?.frontmatter?.['Modificador']
  const nome = typeof v === 'string' ? v.trim() : ''
  return CONHECIDOS.has(nome) && nome !== 'Comum' ? nome : 'Comum'
}

/** Afiliações da criatura no vocabulário do mundo; quem não declara cai no
 *  balde, que é opção de filtro como qualquer organização. */
function afiliacoesDoDoc(doc: VaultDoc | undefined): string[] {
  const nomes = chavesDoCriterio(doc, 'afiliacao')
  return nomes.length ? nomes : [SEM_AFILIACAO]
}

/** As opções vêm dos DADOS carregados, nunca de uma lista escrita à mão: papel
 *  novo, organização nova ou tier novo aparecem sozinhos no painel. */
export function opcoesDeFiltro(
  entries: readonly IndexDocEntry[],
  docs: Map<string, VaultDoc> | undefined,
): { tiers: number[]; modificadores: string[]; classes: string[]; afiliacoes: string[] } {
  const tiers = new Set<number>()
  const modificadores = new Set<string>()
  const classes = new Set<string>()
  const afiliacoes = new Set<string>()
  for (const entry of entries) {
    const doc = docs?.get(entry.id)
    const tier = tierDoDoc(doc)
    if (tier !== null) tiers.add(tier)
    modificadores.add(modificadorDoDoc(doc))
    for (const c of chavesDoCriterio(doc, 'classe')) classes.add(c)
    for (const a of afiliacoesDoDoc(doc)) afiliacoes.add(a)
  }
  return {
    tiers: [...tiers].sort((a, b) => a - b),
    // a escada, não a ordem de descoberta
    modificadores: MODIFICADORES.filter((m) => modificadores.has(m)),
    classes: [...classes].sort(ptAlpha.compare),
    // o balde por último, como nos grupos
    afiliacoes: [...afiliacoes]
      .sort((a, b) => (a === SEM_AFILIACAO ? 1 : b === SEM_AFILIACAO ? -1 : ptAlpha.compare(a, b))),
  }
}

const casa = (marcadas: readonly string[], tem: readonly string[]) =>
  marcadas.length === 0 || tem.some((x) => marcadas.includes(x))

export function aplicaFiltro(
  entries: readonly IndexDocEntry[],
  docs: Map<string, VaultDoc> | undefined,
  filtro: FiltroBestiario,
): IndexDocEntry[] {
  if (contaFiltrosAtivos(filtro) === 0) return [...entries]
  return entries.filter((entry) => {
    const doc = docs?.get(entry.id)
    const tier = tierDoDoc(doc)
    return (
      (filtro.tiers.length === 0 || (tier !== null && filtro.tiers.includes(tier))) &&
      casa(filtro.modificadores, [modificadorDoDoc(doc)]) &&
      casa(filtro.classes, chavesDoCriterio(doc, 'classe')) &&
      casa(filtro.afiliacoes, afiliacoesDoDoc(doc))
    )
  })
}

/** Quantas opções estão marcadas ao todo — é o número que o botão mostra, pra
 *  o filtro fechado não esconder que está filtrando. */
export function contaFiltrosAtivos(filtro: FiltroBestiario): number {
  return (
    filtro.tiers.length + filtro.modificadores.length +
    filtro.classes.length + filtro.afiliacoes.length
  )
}
