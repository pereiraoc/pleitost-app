// @vitest-environment node
// ESCUDO DO MESTRE (2026-10-02): em modo mestre a aba COMBATE troca rótulo,
// ícone e título — SEM aba nova (os ids de CHAR_TABS são fixos: nav-order,
// abaFichaVisivel, ?tab=). Jogador vê COMBATE como antes.
import { describe, expect, it } from 'vitest'
import {
  CHAR_TABS,
  NAV_ICON_PATHS,
  TITLES,
  charTabParaModo,
  tituloDaSecao,
} from '../src/components/layout/design-nav'
import { escudoAtivo } from '../src/components/mestre/escudo/escudo-gate'

describe('aba COMBATE em modo mestre', () => {
  it('charTabParaModo troca rótulo/ícone só da aba combate e só em modo mestre', () => {
    const combate = CHAR_TABS.find((t) => t.id === 'combate')!
    const perfil = CHAR_TABS.find((t) => t.id === 'perfil')!
    expect(charTabParaModo(combate, false)).toEqual(combate)
    const escudo = charTabParaModo(combate, true)
    expect(escudo.id).toBe('combate') // id NÃO muda (rotas/gates)
    expect(escudo.label).toBe('ESCUDO DO MESTRE')
    expect(escudo.iconId).toBe('escudo')
    expect(charTabParaModo(perfil, true)).toEqual(perfil)
  })
  it('ícone e título do escudo existem no registro', () => {
    expect(NAV_ICON_PATHS['escudo']).toContain('<path')
    expect(TITLES['escudo']).toBe('ESCUDO DO MESTRE')
    expect(TITLES['combate']).toBe('COMBATE')
  })
  it('tituloDaSecao: COMBATE pro jogador, ESCUDO DO MESTRE pro mestre; demais seções iguais', () => {
    expect(tituloDaSecao('combate', false)).toBe('COMBATE')
    expect(tituloDaSecao('combate', true)).toBe('ESCUDO DO MESTRE')
    expect(tituloDaSecao('perfil', true)).toBe('BIOGRAFIA')
    expect(tituloDaSecao(null, true)).toBe('')
  })
  it('CHAR_TABS continua com a aba `combate` (sem aba extra)', () => {
    expect(CHAR_TABS.filter((t) => t.id === 'combate').length).toBe(1)
    expect(CHAR_TABS.some((t) => t.id === 'escudo')).toBe(false)
  })
})

describe('escudoAtivo (gate)', () => {
  it('só em modo mestre e só na ficha de herói (monstro/CA mantêm o COMBATE próprio — #229 a)', () => {
    expect(escudoAtivo(true, 'Heroi')).toBe(true)
    expect(escudoAtivo(true, null)).toBe(true) // doc ainda carregando: rótulo já é o do escudo
    expect(escudoAtivo(true, 'Monstro')).toBe(false)
    expect(escudoAtivo(true, 'CompanheiroAnimal')).toBe(false)
    expect(escudoAtivo(false, 'Heroi')).toBe(false)
  })
})
