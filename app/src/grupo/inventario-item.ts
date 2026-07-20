// #336: núcleo PURO do inventário do grupo — o VALOR (PO) de um item configurado
// e o mapeamento pra FM do herói ao PUXAR (transferência de loot). Reusa os
// builders/preços da ficha e do comércio (nada reinventado): TIER_PRICE_MULT,
// deriveArmaAtributo, tierCategoriaFm, buildTesouroAlias e as constantes de
// obra-prima. Sem estado nem React — testável sozinho.
import type { GroupInventoryItem } from '../data/session-repo/contract'
import type { Tier } from '../data/commerce'
import { TIER_PRICE_MULT } from '../data/commerce'
import {
  ARMA_OBRA_PRIMA,
  ARMADURA_OBRA_PRIMA,
  buildTesouroAlias,
  deriveArmaAtributo,
  escudoObraPrima,
  tierCategoriaFm,
  wikiTarget,
} from '../components/ficha/hero-model'

export const ARMA_OBRA_PRIMA_BASE = wikiTarget(ARMA_OBRA_PRIMA)

export const KIND_LABEL: Record<string, string> = {
  arma: 'Arma',
  armadura: 'Armadura',
  escudo: 'Escudo',
  tesouro: 'Tesouro',
  ouro: 'Ouro',
}

/** Item LEGADO (sem `kind`, formato #333) é tesouro. */
export function normalizeGroupItem(item: GroupInventoryItem): GroupInventoryItem {
  return (item as { kind?: string }).kind
    ? item
    : ({ ...(item as object), kind: 'tesouro' } as GroupInventoryItem)
}

const asTier = (t: string | undefined): Tier => (t === 'E' || t === 'M' ? t : 'A')
const tierMult = (t: string | undefined): number => TIER_PRICE_MULT[asTier(t)]

/** basename da obra-prima do escudo (Broquel vs Escudo). */
export function escudoObraPrimaBase(nome: string): string {
  return wikiTarget(escudoObraPrima(`[[${nome}]]`))
}

/** Propriedade da ARMA que dita o PREÇO: a imbuição escolhida OU a obra-prima
 *  automática quando há tier e nenhuma imbuição. '' = sem propriedade (valor 0,
 *  como a arma-base no cálculo de riqueza). */
export function armaPropriedadeBase(item: { propriedadeBase?: string; tier?: string }): string {
  if (item.propriedadeBase) return item.propriedadeBase
  return item.tier ? ARMA_OBRA_PRIMA_BASE : ''
}

/** Valor total em PO, espelhando o cálculo de riqueza (wealth.ts): arma/armadura/
 *  escudo = preço(propriedade/obra-prima) × mult(tier); tesouro = preço(doc) ×
 *  mult(tier); ouro = a própria quantidade. `priceOf(basename)` = preço-base
 *  (precoPO) do doc com esse basename. */
export function itemValorPO(
  item: GroupInventoryItem,
  priceOf: (basename: string) => number,
): number {
  const it = normalizeGroupItem(item)
  switch (it.kind) {
    case 'ouro':
      return Math.max(0, Math.floor(it.qtd) || 0)
    case 'arma': {
      const prop = armaPropriedadeBase(it)
      return prop ? priceOf(prop) * tierMult(it.tier) : 0
    }
    case 'armadura':
      return it.tier ? priceOf(wikiTarget(ARMADURA_OBRA_PRIMA)) * tierMult(it.tier) : 0
    case 'escudo':
      return it.tier ? priceOf(escudoObraPrimaBase(it.nome)) * tierMult(it.tier) : 0
    default: // tesouro
      return priceOf(it.nome) * tierMult(it.tier)
  }
}

interface FmWrite {
  path: string
  value: unknown
}

function inv(fm: Record<string, unknown>): Record<string, unknown> {
  return (fm['Inventario'] ?? {}) as Record<string, unknown>
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? [...v] : []
}
function obj(v: unknown): Record<string, unknown> {
  return (v && typeof v === 'object' ? { ...(v as object) } : {}) as Record<string, unknown>
}

/** Escritas de FM ao PUXAR o item pra ficha do herói (SEM cobrar ouro — é
 *  transferência). Arma → Armas.Lista; armadura/escudo → equipa no slot VAZIO,
 *  senão cai na bag (Tesouros) pra não sobrescrever a peça atual; tesouro →
 *  Tesouros; ouro → soma em Ouro. `atributos` = do herói que puxa (deriva o
 *  Atributo da arma). */
export function pullItemToFm(
  item: GroupInventoryItem,
  fm: Record<string, unknown>,
  atributos: Record<string, number>,
): FmWrite[] {
  const it = normalizeGroupItem(item)
  const I = inv(fm)

  if (it.kind === 'ouro') {
    const qtd = Math.max(0, Math.floor(it.qtd) || 0)
    return [{ path: 'Inventario.Ouro', value: (Number(I['Ouro']) || 0) + qtd }]
  }

  if (it.kind === 'arma') {
    const propBase = armaPropriedadeBase(it)
    const propriedade = !propBase
      ? ''
      : propBase === ARMA_OBRA_PRIMA_BASE
        ? ARMA_OBRA_PRIMA
        : `[[${propBase}]]`
    const armas = obj(I['Armas'])
    const lista = arr(armas['Lista'])
    lista.push({
      Nome: `[[${it.nome}]]`,
      Atributo: deriveArmaAtributo(it.grupo ?? null, it.propriedades, atributos),
      Bonus_Item: 0,
      Bonus_Especial: 0,
      Categoria: tierCategoriaFm((it.tier as '' | Tier) || ''),
      Propriedade: propriedade,
      Fonte: 'Grupo',
    })
    return [{ path: 'Inventario.Armas.Lista', value: lista }]
  }

  if (it.kind === 'armadura' || it.kind === 'escudo') {
    const slot = it.kind === 'armadura' ? 'Armadura' : 'Escudo'
    const atual = obj(I[slot])
    const ocupado = !!wikiTarget(String(atual['Nome'] ?? ''))
    if (!ocupado) {
      const row: Record<string, unknown> = {
        Nome: `[[${it.nome}]]`,
        Categoria: tierCategoriaFm((it.tier as '' | Tier) || ''),
        Propriedade: it.tier
          ? it.kind === 'armadura'
            ? ARMADURA_OBRA_PRIMA
            : escudoObraPrima(`[[${it.nome}]]`)
          : '',
      }
      if (it.kind === 'escudo') row.Dureza = Number(it.dureza) || 0
      return [{ path: `Inventario.${slot}`, value: row }]
    }
    // slot ocupado → vai pra bag como tesouro (não perde a peça atual)
    const tes = arr(I['Tesouros'])
    tes.push(buildTesouroAlias(it.nome, asTier(it.tier)))
    return [{ path: 'Inventario.Tesouros', value: tes }]
  }

  // tesouro / equipamento / implemento
  const tes = arr(I['Tesouros'])
  tes.push(buildTesouroAlias(it.nome, asTier(it.tier)))
  return [{ path: 'Inventario.Tesouros', value: tes }]
}
