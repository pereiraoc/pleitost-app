// @vitest-environment node
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import { parseRuleLine } from '../src/generated/rule-parser'

describe('probe: cadeia Nivel+Condicional+Escolha', () => {
  it('parseia com escopo composto', () => {
    const raw =
      'Nivel 2 Condicional Sintonia,[[Traço Elemental do Fogo]] Escolha_Habilidades "Essência Elemental Adepta" Complementar Habilidades.Lista Selecionar ([[Essência Explosiva Adepta]], [[Essência de Criação Adepta]])'
    const r = parseRuleLine(raw, 'Magias Anima')
    fs.writeFileSync('/tmp/probe-chain.json', JSON.stringify(r, null, 1))
    expect(r).toBeTruthy()
  })
})
