// @vitest-environment node
// #297: trocar a magia da "Estilo de Combate (Arte Mágica)" do Bardo não fazia
// nada — o pick ia pro fallback Habilidades.Lista. A escrita correta é na
// estrutura ANINHADA por escola de Magias.Lista: remove o pick antigo e adiciona
// o novo no grupo de escola destino (sem duplicar, preservando os Slots).
import { describe, expect, it } from 'vitest'
import { placeMagiaChoicePick } from '../src/rules/projection'

// Grupos de escola como no FM do Érico (Arcana Negra com o pick atual + Slots).
function grupos() {
  return [
    {
      Nome: 'Arcana Negra',
      Proficiencia: 'A',
      Lista: [
        { '[[Palavras Cortantes]]': 'Regra.[[Estilo de Combate (Arte Mágica)]]' },
        { '[[Míssil Mágico]]': 'Slot.A' },
      ],
    },
    { Nome: 'Arcana Branca', Proficiencia: 'N', Lista: [] },
    { Nome: 'Anima', Proficiencia: 'N', Lista: [] },
  ]
}

const keys = (g: Record<string, unknown>) =>
  (g.Lista as Array<Record<string, unknown>>).map((r) => Object.keys(r)[0])

describe('placeMagiaChoicePick (#297)', () => {
  it('troca o pick: remove o antigo, adiciona o novo no grupo destino, preserva Slots', () => {
    const out = placeMagiaChoicePick(
      grupos(),
      'Palavras Cortantes',
      'Ruído Estridente',
      'Arcana Negra',
      'Escolha.[[Estilo de Combate (Arte Mágica)]]',
    )
    const negra = out.find((g) => g.Nome === 'Arcana Negra')!
    expect(keys(negra)).toContain('[[Ruído Estridente]]') // novo entrou
    expect(keys(negra)).not.toContain('[[Palavras Cortantes]]') // antigo saiu
    expect(keys(negra)).toContain('[[Míssil Mágico]]') // Slot preservado
    // sem duplicata do novo
    expect(keys(negra).filter((k) => k === '[[Ruído Estridente]]').length).toBe(1)
  })

  it('remove o pick antigo de QUALQUER grupo e coloca no destino (troca de escola)', () => {
    const out = placeMagiaChoicePick(
      grupos(),
      'Palavras Cortantes',
      'Ruído Estridente',
      'Arcana Branca', // destino diferente do grupo onde estava o antigo
      'Escolha.[[X]]',
    )
    expect(keys(out.find((g) => g.Nome === 'Arcana Negra')!)).not.toContain('[[Palavras Cortantes]]')
    expect(keys(out.find((g) => g.Nome === 'Arcana Branca')!)).toContain('[[Ruído Estridente]]')
  })

  it('idempotente: se o novo já está presente, não duplica', () => {
    const g = grupos()
    ;(g[0]!.Lista as Array<Record<string, unknown>>).push({ '[[Ruído Estridente]]': 'Slot.A' })
    const out = placeMagiaChoicePick(g, 'Palavras Cortantes', 'Ruído Estridente', 'Arcana Negra', 'Escolha.[[X]]')
    const negra = out.find((x) => x.Nome === 'Arcana Negra')!
    expect(keys(negra).filter((k) => k === '[[Ruído Estridente]]').length).toBe(1)
  })
})
