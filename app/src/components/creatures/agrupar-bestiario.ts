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

/** Grupos por Afiliação/Classe: alfabéticos, e o balde vazio por último. */
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
        .sort((a, b) => ptAlpha.compare(a.basename ?? a.id, b.basename ?? b.id)),
    }))
}
