// @vitest-environment node
// #303: o ícone supercharged de um wikilink vem do mapa EXTRAÍDO da config do
// Obsidian (supercharged-links + Style Settings), pela faceta do doc-alvo
// (grupo → subcategoria → categoria). Chaveado pelo VALOR EXATO da vault — o
// bug era a chave "compacta" que quebrava valores multi-palavra.
import { describe, expect, it } from 'vitest'
import { linkIconForEntry } from '../src/markdown/link-icon'
import { SC_CATEGORIA, SC_GRUPO, SC_SUBCATEGORIA } from '../src/markdown/supercharged-icons'
import type { IndexDocEntry } from '../src/data/types'

const entry = (e: Partial<IndexDocEntry>): IndexDocEntry =>
  ({ id: 'x', path: 'x', basename: 'X', type: null, subtype: null, grupo: null, kind: 'content', ...e }) as IndexDocEntry

describe('linkIconForEntry (#303) — mapa do Obsidian', () => {
  it('arma pelo grupo (cac-marcial → ⚔️)', () => {
    expect(linkIconForEntry(entry({ type: 'Item', subtype: 'Arma', grupo: 'cac-marcial' }))).toBe(
      SC_GRUPO['cac-marcial'],
    )
  })

  it('subcategoria multi-palavra volta a funcionar (Companheiro Animal → 🐾)', () => {
    // regressão: antes caía fora (chave "CompanheiroAnimal" ≠ "Companheiro Animal")
    expect(linkIconForEntry(entry({ type: 'Criatura', subtype: 'Companheiro Animal' }))).toBe('🐾')
    expect(linkIconForEntry(entry({ type: 'Criatura', subtype: 'Companheiro Animal' }))).toBe(
      SC_SUBCATEGORIA['Companheiro Animal'],
    )
  })

  it('subcategoria/categoria com acento (Tesouro, Heroi, Classe, Técnica)', () => {
    expect(linkIconForEntry(entry({ type: 'Item', subtype: 'Tesouro' }))).toBe(SC_SUBCATEGORIA['Tesouro'])
    expect(linkIconForEntry(entry({ type: 'Criatura', subtype: 'Heroi' }))).toBe(SC_SUBCATEGORIA['Heroi'])
    expect(linkIconForEntry(entry({ type: 'Classe', subtype: 'Marcialista' }))).toBe(SC_CATEGORIA['Classe'])
    expect(linkIconForEntry(entry({ type: 'Técnica' }))).toBe(SC_CATEGORIA['Técnica'])
  })

  it('categorias antes ausentes agora resolvem (Combate → 🥊, Grupo → 👥)', () => {
    expect(linkIconForEntry(entry({ type: 'Combate' }))).toBe(SC_CATEGORIA['Combate'])
    expect(linkIconForEntry(entry({ type: 'Grupo' }))).toBe(SC_CATEGORIA['Grupo'])
  })

  it('tipo sem correspondência no mapa → sem ícone', () => {
    expect(linkIconForEntry(entry({ type: 'Regra' }))).toBe('')
    expect(linkIconForEntry(undefined)).toBe('')
  })
})

describe('ícones que faltavam (report 2026-09-07) — semântica do CSS do Obsidian', () => {
  it('atributo casa SEM caixa: "Defesas-e-Resistências" (Vigor/Ímpeto/Defesa) → ♜', () => {
    expect(linkIconForEntry(entry({ type: 'Regra', subtype: 'Defesas-e-Resistências' }))).toBe('♜')
    expect(linkIconForEntry(entry({ type: 'Regra', subtype: 'defesas-e-resistências' }))).toBe('♜')
  })
  it('seletor por PATH: Percepção.md → 👁️, Intuição.md → 💡; Consumíveis (trecho) → 🧪 vence Tesouro', () => {
    expect(linkIconForEntry(entry({ type: 'Regra', subtype: 'Sentido', path: 'Sistema/Regras/Sentidos/Percepção.md' }))).toBe('👁️')
    expect(linkIconForEntry(entry({ type: 'Regra', subtype: 'Sentido', path: 'Sistema/Regras/Sentidos/Intuição.md' }))).toBe('💡')
    expect(
      linkIconForEntry(entry({ type: 'Item', subtype: 'Tesouro', path: 'Sistema/Equipamento/Tesouros/Consumíveis/Poção de Cura.md' })),
    ).toBe('🧪')
  })
  it('facetas custo/escola/elemento/sintonia do índice (Ações, Magias, Traços)', () => {
    expect(linkIconForEntry(entry({ type: 'Regra', subtype: 'Ação', custo: '1A' }))).toBe('1️⃣')
    expect(linkIconForEntry(entry({ type: 'Regra', subtype: 'Ação', custo: 'P' }))).toBe('🅿️')
    // cascata na ORDEM da config: escola Negra/Branca → elementos → escola Essencial/Especial
    expect(linkIconForEntry(entry({ type: 'Magia', subtype: 'Arcana', escola: 'Negra' }))).toBe('🔮')
    expect(linkIconForEntry(entry({ type: 'Magia', subtype: 'Anima', escola: 'Negra', elemento: 'Fogo' }))).toBe('🔥') // elemento vem depois de Negra
    expect(linkIconForEntry(entry({ type: 'Magia', subtype: 'Anima', escola: 'Essencial', elemento: 'Fogo' }))).toBe('☄️') // Essencial vem depois do elemento
    expect(linkIconForEntry(entry({ type: 'Sintonia', subtype: 'Traço-Elemental', sintonia: 'Vento' }))).toBe('🌪️')
  })
  it('locais da POA (Bairro/Cidade) e Pessoa — seletores adicionados à config da vault', () => {
    expect(linkIconForEntry(entry({ type: 'Localização', subtype: 'Bairro' }))).toBe('🏙️')
    expect(linkIconForEntry(entry({ type: 'Localização', subtype: 'Cidade' }))).toBe('🌆')
    expect(linkIconForEntry(entry({ type: 'Pessoa' }))).toBe('🧑')
  })
})
