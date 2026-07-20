// COMÉRCIO — motor de disponibilidade (issues #91/#92). Lógica PURA nova:
// tabela de ENCOMENDA (nota real), classificação típico/incomum/básico +
// modificadores, quantidade de ESTOQUE (mesma % por unidade, teto 100%, até 4)
// e disponibilidade de POÇÕES por dados (regra própria do mestre). RNG injetado.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_ENCOMENDA_MATRIX,
  parseDisponibilidadeEncomenda,
  parseDisponibilidadePronta,
  parseBasicos,
  TESOUROS_BASICOS,
  RARIDADE_MULT,
  raridadeTesouro,
  comboMult,
  rollStock,
  rollDice,
  POCAO_DICE,
  rollPocaoStock,
} from '../src/data/commerce'
import type { VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const readDoc = (id: string): VaultDoc =>
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8')) as VaultDoc
const nota = readDoc('Contexto/Histórias/Contexto Atual/Disponibilidade de Tesouros')

/** RNG determinístico: percorre valores em [0,1) e trava no último. */
function seq(...values: number[]): () => number {
  let i = 0
  return () => values[Math.min(i++, values.length - 1)] ?? 0
}

describe('tabela Disponibilidade por Encomenda (nota real)', () => {
  it('parseia o body real na matriz exata da 2ª tabela', () => {
    const m = parseDisponibilidadeEncomenda(nota.body)
    expect(m).not.toBeNull()
    expect(m!['Pequena Cidade']).toEqual({ A: 100, E: null, M: null })
    expect(m!['Grande Cidade']).toEqual({ A: 100, E: 50, M: null })
    expect(m!['Capital']).toEqual({ A: 150, E: 100, M: 10 })
    expect(m!['Iluminada']).toEqual({ A: 200, E: 100, M: 25 })
  })

  it('DEFAULT_ENCOMENDA_MATRIX espelha o parse da nota', () => {
    expect(parseDisponibilidadeEncomenda(nota.body)).toEqual(DEFAULT_ENCOMENDA_MATRIX)
  })

  it('as duas seções são parseadas independentemente (Pronta ≠ Encomenda)', () => {
    const pronta = parseDisponibilidadePronta(nota.body)
    const encomenda = parseDisponibilidadeEncomenda(nota.body)
    expect(pronta!['Capital'].A).toBe(100)
    expect(encomenda!['Capital'].A).toBe(150)
  })
})

describe('classificação típico/incomum/básico + modificadores', () => {
  it('parseBasicos lê a lista da nota real — e o espelho TESOUROS_BASICOS bate', () => {
    const daNota = parseBasicos(nota.body)
    expect(daNota).toEqual([
      'Anel do Equilíbrio',
      'Luva do Arcanista',
      'Bracelete Elemental',
      'Arma Obra-prima',
      'Armadura Obra-prima',
      'Ferramenta Obra-prima',
    ])
    // O default vivo (espelho) é exatamente o que a nota lista.
    expect([...TESOUROS_BASICOS]).toEqual(daNota)
  })

  it('raridadeTesouro: básico×típico, básico×incomum, típico, incomum', () => {
    expect(raridadeTesouro('Bracelete Elemental', true)).toBe('basico-tipico')
    expect(raridadeTesouro('Bracelete Elemental', false)).toBe('basico-incomum')
    expect(raridadeTesouro('Anel Canário', true)).toBe('tipico')
    expect(raridadeTesouro('Anel Canário', false)).toBe('incomum')
  })

  it('RARIDADE_MULT: ×1 / ×2 / ×½ / ×¼ (tabela de modificadores)', () => {
    expect(RARIDADE_MULT['tipico']).toBe(1)
    expect(RARIDADE_MULT['basico-tipico']).toBe(2)
    expect(RARIDADE_MULT['basico-incomum']).toBe(0.5)
    expect(RARIDADE_MULT['incomum']).toBe(0.25)
  })

  it('comboMult arma×imbuição: ×1 / ×½ / ×¼ / ×⅛', () => {
    expect(comboMult(true, true)).toBe(1) // arma típica + imbuição típica
    expect(comboMult(false, true)).toBe(0.5) // arma incomum + imbuição típica
    expect(comboMult(true, false)).toBe(0.25) // arma típica + imbuição incomum
    expect(comboMult(false, false)).toBe(0.125) // ambas incomuns
  })
})

describe('rollStock — mesma % por unidade, teto 100%, até 4', () => {
  it('null/0% → 0', () => {
    expect(rollStock(null, () => 0)).toBe(0)
    expect(rollStock(0, () => 0)).toBe(0)
  })
  it('≥100% enche até o máximo (4)', () => {
    expect(rollStock(100, () => 0.99)).toBe(4)
    expect(rollStock(200, () => 0.99)).toBe(4) // básico ×2 = 200% → teto 100/unid → 4
  })
  it('50%: unidades sequenciais, para na 1ª falha', () => {
    expect(rollStock(50, seq(0.4, 0.4, 0.6))).toBe(2) // sai, sai, falha
    expect(rollStock(50, seq(0.6))).toBe(0) // falha logo de cara
    expect(rollStock(50, seq(0.4, 0.4, 0.4, 0.4))).toBe(4) // teto 4
  })
  it('respeita um máximo customizado', () => {
    expect(rollStock(100, () => 0, 2)).toBe(2)
  })
})

describe('rollDice — expressão NdX±C com piso 0 (poções)', () => {
  it('0dX-C → 0 (indisponível)', () => {
    expect(rollDice('0d4-5', () => 0.99)).toBe(0)
    expect(rollDice('0d4-3', () => 0.99)).toBe(0)
  })
  it('2d10-1: mínimo e máximo', () => {
    expect(rollDice('2d10-1', () => 0)).toBe(1) // (1+1)-1
    expect(rollDice('2d10-1', () => 0.95)).toBe(19) // (10+10)-1
  })
  it('1d6-2', () => {
    expect(rollDice('1d6-2', () => 0.95)).toBe(4) // 6-2
    expect(rollDice('1d6-2', () => 0)).toBe(0) // 1-2 = -1 → piso 0
  })
})

describe('rollPocaoStock — dados por local×tier (regra própria)', () => {
  it('tabela de dados por cidade e tier', () => {
    expect(POCAO_DICE['Capital'].A).toBe('2d10-1')
    expect(POCAO_DICE['Pequena Cidade'].M).toBe('0d4-5')
    expect(POCAO_DICE['Iluminada'].A).toBe('3d10-1')
  })
  it('Capital Adepto usa 2d10-1', () => {
    expect(rollPocaoStock('Capital', 'A', () => 0)).toBe(1)
    expect(rollPocaoStock('Capital', 'A', () => 0.95)).toBe(19)
  })
  it('Pequena Cidade Mestre nunca tem poção (0d4-5)', () => {
    expect(rollPocaoStock('Pequena Cidade', 'M', () => 0.99)).toBe(0)
  })
})
