// SLOTS DE MAGIA POR ESCOLA (2026-10-25): o slot é da escola, no mesmo molde
// da proficiência (`Definir Magias.Lista.Anima.Proficiencia A`):
//  - `Magias.Lista.Anima.Slots.<R>` → só ESSÊNCIA (Círculo das Essências);
//  - `Magias.Lista.ArcanaEssencial.Slots.<R>` → só Magia Arcana Essencial
//    (Truque Mágico, Utensílio Mágico, Princípios Arcanos, Prática Avançada);
//  - `Magias.Slots.<R>` → pool ARCANA (Branca/Negra/Essencial conforme a
//    proficiência) — nunca Anima.
// Rank U (Essência Universal, 2026-10-29): `Magias.Lista.Anima.Slots.U` é o
// slot que só compra essência UNIVERSAL (Criação/Destruição); só existe na
// Anima, e o slot A comum não compra universal (rules/roda-essencias.ts).
// Secundária: os mesmos caminhos sob `Magias.Secundaria.`. O gasto segue
// `Slot.<R>` na lista; o POOL sai do que foi comprado (`poolDoGasto`), e a
// Essencial que não cabe no pool dela transborda pro Arcana ("as Essenciais
// contam como magias da sua escola" do Arcanista).
import type { Catalog } from '../data/catalog'
import { fmPath, listaEntries, wikiTarget } from '../components/ficha/hero-model'
import { ehEssencia, ehMenor } from './essencia-slots'
import { MAGIA_ESCOLA_NOME } from './projection'

export type PoolMagia = 'arcana' | 'anima' | 'essencial'
export type RankMagia = 'B' | 'A' | 'E' | 'M' | 'U'
export type Ranks = Record<RankMagia, number>

export const POOLS_MAGIA: PoolMagia[] = ['arcana', 'anima', 'essencial']
const RANKS: RankMagia[] = ['B', 'A', 'E', 'M', 'U']
const zero = (): Ranks => ({ B: 0, A: 0, E: 0, M: 0, U: 0 })
const num = (v: unknown) => (typeof v === 'number' ? v : Number(v)) || 0

/** Escola (chave do calc) de cada pool que mora numa escola. */
const ESCOLA_DO_POOL: Partial<Record<PoolMagia, string>> = { anima: 'Anima', essencial: 'ArcanaEssencial' }

/** Prefixo do caminho do slot de um pool (sem o rank). */
export function caminhoSlots(pool: PoolMagia, sec: boolean): string {
  const base = sec ? 'Magias.Secundaria' : 'Magias'
  const escola = ESCOLA_DO_POOL[pool]
  return escola ? `${base}.Lista.${escola}.Slots` : `${base}.Slots`
}

/** Totais de cada pool. Arcana vem do FM derivado (o saldo salvo das fichas
 *  antigas vale quando o calc não tem a chave); Anima e Essencial vêm do calc
 *  (a Essencial é escola OCULTA — nunca vira linha no FM). */
export function slotsPorPool(
  derivedFm: Record<string, unknown>,
  calculated: Record<string, unknown> | undefined,
  sec: boolean,
): Record<PoolMagia, Ranks> {
  const out = { arcana: zero(), anima: zero(), essencial: zero() }
  const arc = (fmPath(derivedFm, ...(sec ? ['Magias', 'Secundaria', 'Slots'] : ['Magias', 'Slots'])) ?? {}) as Record<
    string,
    unknown
  >
  for (const r of RANKS) {
    out.arcana[r] = r === 'U' ? 0 : num(arc[r])
    out.anima[r] = num(calculated?.[`${caminhoSlots('anima', sec)}.${r}`])
    out.essencial[r] = num(calculated?.[`${caminhoSlots('essencial', sec)}.${r}`])
  }
  return out
}

/** Pools que podem pagar uma magia/essência, em ordem de preferência. */
export function poolsDoGasto(alvo: string, escola: string | null, ehEssencial: (nome: string) => boolean): PoolMagia[] {
  alvo = wikiTarget(alvo) || alvo
  if (escola === null) return ehEssencia(alvo) ? ['anima'] : ['arcana']
  if (escola === MAGIA_ESCOLA_NOME.Anima) return ['anima']
  if (ehEssencial(alvo)) return ['essencial', 'arcana']
  return ['arcana']
}

