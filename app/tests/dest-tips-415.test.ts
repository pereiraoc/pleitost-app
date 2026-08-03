// @vitest-environment node
// Report #415 ("ficha de grupo em perícias tá aparecendo errado a tooltip …
// bônus de item em sobrevivência … Thoren +0 e a Mera errado também"): os
// tooltips do painel DESTAQUES vinham ESTÁTICOS do snapshot do design
// (grupo-tips.js, chaves dest:fN sequenciais) — mostravam o breakdown de quem
// estava na tela quando o design foi capturado, não o membro real. Mesma
// classe do #384 (riqueza): agora o ent DINÂMICO é construído dos dados reais
// (topTwoForSkill/magiaHighlights carregam as partes; destTipModificador monta
// o markup verbatim do design com os números vivos).
import { describe, expect, it } from 'vitest'
import { magiaHighlights, topTwoForSkill } from '../src/grupo/destaques'
import { destTipModificador } from '../src/grupo/dest-tips'
import type { IndexDocEntry, VaultDoc } from '../src/data/types'

const member = (id: string): IndexDocEntry => ({ id, path: id, kind: 'content', basename: id })

function docWithPericia(nome: string, row: Record<string, unknown>, atributos: Record<string, number>): VaultDoc {
  return {
    frontmatter: {
      Atributos: atributos,
      Pericias: { Lista: [{ Nome: nome, ...row }] },
      Magias: { Lista: [{ Nome: 'Anima', Atributo: 'PRE', Proficiencia: 'A', Bonus_Item: 1, Bonus_Especial: 0 }] },
    },
  } as unknown as VaultDoc
}

const MEMBERS = [member('Thoren'), member('Mera')]
const DOCS = new Map<string, VaultDoc>([
  // Thoren: Sobrevivência FOR, prof E (+4), ITEM +2 (o report: aparecia +0)
  ['Thoren', docWithPericia('Sobrevivência', { Atributo: 'FOR', Proficiencia: 'E', Bonus_Item: 2, Bonus_Especial: 0 }, { FOR: 3, AGI: 2, INT: 1, PRE: 0 })],
  // Mera: Sobrevivência INT, prof A (+2), item +1, especial +1
  ['Mera', docWithPericia('Sobrevivência', { Atributo: 'INT', Proficiencia: 'A', Bonus_Item: 1, Bonus_Especial: 1 }, { FOR: 0, AGI: 2, INT: 3, PRE: 1 })],
])

describe('#415 — tops carregam as partes REAIS do modificador', () => {
  it('topTwoForSkill expõe attr/prof/item/especial de cada membro', () => {
    const tops = topTwoForSkill(MEMBERS, DOCS, 'Sobrevivência')
    const thoren = tops.find((t) => t.who === 'Thoren')!
    expect(thoren.mod).toBe(3 + 4 + 2) // FOR 3 + E 4 + item 2
    expect(thoren).toMatchObject({ attr: 'FOR', attrVal: 3, profVal: 4, item: 2, especial: 0 })
    const mera = tops.find((t) => t.who === 'Mera')!
    expect(mera).toMatchObject({ attr: 'INT', attrVal: 3, profVal: 2, item: 1, especial: 1 })
  })

  it('magiaHighlights.top também expõe as partes', () => {
    const [anima] = magiaHighlights(MEMBERS, DOCS)
    expect(anima!.top).toMatchObject({ item: 1, especial: 0, profVal: 2 })
  })
})

describe('#415 — destTipModificador monta o markup do design com dados vivos', () => {
  it('linhas Atributo/Proficiência/Item/Especialização com os valores do membro', () => {
    const [thoren] = topTwoForSkill(MEMBERS, DOCS, 'Sobrevivência').filter((t) => t.who === 'Thoren')
    const { h, w } = destTipModificador('💪', thoren!)
    expect(w).toBe(220)
    expect(h).toContain('Modificador <strong>+9</strong>')
    expect(h).toContain('Atributo (FOR): +3')
    expect(h).toContain('Proficiência (E): +4')
    expect(h).toContain('Item: +2') // o report: mostrava +0 do snapshot
    expect(h).toContain('Especialização: +0')
  })
})
