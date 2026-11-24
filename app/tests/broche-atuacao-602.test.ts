// @vitest-environment node
// Reportado por @mguindani-ael (#602): "broche artistico nao esta somando em
// atuacao". A nota diz "+1/+2/+3 de bônus de item em Atuação" por qualidade, mas
// os Elementos_de_Regra só davam o bônus das Magias Arcanas. Atuação é ofício
// (Oficios.Lista.Atuacao). Carlos (Bardo, Atuação M) com o Broche como
// implemento (Inventario.Implementos), com e sem foco.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { projectHeroRules } from '../src/rules/useHeroRules'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
const catalog = buildCatalog(manifest)
const load = (id: string): VaultDoc => JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8')) as VaultDoc
const carlos = load('Sistema/Criaturas/Heróis/Carlos Facão de Andradas').frontmatter as Record<string, any>

async function atuacao(categoria: string, foco: string) {
  const fm = {
    ...carlos,
    Inventario: {
      ...carlos.Inventario,
      Tesouros: (carlos.Inventario.Tesouros as string[]).filter((t) => !/Foco da/.test(t)),
      Implementos: [{ Nome: '[[Broche Artístico]]', Propriedade: foco, Categoria: categoria, Fonte: 'Manual' }],
    },
  }
  const { projection } = await projectHeroRules(fm, catalog, async (id) => load(id))
  const d = projection.derivedFm as Record<string, any>
  const de = (lista: unknown, nome: string) =>
    Number((lista as Record<string, unknown>[]).find((r) => r.Nome === nome)?.Bonus_Item ?? 0)
  return { atuacao: de(d.Oficios.Lista, 'Atuacao'), magia: de(d.Magias.Lista, 'Arcana Branca') }
}

describe('#602 Broche Artístico soma em Atuação', () => {
  it('Adepto +1, Experiente +2, Mestre +3 (e o das magias segue)', async () => {
    expect(await atuacao('[[Adepto]]', '')).toEqual({ atuacao: 1, magia: 1 })
    expect(await atuacao('[[Experiente]]', '')).toEqual({ atuacao: 2, magia: 2 })
    expect(await atuacao('[[Mestre]]', '[[Foco da Repetição]]')).toEqual({ atuacao: 3, magia: 3 })
  })
})
