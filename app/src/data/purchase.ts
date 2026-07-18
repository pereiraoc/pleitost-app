// COMPRA na loja (issue #72) — debita o Ouro do herói e adiciona o tesouro ao
// Inventario.Tesouros, escrevendo pela MESMA API de store que as abas usam:
//   - herói LOCAL  → setLocalEntityFm (o FM local É a fonte de verdade);
//   - herói da VAULT → writeHeroEdit no overlay 'fm' (canal imediato), lendo o
//     FM mergeado (extraído + overlay) para computar o novo valor — espelha o
//     `set` do useHeroModel sem depender do hook (a loja escolhe o herói fora
//     da ficha).
// O alias do tesouro no inventário é o MESMO formato do plugin/InventarioTab
// (buildTesouroAlias: `[[Nome|Nome (Adepto)]]`). Sem tocar em rules/* nem nas
// abas — só a API pública de escrita.
import type { VaultDoc } from './types'
import { getHeroEdits, writeHeroEdit, applyFmEdits, getAtPath } from './hero-store'
import { getLocalDoc, isLocalId, setLocalEntityFm } from './local-entities'
import {
  ARMA_OBRA_PRIMA,
  buildTesouroAlias,
  deriveArmaAtributo,
  heroAtributos,
  tierCategoriaFm,
  wikiTarget,
} from '../components/ficha/hero-model'
import type { Tier } from './commerce'

const ARMA_OBRA_PRIMA_BASE = wikiTarget(ARMA_OBRA_PRIMA)

/** FM salvo corrente de um herói (local: FM da entidade; vault: extraído +
 *  overlay), a partir do doc extraído passado (vault) — para o local o doc é
 *  ignorado e vale o store. */
function currentFm(heroId: string, vaultDoc: VaultDoc | undefined): Record<string, unknown> {
  if (isLocalId(heroId)) {
    return (getLocalDoc(heroId)?.frontmatter ?? {}) as Record<string, unknown>
  }
  const base = (vaultDoc?.frontmatter ?? {}) as Record<string, unknown>
  return applyFmEdits(base, getHeroEdits(heroId).fm)
}

function ouroDe(fm: Record<string, unknown>): number {
  const inv = (fm['Inventario'] ?? {}) as Record<string, unknown>
  return Number(inv['Ouro']) || 0
}

function tesourosDe(fm: Record<string, unknown>): unknown[] {
  const inv = (fm['Inventario'] ?? {}) as Record<string, unknown>
  return Array.isArray(inv['Tesouros']) ? [...(inv['Tesouros'] as unknown[])] : []
}

function armasListaDe(fm: Record<string, unknown>): unknown[] {
  const inv = (fm['Inventario'] ?? {}) as Record<string, unknown>
  const armas = (inv['Armas'] ?? {}) as Record<string, unknown>
  return Array.isArray(armas['Lista']) ? [...(armas['Lista'] as unknown[])] : []
}

/** Grava um path do FM do herói pela API de store correta (local vs vault). */
function writeHero(
  heroId: string,
  vaultDoc: VaultDoc | undefined,
  path: string,
  value: unknown,
): void {
  if (isLocalId(heroId)) {
    setLocalEntityFm(heroId, path, value)
    return
  }
  const base = (vaultDoc?.frontmatter ?? {}) as Record<string, unknown>
  const merged = applyFmEdits(base, getHeroEdits(heroId).fm)
  writeHeroEdit(heroId, 'fm', path, value, {
    channel: 'imediato',
    origem: 'comercio',
    valorAntigo: getAtPath(merged, path),
  })
}

export interface PurchaseResult {
  ok: boolean
  /** Motivo da falha (ouro insuficiente). */
  reason?: 'ouro-insuficiente'
  ouroRestante: number
}

/** Debita `preco` de Ouro e adiciona `nome (tier)` a Inventario.Tesouros do
 *  herói. Falha (sem escrever) se o ouro corrente for menor que o preço.
 *  Retorna o ouro restante. */
