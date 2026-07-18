// @vitest-environment node
// #304: filtros de propriedade de arma no compêndio. Os tokens vêm do FM
// `propriedades`: Força mantém o valor (FOR 1/2 = filtros distintos), Arremesso
// colapsa (o alcance não filtra), as demais usam o rótulo cru.
import { describe, expect, it } from 'vitest'
import { weaponPropTokens, isForcaToken, itemFacet } from '../src/components/compendium/item-taxonomy'
import type { VaultDoc } from '../src/data/types'

const arma = (propriedades: string[], grupo = 'cac-simples'): VaultDoc =>
  ({
    id: 'Sistema/Equipamento/Armas/x',
    path: 'Sistema/Equipamento/Armas/x.md',
    basename: 'X',
    type: 'Item',
    subtype: 'Arma',
    frontmatter: { grupo, propriedades },
    body: '',
    inlineFields: {},
    ruleElements: [],
  }) as unknown as VaultDoc

describe('weaponPropTokens (#304)', () => {
  it('Força mantém o valor; Arremesso colapsa; demais cruas; dedup', () => {
    const tokens = weaponPropTokens(
      arma(['[[Força X|Força 2]]', '[[Arremesso|Arremesso 5]]', '[[Precisa]]', '[[Arremesso|Arremesso 20]]']),
    )
    expect(tokens).toContain('Força 2')
    expect(tokens).toContain('Precisa')
    expect(tokens).toContain('Arremesso')
    expect(tokens.filter((t) => t === 'Arremesso').length).toBe(1) // colapsou + dedup
    expect(tokens).not.toContain('Arremesso 5')
  })

  it('isForcaToken separa o eixo FORÇA', () => {
    expect(isForcaToken('Força 1')).toBe(true)
    expect(isForcaToken('Força 2')).toBe(true)
    expect(isForcaToken('Precisa')).toBe(false)
    expect(isForcaToken('Arremesso')).toBe(false)
  })

  it('itemFacet expõe propriedades só pra armas', () => {
    expect(itemFacet(arma(['[[Precisa]]'])).propriedades).toEqual(['Precisa'])
  })
})
