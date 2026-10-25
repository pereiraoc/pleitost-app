// IMPLEMENTOS MÁGICOS com FOCO (vault 2026-10-21, "Focos as Imbuição"): o
// implemento fundamental (Luva do Arcanista, Bracelete Elemental, Broche
// Artístico) é feito em A/E/M e pode vir com um FOCO trabalhado nele na
// fabricação — como arma com imbuição. Na ficha vira uma LINHA própria em
// `Inventario.Implementos` (mesmo shape da arma):
//   { Nome: "[[Broche Artístico]]", Propriedade: "[[Foco da Repetição]]",
//     Categoria: "[[Mestre]]", Fonte: "Comércio" }
// O motor de regras carrega as DUAS notas no tier da linha (bônus do
// implemento + cargas/dreno do foco). Leitores que só conhecem
// `Inventario.Tesouros` (cargas, descanso, riqueza, papel) recebem cada linha
// como um alias de tesouro que aponta pro FOCO (é o foco que tem cargas e o
// preço do foco já inclui o implemento) — `tesourosComImplementos`.
import { fmPath, str, tierCategoriaFm, wikiTarget } from '../components/ficha/hero-model'
import { linkLabel } from '../markdown/dataview-value'

export type TierAEM = 'A' | 'E' | 'M'

const TIER_DE_CATEGORIA: Record<string, TierAEM> = { Adepto: 'A', Adepta: 'A', Experiente: 'E', Mestre: 'M' }
const TIER_NOME: Record<TierAEM, string> = { A: 'Adepto', E: 'Experiente', M: 'Mestre' }

export interface ImplementoLinha {
  /** Basename do implemento fundamental. */
  nome: string
  /** Basename do foco (null = implemento sem foco). */
  foco: string | null
  tier: TierAEM | null
  fonte: string
}

/** "Foco da Repetição" → "da Repetição" (o adjetivo do combo). */
export function focoAdjetivo(foco: string): string {
  return foco.replace(/^Foco\s+/i, '').trim()
}

/** Rótulo do implemento: "Broche Artístico da Repetição" (sem tier). */
export function rotuloImplemento(nome: string, foco: string | null): string {
  return foco ? `${nome} ${focoAdjetivo(foco)}` : nome
}

/** Linhas de `Inventario.Implementos` do FM. */
export function implementosDe(fm: Record<string, unknown>): ImplementoLinha[] {
  const rows = fmPath(fm, 'Inventario', 'Implementos')
  if (!Array.isArray(rows)) return []
  return rows
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
    .map((r) => ({
      nome: wikiTarget(str(r['Nome'])),
      foco: wikiTarget(str(r['Propriedade'])) || null,
      tier: TIER_DE_CATEGORIA[linkLabel(str(r['Categoria']))] ?? null,
      fonte: str(r['Fonte']),
    }))
    .filter((l) => l.nome !== '')
}

/** Linha de FM de um implemento comprado (mesmo shape da arma com imbuição). */
export function linhaImplemento(nome: string, foco: string | null, tier: TierAEM, fonte = 'Comércio'): Record<string, unknown> {
  return {
    Nome: `[[${nome}]]`,
    Propriedade: foco ? `[[${foco}]]` : '',
    Categoria: tierCategoriaFm(tier),
    Fonte: fonte,
  }
}

/** Alias de TESOURO equivalente à linha: aponta pro FOCO (ou pro implemento
 *  sem foco) com o rótulo do combo e o tier — "[[Foco da Repetição|Broche
 *  Artístico da Repetição (Mestre)]]". */
export function aliasDoImplemento(l: ImplementoLinha): string {
  const alvo = l.foco ?? l.nome
  const rot = rotuloImplemento(l.nome, l.foco)
  return l.tier ? `[[${alvo}|${rot} (${TIER_NOME[l.tier]})]]` : `[[${alvo}|${rot}]]`
}

/** `Inventario.Tesouros` + um alias por implemento — pros leitores que tratam
 *  tesouros (cargas, descanso, riqueza, papel, escudo do mestre). */
export function tesourosComImplementos(fm: Record<string, unknown>): unknown[] {
  const tes = (fmPath(fm, 'Inventario', 'Tesouros') as unknown[] | undefined) ?? []
  return [...(Array.isArray(tes) ? tes : []), ...implementosDe(fm).map(aliasDoImplemento)]
}