export function buyTreasure(
  heroId: string,
  vaultDoc: VaultDoc | undefined,
  nome: string,
  tier: Tier,
  preco: number,
): PurchaseResult {
  const fm = currentFm(heroId, vaultDoc)
  const ouro = ouroDe(fm)
  if (ouro < preco) return { ok: false, reason: 'ouro-insuficiente', ouroRestante: ouro }

  const novoOuro = ouro - preco
  writeHero(heroId, vaultDoc, 'Inventario.Ouro', novoOuro)

  const tesouros = tesourosDe(fm)
  tesouros.push(buildTesouroAlias(nome, tier))
  writeHero(heroId, vaultDoc, 'Inventario.Tesouros', tesouros)

  return { ok: true, ouroRestante: novoOuro }
}

/** Ouro corrente de um herói (para o seletor mostrar o saldo). */
export function heroOuro(heroId: string, vaultDoc: VaultDoc | undefined): number {
  return ouroDe(currentFm(heroId, vaultDoc))
}

/** Compra de COMBO arma×imbuição (ou arma obra-prima) no comércio — o item é
 *  uma ARMA, então vai pra Inventario.Armas.Lista, não pros Tesouros (#299).
 *  `propriedadeBase` é o basename da imbuição OU 'Arma Obra-prima'. */
export interface WeaponPurchase {
  /** Basename da arma-base → `Nome: [[X]]`. */
  armaBasename: string
  /** Grupo da arma (index/FM) — deriva o Atributo. */
  grupo?: string | string[] | null
  /** `propriedades` do doc da arma (string inline v1 ou array v2) — deriva o
   *  Atributo. `deriveArmaAtributo` já normaliza (aceita `unknown`). */
  propriedades: unknown
  /** Tier comprado → Categoria (link do tier). */
  tier: Tier
  /** Basename da imbuição/qualidade aplicada (vazio = arma-base sem imbuição). */
  propriedadeBase?: string
}

/** Monta a LINHA de arma (Inventario.Armas.Lista) de uma compra de combo, com o
 *  MESMO shape do addArma da ficha (apply-armas-edit.ts): Nome wikilink +
 *  Atributo derivado + Categoria do tier + Propriedade (imbuição ou obra-prima).
 *  Puro: recebe os atributos do herói prontos. */
export function buildPurchasedWeaponRow(
  w: WeaponPurchase,
  atributos: Record<string, number>,
): Record<string, unknown> {
  const base = w.propriedadeBase ?? ''
  const propriedade = !base ? '' : base === ARMA_OBRA_PRIMA_BASE ? ARMA_OBRA_PRIMA : `[[${base}]]`
  return {
    Nome: `[[${w.armaBasename}]]`,
    Atributo: deriveArmaAtributo(w.grupo, w.propriedades, atributos),
    Bonus_Item: 0,
    Bonus_Especial: 0,
    Categoria: tierCategoriaFm(w.tier),
    Propriedade: propriedade,
    Fonte: 'Comércio',
  }
}

/** Debita `preco` de Ouro e adiciona a arma comprada a Inventario.Armas.Lista
 *  (não aos Tesouros). Falha (sem escrever) se o ouro for menor que o preço. */
export function buyWeapon(
  heroId: string,
  vaultDoc: VaultDoc | undefined,
  weapon: WeaponPurchase,
  preco: number,
): PurchaseResult {
  const fm = currentFm(heroId, vaultDoc)
  const ouro = ouroDe(fm)
  if (ouro < preco) return { ok: false, reason: 'ouro-insuficiente', ouroRestante: ouro }

  const novoOuro = ouro - preco
  writeHero(heroId, vaultDoc, 'Inventario.Ouro', novoOuro)

  const lista = armasListaDe(fm)
  lista.push(buildPurchasedWeaponRow(weapon, heroAtributos(fm).values))
  writeHero(heroId, vaultDoc, 'Inventario.Armas.Lista', lista)

  return { ok: true, ouroRestante: novoOuro }
}
