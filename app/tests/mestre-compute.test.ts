// Trilha C do plano-mestre (#194/#195) — a LÓGICA portada do plugin bate com
// o compute do autosheet: fixtures copiadas de
// pleitost-autosheet/tests/unit/runtime/encounter/compute.test.ts + casos
// derivados dos thresholds pra rosters REAIS da vault em níveis 1/5/10, e o
// parser de blocos combat-marker (pleitost-sync/core/encounter.ts) sobre as
// notas de aventura reais do vault-data.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  computeEncounterDifficulty,
  computeEncounterDifficultyByLevel,
  parseModificador,
  type EncounterCombatant,
} from '../src/mestre/encounter-compute'
import { parseCombatMarkerBlocks, parseRosterLine } from '../src/mestre/combat-marker'
import { combatantsFrom, parseHeroLevels, rosterItemFromDoc } from '../src/mestre/roster'
import { expectedWealthForLevel } from '../src/grupo/wealth'
import type { VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const readDoc = (id: string): VaultDoc =>
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8')) as VaultDoc

// mesmos helpers do compute.test.ts do plugin
const monstro = (
  tier: number,
  modificador: EncounterCombatant['modificador'] = null,
): EncounterCombatant => ({
  source: `path/M${tier}`,
  family: 'Criatura',
  subcategoria: 'Monstro',
  tier,
  nivel: null,
  modificador,
})

const heroi = (nivel: number): EncounterCombatant => ({
  source: `path/H${nivel}`,
  family: 'Heroi',
  subcategoria: 'Heroi',
  tier: null,
  nivel,
  modificador: null,
})

// ──────────────────────────────────────────────────────────────────────────
// Fixtures VERBATIM do plugin (compute.test.ts) — paridade do port
// ──────────────────────────────────────────────────────────────────────────

describe('computeEncounterDifficulty (paridade com o autosheet)', () => {
  it('encounter vazio → ratio 0, TRIVIAL', () => {
    const result = computeEncounterDifficulty([])
    expect(result.monsterTotal).toBe(0)
    expect(result.playerTotal).toBe(0)
    expect(result.ratio).toBe(0)
    expect(result.label).toBe('TRIVIAL')
  })

  it('só monstros (sem heróis) → ratio Infinity → LETAL', () => {
    const result = computeEncounterDifficulty([monstro(1), monstro(2)])
    expect(result.playerTotal).toBe(0)
    expect(result.ratio).toBe(Number.POSITIVE_INFINITY)
    expect(result.label).toBe('LETAL')
  })

  it('4 heróis nível 5 vs 1 monstro tier 2 → 25/108 → TRIVIAL', () => {
    const result = computeEncounterDifficulty([heroi(5), heroi(5), heroi(5), heroi(5), monstro(2)])
    expect(result.monsterTotal).toBe(25)
    expect(result.playerTotal).toBe(108)
    expect(result.label).toBe('TRIVIAL')
  })

  it('4 heróis nível 5 vs Solo tier 3 → 120/108 ≈ 111% → LETAL', () => {
    const result = computeEncounterDifficulty([
      heroi(5), heroi(5), heroi(5), heroi(5),
      monstro(3, 'Solo'),
    ])
    expect(result.monsterTotal).toBe(120)
    expect(result.playerTotal).toBe(108)
    expect(result.label).toBe('LETAL')
  })

  it('ignora combatentes com subcategoria desconhecida; Jogador ≡ Heroi', () => {
    const npc: EncounterCombatant = {
      source: 'path/NPC', family: 'Criatura', subcategoria: 'NPC',
      tier: 1, nivel: null, modificador: null,
    }
    const jogador: EncounterCombatant = {
      source: 'path/J', family: 'Heroi', subcategoria: 'Jogador',
      tier: null, nivel: 5, modificador: null,
    }
    const result = computeEncounterDifficulty([jogador, npc])
    expect(result.monsterTotal).toBe(0)
    expect(result.playerTotal).toBe(27)
  })
})

describe('computeEncounterDifficultyByLevel — tabela 1-10', () => {
  it('retorna 10 entries (level 1..10), cada uma com tier', () => {
    const result = computeEncounterDifficultyByLevel([monstro(2)])
    expect(result).toHaveLength(10)
    expect(result.map((r) => r.level)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(result[0].tier).toBe(1)
    expect(result[3].tier).toBe(2)
    expect(result[9].tier).toBe(4)
  })

  it('monstro tier 2 Normal (25 pts): nível 1 (4×10=40) → FÁCIL (62.5%)', () => {
    const result = computeEncounterDifficultyByLevel([monstro(2)])
    expect(result[0].label).toBe('FÁCIL')
  })

  it('encounter vazio: todos níveis → TRIVIAL', () => {
    const result = computeEncounterDifficultyByLevel([])
    expect(result.every((r) => r.label === 'TRIVIAL')).toBe(true)
  })
})

// ──────────────────────────────────────────────────────────────────────────
// Rosters REAIS da vault em níveis 1/5/10 (derivados dos thresholds)
// ──────────────────────────────────────────────────────────────────────────

describe('rosters do bestiário real em níveis 1/5/10', () => {
  // Emboscada de Goblins: 3× Goblin Soldado (T1=10) + 1× Goblin Piromante
  // (T1=10) = 40 pts de monstro.
  const emboscada = [
    ...Array.from({ length: 3 }, () =>
      rosterItemFromDoc(readDoc('Sistema/Criaturas/Bestiário/Goblin Soldado'), 1)!,
    ),
    rosterItemFromDoc(readDoc('Sistema/Criaturas/Bestiário/Goblin Piromante'), 1)!,
  ]

  it('FM real resolve tier/modificador (Goblin Soldado T1 Normal, Guarda T1 Competente)', () => {
    const soldado = rosterItemFromDoc(readDoc('Sistema/Criaturas/Bestiário/Goblin Soldado'), 2)
    expect(soldado).toMatchObject({ tier: 1, modificador: null, qty: 2 })
    const guarda = readDoc('Sistema/Criaturas/Bestiário/Guarda')
    expect(parseModificador(guarda.frontmatter)).toBe('Competente')
    expect(rosterItemFromDoc(guarda, 1)).toMatchObject({ tier: 1, modificador: 'Competente' })
  })

  it('nível 1: 40 monstros vs 4×10 heróis = 100% → DIFICIL', () => {
    const r = computeEncounterDifficulty(combatantsFrom(emboscada, [1, 1, 1, 1]))
    expect(r.monsterTotal).toBe(40)
    expect(r.playerTotal).toBe(40)
    expect(r.ratio).toBe(100)
    expect(r.label).toBe('DIFICIL')
  })

  it('nível 5: 40 vs 4×27=108 ≈ 37% → TRIVIAL', () => {
    const r = computeEncounterDifficulty(combatantsFrom(emboscada, [5, 5, 5, 5]))
    expect(r.playerTotal).toBe(108)
    expect(r.label).toBe('TRIVIAL')
  })

  it('nível 10: 40 vs 4×52=208 ≈ 19% → TRIVIAL', () => {
    const r = computeEncounterDifficulty(combatantsFrom(emboscada, [10, 10, 10, 10]))
    expect(r.playerTotal).toBe(208)
    expect(r.label).toBe('TRIVIAL')
  })

  it('2× Guarda Oficial (T2 Competente = 28 cada): 56 pts → LETAL/FÁCIL/TRIVIAL em 1/5/10', () => {
    const oficial = rosterItemFromDoc(readDoc('Sistema/Criaturas/Bestiário/Guarda Oficial'), 2)!
    expect(oficial).toMatchObject({ tier: 2, modificador: 'Competente' })
    const byLevel = computeEncounterDifficultyByLevel(combatantsFrom([oficial], []))
    expect(byLevel[0].monsterTotal).toBe(56)
    expect(byLevel[0].label).toBe('LETAL') // 56/40 = 140%
    expect(byLevel[4].label).toBe('FÁCIL') // 56/108 ≈ 51.9%
    expect(byLevel[9].label).toBe('TRIVIAL') // 56/208 ≈ 26.9%
  })
})

// ──────────────────────────────────────────────────────────────────────────
// parseCombatMarkerBlocks sobre notas reais da vault
// ──────────────────────────────────────────────────────────────────────────

describe('parseCombatMarkerBlocks (notas de aventura do vault-data)', () => {
  it('Emboscada de Goblins (Exemplo Sync): 1 bloco → roster 3×Soldado + 1×Piromante', () => {
    const doc = readDoc('Campanhas/Aventuras/Emboscada de Goblins (Exemplo Sync)')
    const result = parseCombatMarkerBlocks(doc.body)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.roster.entries).toEqual([
      { sourcePath: 'Goblin Soldado', label: 'Goblin Soldado', qty: 3 },
      { sourcePath: 'Goblin Piromante', label: 'Goblin Piromante', qty: 1 },
    ])
  })

  it('variante combat-marker-small também parseia (Três Arqueiros Verdes)', () => {
    const doc = readDoc('Campanhas/Combates/Três Arqueiros Verdes')
    const result = parseCombatMarkerBlocks(doc.body)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.roster.entries).toEqual([
      { sourcePath: 'Orc Arqueiro', label: 'Orc Arqueiro', qty: 3 },
    ])
  })

  it('nota sem bloco → no-block; 2+ blocos → multiple-blocks (regra MVP do sync)', () => {
    expect(parseCombatMarkerBlocks('# Nada aqui')).toEqual({
      ok: false, reason: 'no-block', blockCount: 0,
    })
    const dois = '```combat-marker\n- [[A]]\n```\n\n```combat-marker\n- [[B]]\n```\n'
    expect(parseCombatMarkerBlocks(dois)).toEqual({
      ok: false, reason: 'multiple-blocks', blockCount: 2,
    })
  })

  it('parseRosterLine: qty, alias, genérico e iniciativas (paridade parse-roster.ts)', () => {
    expect(parseRosterLine('- 3 [[Goblin]] 15, 13, 10')).toEqual({
      quantity: 3, target: '[[Goblin]]', initiatives: [15, 13, 10],
    })
    expect(parseRosterLine('- [[Goblin|G1]]')).toEqual({
      quantity: 1, target: '[[Goblin|G1]]', initiatives: [],
    })
    expect(parseRosterLine('- 2 Goblin Lider 12.5')).toEqual({
      quantity: 2, target: 'Goblin Lider', initiatives: [12.5],
    })
  })
})

// ──────────────────────────────────────────────────────────────────────────
// #194 — recompensa esperada (REUSA wealth.ts, espelho do economy-table)
// ──────────────────────────────────────────────────────────────────────────

describe('recompensa esperada por nível (expectedWealthForLevel)', () => {
  it('níveis 1/5/10 batem com ECONOMY_WEALTH_DATA do plugin', () => {
    expect(expectedWealthForLevel(1)).toBe(10)
    expect(expectedWealthForLevel(5)).toBe(400)
    expect(expectedWealthForLevel(10)).toBe(4800)
    expect(expectedWealthForLevel(11)).toBe(5700) // post10
  })

  it('delta entre níveis (o que a aventura deve render): 4→5 = 225 PO', () => {
    expect(expectedWealthForLevel(5) - expectedWealthForLevel(4)).toBe(225)
  })
})

describe('parseHeroLevels (input do Criador)', () => {
  it('aceita vírgula/espaço, clampa em 10 e ignora lixo/não-positivos', () => {
    expect(parseHeroLevels('5, 5, 4  3')).toEqual([5, 5, 4, 3])
    expect(parseHeroLevels('0, 12, abc, 7')).toEqual([10, 7])
    expect(parseHeroLevels('')).toEqual([])
  })
})
