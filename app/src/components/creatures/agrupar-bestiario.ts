// AGRUPAMENTO DO BESTIÁRIO (pedido do mestre, 2026-09-12): "na aba de
// Criatura/Bestiário, a capacidade de ver agrupado por Tier, Afiliação,
// Classe". O tier segue sendo o padrão; os outros dois respondem "quem é da
// Gradiente?" e "quantos Brutos eu tenho?" sem varrer a lista.
//
// Puro (só dados) pra ficar testável sem montar a página.
import type { IndexDocEntry, VaultDoc } from '../../data/types'
import { reskinName } from '../../data/reskin'

export type CriterioBestiario = 'tier' | 'afiliacao' | 'classe'

export const CRITERIOS: { id: CriterioBestiario; label: string }[] = [
  { id: 'tier', label: 'TIER' },
  { id: 'afiliacao', label: 'AFILIAÇÃO' },
  { id: 'classe', label: 'CLASSE' },
]

/** Rótulo do balde de quem não declara afiliação (bicho avulso, gente solta). */
export const SEM_AFILIACAO = 'Sem afiliação'

export const ptAlpha = new Intl.Collator('pt')

/** ALVO do wikilink (não o alias): `[[Soldado|Soldado Competente]]` → "Soldado",
 *  pra o Competente e o comum caírem no mesmo balde de classe. */
function alvoDoWikilink(v: unknown): string {
  const texto = typeof v === 'string' ? v : ''
  const m = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/.exec(texto)
  return (m ? m[1]! : texto).trim()
}

/** Chave de agrupamento no vocabulário do mundo; '' = sem valor declarado. */
export function chaveDoCriterio(
  doc: VaultDoc | undefined,
  criterio: CriterioBestiario,
): string {
  const fm = doc?.frontmatter ?? {}
  const bruto = alvoDoWikilink(criterio === 'afiliacao' ? fm['Afiliação'] : fm['Classe'])
  return bruto ? reskinName(bruto) : ''
}

/** Tier do monstro — FM `Tier`, a MESMA fonte do badge "TIER n" do card;
 *  null quando a criatura não declara. */
export function tierDoDoc(doc: VaultDoc | undefined): number | null {
  const raw = Number(doc?.frontmatter?.['Tier'])
  return Number.isFinite(raw) ? raw : null
}

/** Ordem canônica de tier (pedido do mestre, 2026-09-12): CRESCENTE — 0, 1,
 *  2, 3 — com quem não declara Tier no fim. Fonte única: vale pra ordem dos
 *  GRUPOS de tier e pra ordem das criaturas DENTRO de Afiliação/Classe.
 *  (Inverte o #380, que pedia 3→0; o pedido novo manda.) */
export function comparaTier(a: number | null, b: number | null): number {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  return a - b
}

/** Ordem das criaturas dentro de um grupo: tier primeiro, alfabético (pt) só
 *  no empate. */
export function comparaCriaturas(
  docs: Map<string, VaultDoc>,
  a: IndexDocEntry,
  b: IndexDocEntry,
): number {
  return (
    comparaTier(tierDoDoc(docs.get(a.id)), tierDoDoc(docs.get(b.id))) ||
    ptAlpha.compare(a.basename ?? a.id, b.basename ?? b.id)
  )
}

/** Grupos por FM `Tier` (#380) na ordem canônica; rótulo é o número, e sem
 *  Tier vira "—". A COR não sai daqui — quem renderiza aplica a do registro
 *  (monsterTierColor, espelho do header-monstro.ts do plugin). */
export function gruposPorTier(
  entries: readonly IndexDocEntry[],
  docs: Map<string, VaultDoc>,
): { tier: number | null; letter: string; entries: IndexDocEntry[] }[] {
  const porTier = new Map<number | null, IndexDocEntry[]>()
  for (const entry of entries) {
    const tier = tierDoDoc(docs.get(entry.id))
    porTier.set(tier, [...(porTier.get(tier) ?? []), entry])
  }
  return [...porTier.keys()].sort(comparaTier).map((tier) => ({
    tier,
    letter: tier === null ? '—' : String(tier),
    entries: porTier
      .get(tier)!
      .slice()
      .sort((a, b) => comparaCriaturas(docs, a, b)),
  }))
}

/** Grupos por Afiliação/Classe: alfabéticos, e o balde vazio por último. As
 *  criaturas dentro de cada um saem por TIER (pedido do mestre, 2026-09-12) —
 *  o mestre monta o encontro pelo que a facção tem de mais fraco pra cima. */
export function gruposPorChave(
  entries: readonly IndexDocEntry[],
  docs: Map<string, VaultDoc>,
  criterio: CriterioBestiario,
): { letter: string; color?: string; entries: IndexDocEntry[] }[] {
  const porChave = new Map<string, IndexDocEntry[]>()
  for (const entry of entries) {
    const chave = chaveDoCriterio(docs.get(entry.id), criterio)
    porChave.set(chave, [...(porChave.get(chave) ?? []), entry])
  }
  return [...porChave.keys()]
    .sort((a, b) => (a === '' ? 1 : b === '' ? -1 : ptAlpha.compare(a, b)))
    .map((chave) => ({
      letter: chave || SEM_AFILIACAO,
      entries: porChave
        .get(chave)!
        .slice()
        .sort((a, b) => comparaCriaturas(docs, a, b)),
    }))
}
