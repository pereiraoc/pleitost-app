// Bug #5 (report do usuário): "quando eu ganho a habilidade Elementalista, que
// me da acesso a essências experientes, tu não ta limitando me mostrar com base
// no que eu já tenho adepta (porque é só as que eu tenho acesso que deveriam
// aparecer para subir para experiente)."
//
// Filtro de LINHAGEM (app-side, data-driven): cada linha de essência é uma
// PASTA da vault (Essência Flamejante/{base, Adepta, Experiente}) e cada
// estágio declara `rank::` na nota. Opção Experiente/Mestre de um Selecionar
// só é elegível se o herói POSSUI a irmã da mesma pasta com o rank anterior.
// Opções sem rank (Treinamentos de classe etc.) não são constrangidas.
import { beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import type { IndexManifest, VaultDoc } from '../src/data/types'
import { projectHeroRules } from '../src/rules/useHeroRules'
import type { HeroProjection } from '../src/rules/projection'
import { emptyHeroFrontmatter } from '../src/data/local-entities'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
const catalog = buildCatalog(manifest)
const loadFromDisk = async (id: string): Promise<VaultDoc> =>
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8')) as VaultDoc

/** Animista com Elementalista e UMA essência Adepta (Flamejante) escolhida. */
function animistaComElementalista(): Record<string, unknown> {
  const fm = emptyHeroFrontmatter() as any
  fm.Classe = '[[Animista]]'
  fm.Habilidades.Lista = [
    { '[[Essência Flamejante Adepta]]': 'Escolha.01.[[Magias Anima]]' },
    { '[[Elementalista]]': 'Manual' },
  ]
  return fm
}

let projection: HeroProjection
beforeAll(async () => {
  const out = await projectHeroRules(animistaComElementalista(), catalog, loadFromDisk)
  projection = out.projection
})

function choicesByLabel(label: string) {
  return projection.habilidadeChoices.filter((c) => c.label === label)
}

describe('filtro de linhagem nas opções de essência Experiente (bug #5)', () => {
  it('as escolhas Experiente do Elementalista são descobertas', () => {
    expect(choicesByLabel('Essência Elemental Experiente').length).toBeGreaterThanOrEqual(2)
  })

  it('só a Experiente das linhas que o herói TEM Adepta aparece como opção', () => {
    for (const c of choicesByLabel('Essência Elemental Experiente')) {
      expect(c.options).toContain('[[Essência Flamejante Experiente]]')
      // linhas sem a Adepta correspondente somem
      expect(c.options).not.toContain('[[Essência Congelante Experiente]]')
      expect(c.options).not.toContain('[[Essência Torrencial Experiente]]')
    }
  })

  it('as escolhas Adepta (Magias Anima) continuam com TODAS as opções', () => {
    const adeptas = choicesByLabel('Essência Elemental Adepta')
    expect(adeptas.length).toBeGreaterThanOrEqual(3)
    for (const c of adeptas) {
      expect(c.options).toContain('[[Essência Congelante Adepta]]')
      expect(c.options.length).toBeGreaterThanOrEqual(7)
    }
  })
})
