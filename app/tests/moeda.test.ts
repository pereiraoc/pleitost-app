// MOEDA DO MUNDO (2026-09-07): fantasia = PO puro ("40 PO", sem separador,
// como sempre); mundo com fator (POA: 1000) exibe "Cz$ 40.000" e converte de
// volta pra PO INTEIRO ao editar (nada fracionário — a ficha conta em milhares).
import { afterEach, describe, expect, it } from 'vitest'
import { setActiveContexto } from '../src/data/reskin'
import { deMoeda, formatMoeda, moedaNumero, paraMoeda } from '../src/data/moeda'
import type { ContextoDef } from '../src/data/context-def'

const def = (moeda: ContextoDef['moeda']): ContextoDef =>
  ({
    id: 'x', nome: 'X', fonte: '', moeda, atlas: { raiz: 'Atlas', mapa: null }, pericias: {},
    reskin: { notas: {}, notasFuturas: {}, termos: {}, excecoes: [] },
    disponibilidade: { padrao: 'disponivel', indisponiveis: [], restritos: {} },
    base: { sempreDisponiveis: [] },
  }) as ContextoDef

afterEach(() => setActiveContexto(null))

describe('moeda do mundo', () => {
  it('fantasia (sem contexto): PO puro, sem separador', () => {
    expect(formatMoeda(40)).toBe('40 PO')
    expect(formatMoeda(1000)).toBe('1000 PO')
    expect(paraMoeda(7)).toBe(7)
    expect(deMoeda(7)).toBe(7)
  })
  it('POA: fator 1000 → Cz$ com separador pt-BR; volta em PO inteiro', () => {
    setActiveContexto(def({ simbolo: 'Cz$', nome: 'Cruzado', fator: 1000 }))
    expect(formatMoeda(40)).toBe('Cz$ 40.000')
    expect(formatMoeda(10)).toBe('Cz$ 10.000')
    expect(moedaNumero(1)).toBe('1.000')
    expect(deMoeda(40000)).toBe(40)
    expect(deMoeda(7500)).toBe(8) // arredonda ao milhar — sem fração de PO
    expect(deMoeda(400)).toBe(0)
  })
  it('fator inválido/ausente vira 1', () => {
    setActiveContexto(def({ simbolo: 'Cz$', nome: 'Cruzado' }))
    expect(formatMoeda(40)).toBe('40 Cz$')
  })
})
