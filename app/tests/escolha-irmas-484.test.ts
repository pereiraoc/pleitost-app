// @vitest-environment node
// #484 — escolher a essência Experiente REMOVIA a Adepta: a detecção de
// escolhas IRMÃS agrupava por sourceNote|label|OPÇÕES — com as variantes
// condicionais por sintonia (vault 35a51aec), as escolhas de N1 (3 opções da
// sintonia) e N4 (10 sem o oposto) do Treinamento de Animista deixaram de ser
// irmãs numeradas (Escolha.01/02) e viraram "únicas" SEM numeração: as duas
// gravavam a MESMA linha `Escolha.[[pai]]` e a segunda sobrescrevia a
// primeira. Irmãs agora agrupam por sourceNote|label (opções variam por
// condição legitimamente).
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

const BASE = {
  Classe: '[[Guerreiro]]',
  Sintonia: '[[Traço Elemental da Água|Água]]',
  'Nível': 9,
  Habilidades: {
    Lista: [{ '[[Treinamento de Animista]]': 'Escolha.[[Treinamento de Classe Secundária]]' }],
  },
  Tecnicas: { Lista: [{ '[[Treinamento de Classe Secundária]]': 'Slot.A' }] },
}

async function choicesDoTreinamento(fm: Record<string, unknown>) {
  const { projection } = await projectHeroRules(fm, catalog, async (id) => load(id))
  const p = projection as never as {
    habilidadeChoices?: {
      sourceNote?: string
      label?: string
      pick?: string | null
      occurrenceWithinParent?: number
    }[]
  }
  return (p.habilidadeChoices ?? []).filter((c) => c.sourceNote === 'Treinamento de Animista')
}

describe('#484 — irmãs de opções diferentes seguem NUMERADAS', () => {
  it('N1 e N4 (mesmo label, opções diferentes) ganham occurrence 1 e 2; N7 fica única', async () => {
    const cs = await choicesDoTreinamento(BASE)
    const adeptas = cs.filter((c) => c.label === 'Essência Elemental Adepta')
    expect(adeptas.length).toBe(2)
    expect(adeptas.map((c) => c.occurrenceWithinParent).sort()).toEqual([1, 2])
    const exp = cs.find((c) => c.label === 'Essência Elemental Experiente')
    expect(exp?.occurrenceWithinParent).toBeUndefined()
  })

  it('picks salvos numerados + o untagged do Experiente convivem sem colisão', async () => {
    const fm = {
      ...BASE,
      // Enraizante é TERRA — sintonia Terra pra ela caber nas opções do N1
      Sintonia: '[[Traço Elemental da Terra|Terra]]',
      Habilidades: {
        Lista: [
          { '[[Treinamento de Animista]]': 'Escolha.[[Treinamento de Classe Secundária]]' },
          // repro do Mário: adepta gravada numerada, experiente sem número
          { '[[Essência Enraizante Menor]]': 'Escolha.01.[[Treinamento de Animista]]' },
          { '[[Essência Enraizante Experiente Menor]]': 'Escolha.[[Treinamento de Animista]]' },
        ],
      },
    }
    const cs = await choicesDoTreinamento(fm)
    const adepta1 = cs.find(
      (c) => c.label === 'Essência Elemental Adepta' && c.occurrenceWithinParent === 1,
    )
    const exp = cs.find((c) => c.label === 'Essência Elemental Experiente')
    expect(adepta1?.pick).toContain('Enraizante Menor')
    expect(exp?.pick).toContain('Experiente Menor')
  })
})
