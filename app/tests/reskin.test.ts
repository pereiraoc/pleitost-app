// Reskin de display por mundo (#519): transformações puras aplicadas na
// borda de apresentação — identidade canônica (basenames/regras) nunca muda.
// Regras da cascata de termos: chave mais longa primeiro, fronteira de
// palavra unicode (senão "anima" pega "animal"), exceções protegidas.
import { afterEach, describe, expect, it } from 'vitest'
import {
  reskinName,
  reskinPericia,
  reskinText,
  setActiveContexto,
} from '../src/data/reskin'
import type { ContextoDef } from '../src/data/context-def'

function def(): ContextoDef {
  return {
    id: 'poa-1987',
    nome: 'Porto Alegre 1987',
    fonte: 'Contexto/Reskin/Contexto POA 1987.md',
    moeda: { simbolo: 'Cz$', nome: 'Cruzado' },
    atlas: { raiz: 'Atlas', mapa: null },
    pericias: { Arcana: 'Trônicos', Anima: 'Lênicos' },
    reskin: {
      notas: { 'Míssil Mágico': 'Dardo Teleguiado', 'Poção de Cura': 'Cicatrilênico' },
      notasFuturas: { Avatar: 'Catalisador' },
      termos: {
        'Magia Arcana Branca': 'Positrônica',
        'Magia Arcana': 'Trônica',
        'Sintonia': 'Tipagem',
        'Arcana': 'Trônica',
        'anima': 'lênica',
        'PO': 'Cz$',
      },
      excecoes: ['Corpo em Sintonia', 'Sintonia Profunda'],
    },
    disponibilidade: { padrao: 'disponivel', indisponiveis: [], restritos: {} },
    base: { sempreDisponiveis: [] },
  }
}

afterEach(() => setActiveContexto(null))

describe('reskinText — cascata de termos', () => {
  it('sem contexto ativo: identidade', () => {
    expect(reskinText('Magia Arcana')).toBe('Magia Arcana')
  })

  it('chave mais longa vence (Magia Arcana Branca antes de Magia Arcana)', () => {
    setActiveContexto(def())
    expect(reskinText('A Magia Arcana Branca cura; a Magia Arcana geral não.')).toBe(
      'A Positrônica cura; a Trônica geral não.',
    )
  })

  it('fronteira de palavra: "anima" não pega "animal" nem "Animal"', () => {
    setActiveContexto(def())
    expect(reskinText('o animal usa anima')).toBe('o animal usa lênica')
    expect(reskinText('Companheiro Animal')).toBe('Companheiro Animal')
  })

  it('exceções protegidas da cascata', () => {
    setActiveContexto(def())
    expect(reskinText('Corpo em Sintonia treina a Sintonia do corpo')).toBe(
      'Corpo em Sintonia treina a Tipagem do corpo',
    )
  })

  it('moeda: "60 PO" vira "60 Cz$", mas "POA 1987" fica intacto', () => {
    setActiveContexto(def())
    expect(reskinText('custa 60 PO em POA 1987')).toBe('custa 60 Cz$ em POA 1987')
  })

  it('menção em PROSA a nota renomeada também troca (notas ⊕ termos na cascata)', () => {
    setActiveContexto(def())
    expect(reskinText('Imune a Poção de Cura por 1 hora')).toBe('Imune a Cicatrilênico por 1 hora')
  })
})

describe('reskinName — nomes de nota', () => {
  it('mapa de notas vence (rename exato)', () => {
    setActiveContexto(def())
    expect(reskinName('Míssil Mágico')).toBe('Dardo Teleguiado')
    expect(reskinName('Avatar')).toBe('Catalisador') // notasFuturas também
  })

  it('fora do mapa: cai na cascata de termos', () => {
    setActiveContexto(def())
    expect(reskinName('Arma Arcana')).toBe('Arma Trônica')
    expect(reskinName('Espada Longa')).toBe('Espada Longa')
  })
})

describe('reskinPericia', () => {
  it('display próprio do mundo; demais mantêm', () => {
    setActiveContexto(def())
    expect(reskinPericia('Arcana')).toBe('Trônicos')
    expect(reskinPericia('Anima')).toBe('Lênicos')
    expect(reskinPericia('Atletismo')).toBe('Atletismo')
  })

  it('sem contexto: identidade', () => {
    expect(reskinPericia('Arcana')).toBe('Arcana')
  })
})
