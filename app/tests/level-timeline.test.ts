// @vitest-environment node
// Planejamento por nível (docs/plano-planejamento-por-nivel.md, F1): timeline
// derivada projetando o herói nível a nível (1..10) e diffando — ganhos caem
// no nível em que a regra dispara (scope Nivel N), escolhas no nível do gate,
// e os GASTOS de slot (técnicas/perícias/magias) são atribuídos por
// earliest-fit: o k-ésimo gasto do rank R cai no nível onde o k-ésimo slot R
// nasce (ordem da lista = proxy de cronologia).
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { buildLevelTimeline } from '../src/rules/level-timeline'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)
const load = async (id: string): Promise<VaultDoc> =>
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8')) as VaultDoc

describe('timeline do Guerreiro (regras reais da vault)', () => {
  const fm = {
    Classe: '[[Guerreiro]]',
    'Nível': 7,
    Atributos: { FOR: 3, AGI: 2, INT: 1, PRE: 1 },
    Tecnicas: {
      Lista: [
        { '[[Ataque Poderoso]]': 'Slot.A' }, // 1º A → N1 (slot da classe)
        { '[[Aparar]]': 'Slot.A' }, // 2º A → N2 (Evolução Básica)
        { '[[Ataque Brutal]]': 'Slot.E' }, // 1º E → N4
      ],
    },
    Pericias: {
      Lista: [
        {
          Nome: 'Atletismo',
          Atributo: 'FOR',
          Proficiencia: 'E',
          Bonus_Item: 0,
          Bonus_Especial: 0,
          Incrementos: [{ A: 'Slot.A' }, { E: 'Slot.E' }],
        },
      ],
    },
  }

  it('cards 1..10; ganhos da classe caem no nível do scope', async () => {
    const cards = await buildLevelTimeline(fm, catalog, load)
    expect(cards).toHaveLength(10)
    expect(cards.map((c) => c.nivel)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    const hab = (n: number) => cards[n - 1]!.habilidades.join(' ')
    expect(hab(1)).toContain('Evolução Básica')
    expect(hab(1)).toContain('Especialização em Arma')
    expect(hab(4)).toContain('Veterano')
    expect(hab(7)).toContain('Campeão')
    expect(hab(10)).toContain('Maestria em Arma')
  })

  it('slots ganhos por nível (classe + Evolução Básica)', async () => {
    const cards = await buildLevelTimeline(fm, catalog, load)
    // Guerreiro N1: Tec A+1; Evolução N2/N3: Tec A+1 cada; N4: classe Tec E+1
    expect(cards[0]!.slots.tecnicas.A).toBe(1)
    expect(cards[1]!.slots.tecnicas.A).toBe(1)
    expect(cards[2]!.slots.tecnicas.A).toBe(1)
    expect(cards[3]!.slots.tecnicas.E).toBe(1)
    expect(cards[6]!.slots.tecnicas.M).toBe(1)
    // Perícias: N1 = 2 (classe) + INT (Evolução, INT 1 → 1) = 3; N4 E+1
    expect(cards[0]!.slots.pericias.A).toBe(3)
    expect(cards[3]!.slots.pericias.E).toBe(1)
  })

  it('gastos atribuídos por earliest-fit na ordem da lista', async () => {
    const cards = await buildLevelTimeline(fm, catalog, load)
    const gastosTec = (n: number) => cards[n - 1]!.gastos.tecnicas.map((g) => g.link)
    expect(gastosTec(1)).toEqual(['[[Ataque Poderoso]]'])
    expect(gastosTec(2)).toEqual(['[[Aparar]]'])
    expect(gastosTec(4)).toEqual(['[[Ataque Brutal]]'])
    // perícia: A de Atletismo no 1º slot A (N1); E no 1º slot E (N4)
    const gastosPer = (n: number) => cards[n - 1]!.gastos.pericias.map((g) => `${g.nome}:${g.rank}`)
    expect(gastosPer(1)).toContain('Atletismo:A')
    expect(gastosPer(4)).toContain('Atletismo:E')
  })

  it('escolhas caem no nível do gate (Especialização em Arma N1)', async () => {
    const cards = await buildLevelTimeline(fm, catalog, load)
    const n1Labels = cards[0]!.escolhas.map((c) => c.sourceNote)
    expect(n1Labels).toContain('Especialização em Arma')
  })

  it('nível ACIMA do atual segue no plano (ganhos futuros visíveis)', async () => {
    const cards = await buildLevelTimeline({ ...fm, 'Nível': 3 }, catalog, load)
    expect(cards[9]!.habilidades.join(' ')).toContain('Maestria em Arma')
    expect(cards[3 - 1]!.nivel).toBe(3)
  })
})

describe('blindagem — bloco Planejamento é INERTE pra engine', () => {
  it('derivedFm idêntico com e sem o bloco (Carlos congelado)', async () => {
    const doc = JSON.parse(
      fs.readFileSync(path.join('tests/fixtures/heroes', 'Carlos Facão de Andradas.json'), 'utf8'),
    ) as VaultDoc
    const fm = doc.frontmatter as Record<string, unknown>
    const { projectHeroRules } = await import('../src/rules/useHeroRules')
    const sem = await projectHeroRules(fm, catalog, load)
    const com = await projectHeroRules(
      { ...fm, Planejamento: { picks: { 'x|y|1': '[[Qualquer Coisa]]' } } },
      catalog,
      load,
    )
    const semD = { ...(sem.projection.derivedFm as Record<string, unknown>) }
    const comD = { ...(com.projection.derivedFm as Record<string, unknown>) }
    delete comD['Planejamento'] // a chave passa crua pro derivado (esperado)
    expect(JSON.stringify(comD)).toBe(JSON.stringify(semD))
  })
})

describe('#493 — consequência herda o nível do PAI (cadeia de derivação)', () => {
  it('escolha de técnica comprada com slot E (N4) cai no card 4, não no 1', async () => {
    const fm = {
      Classe: '[[Guerreiro]]',
      'Nível': 9,
      Atributos: { FOR: 3, AGI: 2, INT: 1, PRE: 1 },
      Tecnicas: {
        Lista: [
          { '[[Treinamento de Classe Secundária]]': 'Slot.A' }, // 1º A → N1
          { '[[Especialização em Classe Secundária]]': 'Slot.E' }, // 1º E → N4
        ],
      },
      Habilidades: {
        Lista: [{ '[[Treinamento de Ladino]]': 'Escolha.[[Treinamento de Classe Secundária]]' }],
      },
    }
    const cards = await buildLevelTimeline(fm, catalog, load)
    const escolhasDe = (n: number) => cards[n - 1]!.escolhas.map((c) => c.sourceNote)
    // a escolha da Especialização (técnica atribuída ao N4) pertence ao N4
    expect(escolhasDe(4)).toContain('Especialização em Classe Secundária')
    expect(escolhasDe(1)).not.toContain('Especialização em Classe Secundária')
    // a do Treinamento (comprado no N1) segue no N1
    expect(escolhasDe(1)).toContain('Treinamento de Classe Secundária')
    // ganho derivado do pick do N1 (Ataque Furtivo Menor via Treinamento de
    // Ladino) fica no N1
    expect(cards[0]!.habilidades.join(' ')).toContain('Ataque Furtivo Menor')
  })
})
