// @vitest-environment node
// #310: ordem do painel esquerdo do herói pedida pelo usuário.
import { describe, expect, it } from 'vitest'
import { CHAR_TABS } from '../src/components/layout/design-nav'

describe('CHAR_TABS order (#310)', () => {
  it('Biografia, Competências, Inventário, Anotações, Grupo, Combate', () => {
    expect(CHAR_TABS.map((t) => t.id)).toEqual([
      'perfil', // Biografia
      'habilidades', // Competências
      'inventario', // Inventário
      'anotacoes', // Anotações
      'grupos', // Grupo
      'combate', // Combate
    ])
  })
})
