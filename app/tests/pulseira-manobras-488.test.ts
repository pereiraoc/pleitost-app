// @vitest-environment node
// #488 — Pulseira da Potência não soma no modificador de MANOBRAS (item bonus).
// A nota declara `Categoria <tier> Definir Ataques.Lista.Manobras.Bonus_Item N`
// (e {Desarmadas} pros desarmados); o tier vem do alias do tesouro na lista
// (categoriaPorNota). O mod de manobras do Combate lê a linha Manobras de
// Ataques.Lista do fm derivado (CombateTab rowMod) — o Bonus_Item precisa
// chegar lá.
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

const manobrasRow = (d: Record<string, unknown>) => {
  const lista = ((d['Ataques'] as Record<string, unknown>)?.['Lista'] ?? []) as Record<
    string,
    unknown
  >[]
  return lista.find((r) => String(r['Nome']) === 'Manobras')
}

async function derived(fm: Record<string, unknown>) {
  const { projection } = await projectHeroRules(fm, catalog, async (id) => load(id))
  return projection.derivedFm as Record<string, unknown>
}

const base = {
  Classe: '[[Guerreiro]]',
  'Nível': 3,
  Ataques: {
    Lista: [
      { Nome: 'Manobras', Atributo: 'FOR', Bonus_Item: 0, Bonus_Especial: 0 },
    ],
  },
}

describe('#488 — Pulseira da Potência → Bonus_Item de Manobras', () => {
  it('Adepto: Manobras.Bonus_Item vira 1', async () => {
    const d = await derived({
      ...base,
      Inventario: { Tesouros: ['[[Pulseira da Potência|Pulseira da Potência (Adepto)]]'] },
    })
    expect(manobrasRow(d)?.['Bonus_Item']).toBe(1)
  })

  it('Experiente: Manobras.Bonus_Item vira 2', async () => {
    const d = await derived({
      ...base,
      Inventario: { Tesouros: ['[[Pulseira da Potência|Pulseira da Potência (Experiente)]]'] },
    })
    expect(manobrasRow(d)?.['Bonus_Item']).toBe(2)
  })

  it('sem a pulseira: Bonus_Item segue 0', async () => {
    const d = await derived({ ...base })
    expect(manobrasRow(d)?.['Bonus_Item']).toBe(0)
  })
})