/** Nome de exibição da escola oculta das Essenciais (Planejamento/catálogo;
 *  bate com a pasta `/Magia Arcana Essencial/`). */
export const ESCOLA_ESSENCIAL = 'Arcana Essencial'

/** Pools que uma ESCOLA do catálogo pode usar pra aprender magia avulsa. */
export function poolsDaEscola(escola: string): PoolMagia[] {
  if (escola === MAGIA_ESCOLA_NOME.Anima) return ['anima']
  if (escola === 'ArcanaEssencial' || escola === ESCOLA_ESSENCIAL) return ['essencial', 'arcana']
  return ['arcana']
}

/** Gastos `Slot.<R>` de um escopo: magias de todas as escolas (menos
 *  Tesouros) + essências de Habilidades.Lista (Menor = secundária). */
export function gastosDeSlot(
  fm: Record<string, unknown>,
  sec: boolean,
): Array<{ alvo: string; escola: string | null; rank: RankMagia }> {
  const out: Array<{ alvo: string; escola: string | null; rank: RankMagia }> = []
  const escolas = (fmPath(fm, ...(sec ? ['Magias', 'Secundaria', 'Lista'] : ['Magias', 'Lista'])) ?? []) as Array<
    Record<string, unknown>
  >
  for (const esc of Array.isArray(escolas) ? escolas : []) {
    const nome = String(esc['Nome'] ?? '')
    if (nome === 'Tesouros') continue
    for (const e of listaEntries(esc['Lista'])) {
      const r = e.fonte.kind === 'Slot' ? e.fonte.target : ''
      if (r === 'B' || r === 'A' || r === 'E' || r === 'M') out.push({ alvo: e.target, escola: nome, rank: r })
    }
  }
  for (const e of listaEntries(fmPath(fm, 'Habilidades', 'Lista'))) {
    const r = e.fonte.kind === 'Slot' ? e.fonte.target : ''
    if (!ehEssencia(e.target) || ehMenor(e.target) !== sec) continue
    if (r === 'A' || r === 'E' || r === 'M' || r === 'U') out.push({ alvo: e.target, escola: null, rank: r })
  }
  return out
}

/** Slots usados por pool: cada gasto ocupa o primeiro pool da preferência com
 *  vaga; sem vaga em nenhum, fica no último (estoura ali — contador vermelho). */
export function usadosPorPool(
  fm: Record<string, unknown>,
  sec: boolean,
  totais: Record<PoolMagia, Ranks>,
  ehEssencial: (nome: string) => boolean,
): Record<PoolMagia, Ranks> {
  const usados = { arcana: zero(), anima: zero(), essencial: zero() }
  // os de pool ÚNICO primeiro: a Essencial só transborda pro Arcana depois
  // que as Arcanas de verdade pegaram as vagas delas
  const gastos = gastosDeSlot(fm, sec).map((g) => ({ ...g, pools: poolsDoGasto(g.alvo, g.escola, ehEssencial) }))
  gastos.sort((a, b) => a.pools.length - b.pools.length)
  for (const g of gastos) {
    const pool = g.pools.find((p) => usados[p][g.rank] < totais[p][g.rank]) ?? g.pools[g.pools.length - 1]!
    usados[pool][g.rank]++
  }
  return usados
}

/** Predicado "é Magia Arcana Essencial" a partir do id do doc no catálogo. */
export function essencialPorId(resolveId: (nome: string) => string | null): (nome: string) => boolean {
  return (nome: string) => /\/Magia Arcana Essencial\//.test(resolveId(nome) ?? '')
}

/** O mesmo, resolvendo pelo catálogo do mundo. */
export function ehEssencialDoCatalogo(catalog: Catalog): (nome: string) => boolean {
  return essencialPorId((nome) => {
    const r = catalog.resolve(wikiTarget(nome) || nome)
    return r.kind === 'doc' ? r.id : null
  })
}
