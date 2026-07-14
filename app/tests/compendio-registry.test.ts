// REGISTRO DE NAVEGAÇÃO DO COMPÊNDIO (#244) — a árvore lógica é a fonte de
// verdade; este teste trava o contrato da árvore (o que o usuário pediu AS-IS)
// e a consistência ícone/label.
import { describe, expect, it } from 'vitest'
import {
  NAV_CHILDREN,
  NAV_META,
  isNavNode,
  navChildren,
  navLabel,
  navMeta,
} from '../src/components/compendium/compendio-registry'

describe('compendio-registry (#244)', () => {
  it('home tem exatamente as 4 seções na ordem pedida', () => {
    expect(navChildren('')).toEqual(['Atlas', 'Campanhas', 'Contexto', 'Sistema'])
  })

  it('Campanhas → Aventuras, Combates', () => {
    expect(navChildren('Campanhas')).toEqual(['Campanhas/Aventuras', 'Campanhas/Combates'])
  })

  it('Contexto → Organizações, Histórias; Histórias → Atual, Histórico (sem Diários)', () => {
    expect(navChildren('Contexto')).toEqual(['Contexto/Organizações', 'Contexto/Histórias'])
    expect(navChildren('Contexto/Histórias')).toEqual([
      'Contexto/Histórias/Contexto Atual',
      'Contexto/Histórias/Contexto Histórico',
    ])
    // Diários NÃO está na árvore
    expect(navChildren('Contexto/Histórias')).not.toContain('Contexto/Histórias/Diários')
  })

  it('Sistema → Criação, Equipamento(rotulado Items), Regras; sem Criaturas', () => {
    expect(navChildren('Sistema')).toEqual([
      'Sistema/Criação de Personagem',
      'Sistema/Equipamento',
      'Sistema/Regras',
    ])
    expect(navChildren('Sistema')).not.toContain('Sistema/Criaturas')
    expect(navLabel('Sistema/Equipamento')).toBe('Items')
  })

  it('folhas não são nós de navegação', () => {
    expect(isNavNode('Atlas')).toBe(false)
    expect(isNavNode('Campanhas/Aventuras')).toBe(false)
    expect(isNavNode('Sistema/Regras')).toBe(false)
    expect(isNavNode('Campanhas')).toBe(true)
    expect(isNavNode('')).toBe(true)
  })

  it('todo path citado como filho tem meta (ícone) no registro', () => {
    const filhos = new Set(Object.values(NAV_CHILDREN).flat())
    for (const p of filhos) {
      expect(navMeta(p)?.icon, `ícone de ${p}`).toBeTruthy()
    }
  })

  it('navLabel usa o basename da pasta quando não há override', () => {
    expect(navLabel('Campanhas/Aventuras')).toBe('Aventuras')
    expect(navLabel('Contexto/Organizações')).toBe('Organizações')
    // sanity: NAV_META cobre exatamente os paths da árvore
    expect(Object.keys(NAV_META).sort()).toEqual([...new Set(Object.values(NAV_CHILDREN).flat())].sort())
  })
})
