// REGRAS NOVAS DE CLASSE (vault 2026-10-18/21):
// - Perícia de Classe ESCOLHIDA: Ladino Furtividade OU Ladinagem; Monge e
//   Guerreiro Atletismo OU Acrobacia (antes um condicional pelo atributo 3 —
//   agora o atributo só decide qual vem por padrão).
// - Bardo de Luta Artística ("Requer FOR ou AGI 2"): PRE 3 fica; o atributo 2
//   só pode ser FOR ou AGI (`Restringir Atributos.Secundario FOR, AGI`).
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import type { IndexManifest, VaultDoc } from '../src/data/types'
import { projectHeroRules } from '../src/rules/useHeroRules'
import { emptyHeroFrontmatter } from '../src/data/local-entities'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
const catalog = buildCatalog(manifest)
const load = async (id: string): Promise<VaultDoc> =>
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8')) as VaultDoc

const heroi = (extra: Record<string, unknown>) => ({ ...emptyHeroFrontmatter(), ...extra })
const prof = (fm: Record<string, unknown>, nome: string) =>
  ((fm['Pericias'] as { Lista: Record<string, unknown>[] }).Lista.find((p) => p['Nome'] === nome) ?? {})['Proficiencia']
const escolhaDaClasse = (choices: { label: string; sourceNote: string; options: string[] }[], classe: string) =>
  choices.find((c) => c.label === 'Perícia de Classe' && c.sourceNote.split('/').pop() === classe)

describe('Perícia de Classe escolhida', () => {
  it('Ladino: Furtividade OU Ladinagem — padrão Furtividade', async () => {
    const fm = heroi({ Classe: '[[Ladino]]', Atributos: { Principal: 'AGI', FOR: 1, AGI: 3, INT: 2, PRE: 0 } })
    const { projection } = await projectHeroRules(fm, catalog, load)
    const c = escolhaDaClasse(projection.habilidadeChoices, 'Ladino')
    expect(c?.options).toEqual(['Furtividade', 'Ladinagem'])
    expect(prof(projection.derivedFm, 'Furtividade')).toBe('A')
  })

  it('Ladino que escolheu Ladinagem fica Adepto nela, não em Furtividade', async () => {
    const fm = heroi({ Classe: '[[Ladino]]', Atributos: { Principal: 'AGI', FOR: 1, AGI: 3, INT: 2, PRE: 0 } })
    const lista = (fm['Pericias'] as { Lista: Record<string, unknown>[] }).Lista
    const row = lista.find((p) => p['Nome'] === 'Ladinagem')!
    row['Incrementos'] = [{ A: 'Escolha.[[Ladino]]' }]
    const { projection } = await projectHeroRules(fm, catalog, load)
    expect(prof(projection.derivedFm, 'Ladinagem')).toBe('A')
    expect(prof(projection.derivedFm, 'Furtividade')).toBe('N')
  })

  it('Monge de AGI pode escolher Atletismo (o atributo só define o padrão)', async () => {
    const base = { Classe: '[[Monge]]', Atributos: { Principal: 'AGI', FOR: 1, AGI: 3, INT: 2, PRE: 0 } }
    const padrao = await projectHeroRules(heroi(base), catalog, load)
    expect(escolhaDaClasse(padrao.projection.habilidadeChoices, 'Monge')?.options).toEqual(['Acrobacia', 'Atletismo'])
    expect(prof(padrao.projection.derivedFm, 'Acrobacia')).toBe('A')
    const fm = heroi(base)
    const row = (fm['Pericias'] as { Lista: Record<string, unknown>[] }).Lista.find((p) => p['Nome'] === 'Atletismo')!
    row['Incrementos'] = [{ A: 'Escolha.[[Monge]]' }]
    const { projection } = await projectHeroRules(fm, catalog, load)
    expect(prof(projection.derivedFm, 'Atletismo')).toBe('A')
    expect(prof(projection.derivedFm, 'Acrobacia')).toBe('N')
  })
})

describe('Bardo de Luta Artística: atributo 2 = FOR ou AGI', () => {
  const LUTA = '[[Estilo de Combate (Luta Artística)]]'
  const bardo = (atributos: Record<string, unknown>) =>
    heroi({
      Classe: '[[Bardo]]',
      Atributos: atributos,
      Habilidades: { Lista: [{ [LUTA]: 'Escolha.[[Estilo de Combate]]' }] },
    })

  it('o slot 2 só oferece FOR/AGI', async () => {
    const { projection } = await projectHeroRules(bardo({ Principal: 'PRE', FOR: 1, AGI: 2, INT: 0, PRE: 3 }), catalog, load)
    expect(projection.secundarioAllowed).toEqual(['FOR', 'AGI'])
    const slot2 = projection.atributos.find((c) => c.rank === 2)!
    expect(slot2.options).toEqual(['FOR', 'AGI'])
  })

  it('INT 2 é corrigido pra FOR/AGI no derivado; PRE segue 3', async () => {
    const { projection } = await projectHeroRules(bardo({ Principal: 'PRE', FOR: 0, AGI: 1, INT: 2, PRE: 3 }), catalog, load)
    const at = projection.derivedFm['Atributos'] as Record<string, number>
    expect(at['PRE']).toBe(3)
    expect([at['FOR'], at['AGI']]).toContain(2)
    expect(at['INT']).not.toBe(2)
  })

  it('com Arte Mágica o slot 2 é livre', async () => {
    const fm = heroi({
      Classe: '[[Bardo]]',
      Atributos: { Principal: 'PRE', FOR: 0, AGI: 1, INT: 2, PRE: 3 },
      Habilidades: { Lista: [{ '[[Estilo de Combate (Arte Mágica)]]': 'Escolha.[[Estilo de Combate]]' }] },
    })
    const { projection } = await projectHeroRules(fm, catalog, load)
    expect(projection.secundarioAllowed).toBeNull()
    expect((projection.derivedFm['Atributos'] as Record<string, number>)['INT']).toBe(2)
  })
})
