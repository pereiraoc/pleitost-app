// @vitest-environment node
// ESCUDO DO MESTRE (pedido 2026-10-08): embaixo do nome de cada combatente da
// iniciativa vai a CLASSE + Tier (monstro, ex.: "Soldado Competente · Tier 1")
// ou + Nível (herói/companheiro, ex.: "Pirata Pugilista · Nível 2").
import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCharacterSummary } from '../src/data/session-repo/publish'
import { subtituloCombatente } from '../src/data/session-repo/combatente'
import type { CharacterSummary } from '../src/data/session-repo/contract'
import { setActiveContexto } from '../src/data/reskin'
import type { ContextoDef } from '../src/data/context-def'
import type { VaultDoc } from '../src/data/types'

const vd = path.join(path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url)))), 'vault-data')
const doc = (rel: string) => JSON.parse(fs.readFileSync(path.join(vd, rel + '.json'), 'utf8')) as VaultDoc

const base: CharacterSummary = {
  nome: 'X',
  family: 'Heroi',
  nivel: 0,
  atributos: { FOR: 0, AGI: 0, INT: 0, PRE: 0 },
  vitalidadeMax: 10,
  stats: { defesa: 0, vigor: 0, evasao: 0, impeto: 0, movimento: 0, percepcao: 0, intuicao: 0 },
}

afterEach(() => setActiveContexto(null))

describe('summary leva o Tier do monstro', () => {
  it('Guarda (Soldado Competente, Tier 1)', () => {
    const s = buildCharacterSummary(doc('Sistema/Criaturas/Bestiário/Guarda'))
    expect(s.classe).toBe('Soldado Competente')
    expect(s.tier).toBe(1)
    expect(subtituloCombatente(s)).toBe('Soldado Competente · Tier 1')
  })
  it('Tier 0 também aparece (Goblin Batedor)', () => {
    const s = buildCharacterSummary(doc('Sistema/Criaturas/Bestiário/Goblin Batedor'))
    expect(subtituloCombatente(s)).toBe('Batedor · Tier 0')
  })
  it('herói: classe (rótulo do link) · Nível', () => {
    const s = buildCharacterSummary(doc('Sistema/Criaturas/Heróis/Carlos Facão de Andradas'))
    expect(s.tier).toBeUndefined()
    expect(subtituloCombatente(s)).toBe('Menestrel Inspirador de Luta Artística · Nível 7')
  })
})

describe('subtituloCombatente', () => {
  it('herói com classe e nível', () => {
    expect(subtituloCombatente({ ...base, classe: 'Pirata Pugilista', nivel: 2 })).toBe('Pirata Pugilista · Nível 2')
  })
  it('sem classe: vazio; sem nível: só a classe', () => {
    expect(subtituloCombatente({ ...base, nivel: 3 })).toBe('')
    expect(subtituloCombatente({ ...base, classe: 'Canino', family: 'CompanheiroAnimal' })).toBe('Canino')
  })
  it('monstro publicado antes do Tier no summary: cai no Tier do fmBlob', () => {
    expect(subtituloCombatente({ ...base, family: 'Monstro', classe: 'Soldado Competente' }, { Tier: 2 })).toBe(
      'Soldado Competente · Tier 2',
    )
  })
  it('nome da classe no mundo ativo (reskin)', () => {
    setActiveContexto({
      id: 'cyberpunk',
      nome: 'POA',
      reskin: { notas: { 'Pirata Pugilista': 'Estivador Brigão' }, notasFuturas: {}, termos: {}, excecoes: [] },
    } as unknown as ContextoDef)
    expect(subtituloCombatente({ ...base, classe: 'Pirata Pugilista', nivel: 2 })).toBe('Estivador Brigão · Nível 2')
  })
})
