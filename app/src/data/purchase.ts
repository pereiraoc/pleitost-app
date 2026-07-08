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
import { buildTesouroAlias } from '../components/ficha/hero-model'
import type { Tier } from './commerce'

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
