// Cola app-side entre o vault-data e o compute do plugin: transforma docs de
// monstro (FM Tier/Modificador) + níveis de heróis em EncounterCombatant[].
// Espelha o papel do computeEncounterDifficultyForSession do pleitost-sync
// (core/encounter.ts:170): monstros = subcategoria "Monstro" multiplicados
// pelo qty; heróis viram combatentes por nível; entradas sem ficha (genéricas
// no bloco) NÃO pontuam lá — aqui o Criador de Combate permite genérico COM
// tier/modificador escolhidos pelo GM, que aí pontuam como monstro normal.
import type { VaultDoc } from '../data/types'
import type { EncounterRoster, EncounterRosterEntry } from '../data/session-repo/contract'
import {
  parseModificador,
  tierFromLevel,
  type EncounterCombatant,
  type MonsterModifier,
} from './encounter-compute'

/** Item do roster em edição no Criador. `sourceId` = id do doc no vault-data
 *  (null = monstro genérico sem ficha, com tier/modificador manuais). */
export interface RosterItem {
  sourceId: string | null
  /** Path da nota fonte (`doc.path`, com .md) — vira o sourcePath persistido
   *  no Encounter, mesmo formato que o sync grava (`src=Sistema/...md`). */
  sourcePath: string | null
  label: string
  qty: number
  tier: number
  modificador: MonsterModifier
}

/** RosterItem a partir de um doc de monstro do bestiário (FM real: Tier +
 *  Modificador via parseModificador). Doc que não é Monstro → null, mesma
 *  regra do sync (só subcategoria "Monstro" pontua). */
export function rosterItemFromDoc(doc: VaultDoc, qty: number): RosterItem | null {
  const fm = doc.frontmatter ?? {}
  if (String(fm.subcategoria ?? '').trim() !== 'Monstro') return null
  const tierRaw = Number(fm.Tier)
  return {
    sourceId: doc.id,
    sourcePath: doc.path,
    label: doc.basename,
    qty: Math.max(1, Math.floor(qty) || 1),
    tier: Number.isFinite(tierRaw) ? tierRaw : 0,
    modificador: parseModificador(fm as Record<string, unknown>),
  }
}

/** Combatentes de um roster montado + níveis dos heróis do grupo — o shape
 *  que computeEncounterDifficulty espera (compute.ts do autosheet). */
export function combatantsFrom(
  items: readonly RosterItem[],
  heroLevels: readonly number[],
): EncounterCombatant[] {
  const combatants: EncounterCombatant[] = []
  for (const nivel of heroLevels) {
    combatants.push({
      source: `heroi-nivel-${nivel}`,
      family: 'Heroi',
      subcategoria: 'Heroi',
      tier: tierFromLevel(nivel),
      nivel,
      modificador: null,
    })
  }
  for (const item of items) {
    for (let i = 0; i < item.qty; i++) {
      combatants.push({
        source: item.sourcePath ?? item.label,
        family: 'Monstro',
        subcategoria: 'Monstro',
        tier: item.tier,
        nivel: null,
        modificador: item.modificador,
      })
    }
  }
  return combatants
}

/** Roster do CONTRATO (session-repo) a partir dos itens em edição — o que o
 *  insertEncounter persiste (jsonb), mesmo shape que o sync grava. */
export function toContractRoster(items: readonly RosterItem[]): EncounterRoster {
  const entries: EncounterRosterEntry[] = items.map((item) => ({
    sourcePath: item.sourcePath,
    label: item.label,
    qty: item.qty,
  }))
  return { entries }
}

/** Níveis dos heróis a partir do input de texto ("5, 5, 4, 3"): números
 *  1..10 (clamp, floor); tokens não-numéricos são ignorados. */
export function parseHeroLevels(text: string): number[] {
  return String(text ?? '')
    .split(/[,;\s]+/)
    .map((tok) => Number(tok))
    .filter((n) => Number.isFinite(n) && n > 0)
    .map((n) => Math.min(10, Math.max(1, Math.floor(n))))
}
