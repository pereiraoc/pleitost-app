// @vitest-environment node
// #490 — remover o Treinamento de Classe Secundária deixava viva a técnica
// concedida INDIRETAMENTE: Treinamento de Ladino (Escolha do Treinamento) some
// via prune #51, mas a técnica escolhida na Especialização em Classe
// Secundária (gated por Contem([[Treinamento de Ladino]])) continuava na
// ficha — a cascata de órfãos não derrubava o segundo nível.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { projectHeroRules } from '../src/rules/useHeroRules'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)
const load = (id: string): VaultDoc =>
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8')) as VaultDoc

async function derived(fm: Record<string, unknown>) {
  const { projection } = await projectHeroRules(fm, catalog, async (id) => load(id))
  return projection.derivedFm as Record<string, unknown>
}
const json = (d: Record<string, unknown>, ...p: string[]) => {
  let cur: unknown = d
  for (const k of p) cur = (cur as Record<string, unknown> | undefined)?.[k]
  return JSON.stringify(cur ?? [])
}

describe('#490 — órfãos indiretos de classe secundária', () => {
  it('COM o treinamento: Envenenador Nato fica (sanidade)', async () => {
    const d = await derived({
      Classe: '[[Guerreiro]]',
      'Nível': 5,
      Habilidades: {
        Lista: [
          { '[[Treinamento de Ladino]]': 'Escolha.[[Treinamento de Classe Secundária]]' },
        ],
      },
      Tecnicas: {
        Lista: [
          { '[[Treinamento de Classe Secundária]]': 'Slot.A' },
          { '[[Especialização em Classe Secundária]]': 'Slot.E' },
          { '[[Envenenador Nato]]': 'Escolha.[[Especialização em Classe Secundária]]' },
        ],
      },
    })
    expect(json(d, 'Tecnicas', 'Lista')).toContain('Envenenador Nato')
  })

  it('SEM o treinamento (removido): Treinamento de Ladino E Envenenador Nato somem', async () => {
    const d = await derived({
      Classe: '[[Guerreiro]]',
      'Nível': 5,
      Habilidades: {
        Lista: [
          // linha órfã que o prune #51 limpa — a REMOÇÃO dela precisa derrubar
          // a condicional do Envenenador na mesma projeção (cascata)
          { '[[Treinamento de Ladino]]': 'Escolha.[[Treinamento de Classe Secundária]]' },
        ],
      },
      Tecnicas: {
        Lista: [
          { '[[Especialização em Classe Secundária]]': 'Slot.E' },
          { '[[Envenenador Nato]]': 'Escolha.[[Especialização em Classe Secundária]]' },
        ],
      },
    })
    expect(json(d, 'Habilidades', 'Lista')).not.toContain('Treinamento de Ladino')
    expect(json(d, 'Tecnicas', 'Lista')).not.toContain('Envenenador Nato')
  })
})
