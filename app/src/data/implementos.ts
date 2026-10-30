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
import { fmPath, parseItemAlias, str, tierCategoriaFm, wikiTarget } from '../components/ficha/hero-model'
import { linkLabel } from '../markdown/dataview-value'
import type { Catalog } from './catalog'

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

/** Rótulo do implemento: "Broche Artístico da Repetição" (sem tier). Foco
 *  ainda SEM implemento (ficha antiga migrada) → o nome do foco. */
export function rotuloImplemento(nome: string, foco: string | null): string {
  if (!nome) return foco ?? ''
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
    // nome vazio + foco = foco ainda sem implemento (migração de ficha antiga)
    .filter((l) => l.nome !== '' || l.foco !== null)
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

/** Tipo do tesouro pela PASTA do catálogo (mesma convenção da loja,
 *  commerce-candidates): `Implementos/Fundamentais/` ou `Implementos/Focos/`. */
export type TipoImplemento = 'fundamental' | 'foco'
export const tipoImplementoPeloId = (id: string): TipoImplemento | null =>
  /\/Implementos\/Fundamentais\//.test(id) ? 'fundamental' : /\/Implementos\/Focos\//.test(id) ? 'foco' : null

/** MIGRAÇÃO (fichas de antes de "Focos as Imbuição", 2026-10-21): foco só
 *  existe TRABALHADO num implemento fundamental do mesmo tier, e o preço do
 *  foco já inclui o implemento. Tesouro que é implemento vira linha de
 *  `Inventario.Implementos`:
 *   - fundamental solto → linha sem foco;
 *   - foco solto + fundamental SEM foco do mesmo tier → o foco é trabalhado
 *     nele (Broche A + Foco da Intensificação A → Broche Artístico da
 *     Intensificação), sem reembolso;
 *   - foco que sobra → linha com `Nome` vazio ("foco sem implemento"): o
 *     jogador escolhe o fundamental na ficha (sem custo).
 *  Idempotente; devolve o MESMO objeto quando não há o que migrar. */
export function migrarFocosSoltos(
  fm: Record<string, unknown>,
  tipoDe: (basename: string) => TipoImplemento | null,
): Record<string, unknown> {
  const tes = fmPath(fm, 'Inventario', 'Tesouros')
  if (!Array.isArray(tes)) return fm
  const ficam: unknown[] = []
  const fundamentais: { nome: string; tier: TierAEM }[] = []
  const focos: { foco: string; tier: TierAEM }[] = []
  for (const raw of tes) {
    const base = wikiTarget(str(raw)).split('/').pop() ?? ''
    const tipo = base ? tipoDe(base) : null
    if (!tipo) {
      ficam.push(raw)
      continue
    }
    const tier = parseItemAlias(raw).tier ?? 'A'
    if (tipo === 'fundamental') fundamentais.push({ nome: base, tier })
    else focos.push({ foco: base, tier })
  }
  if (fundamentais.length === 0 && focos.length === 0) return fm
  const atuais = fmPath(fm, 'Inventario', 'Implementos')
  const linhas: Record<string, unknown>[] = Array.isArray(atuais) ? [...(atuais as Record<string, unknown>[])] : []
  const novas = fundamentais.map((f) => ({ ...f, foco: null as string | null }))
  for (const { foco, tier } of focos) {
    const livreNova = novas.find((f) => f.foco === null && f.tier === tier)
    if (livreNova) {
      livreNova.foco = foco
      continue
    }
    // implemento sem foco que JÁ estava em Implementos (comprado sem foco)
    const j = linhas.findIndex((r) => {
      const l = implementosDe({ Inventario: { Implementos: [r] } })[0]
      return !!l && l.nome !== '' && l.foco === null && l.tier === tier
    })
    if (j >= 0) {
      linhas[j] = { ...linhas[j], Propriedade: `[[${foco}]]` }
      continue
    }
    novas.push({ nome: '', foco, tier })
  }
  for (const n of novas) linhas.push(n.nome ? linhaImplemento(n.nome, n.foco, n.tier, 'Manual') : { ...linhaImplemento('', n.foco, n.tier, 'Manual'), Nome: '' })
  const inv = (fm['Inventario'] ?? {}) as Record<string, unknown>
  return { ...fm, Inventario: { ...inv, Tesouros: ficam, Implementos: linhas } }
}

/** `migrarFocosSoltos` com o tipo lido do catálogo (pasta da nota). */
export function migrarFocosDoCatalogo(
  fm: Record<string, unknown>,
  catalog: Pick<Catalog, 'resolve'> | null | undefined,
): Record<string, unknown> {
  if (!catalog) return fm
  return migrarFocosSoltos(fm, (base) => {
    const r = catalog.resolve(base)
    return r.kind === 'doc' ? tipoImplementoPeloId(r.id) : null
  })
}
