// ESSÊNCIA UNIVERSAL (2026-10-29): a técnica dá um slot PRÓPRIO
// (`Magias.Lista.Anima.Slots.U`; na secundária, `Magias.Secundaria.Lista.Anima.Slots.U`)
// que só compra universal (Criação/Destruição) — o slot A comum não compra.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import type { IndexManifest, VaultDoc } from '../src/data/types'
import { projectHeroRules } from '../src/rules/useHeroRules'
import { mergeCalculatedIntoFm } from '../src/rules/merge-calculated'
import { targetToModelPath } from '../src/rules/projection'
import { gastosDeSlot, slotsPorPool, usadosPorPool } from '../src/rules/slots-magia'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const dir = path.join(path.dirname(appDir), 'vault-data')
const catalog = buildCatalog(JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')) as IndexManifest)
const load = async (id: string): Promise<VaultDoc> =>
  JSON.parse(fs.readFileSync(path.join(dir, `${id}.json`), 'utf8')) as VaultDoc
const heroi = (nome: string) =>
  structuredClone((JSON.parse(fs.readFileSync(path.join(dir, `Sistema/Criaturas/Heróis/${nome}.json`), 'utf8')) as VaultDoc).frontmatter)
const comTecnica = (fm: Record<string, unknown>, t: string) => {
  const tec = (fm['Tecnicas'] ?? {}) as Record<string, unknown>
  const lista = Array.isArray(tec['Lista']) ? (tec['Lista'] as unknown[]) : []
  return { ...fm, Tecnicas: { ...tec, Lista: [...lista, { [`[[${t}]]`]: 'Slot.A' }] } }
}

describe('a técnica Essência Universal dá o slot U', () => {
  it('Animista (Zuko) com a técnica: calc e linha da Anima trazem U = 1', async () => {
    const { projection } = await projectHeroRules(comTecnica(heroi('Zuko'), 'Essência Universal'), catalog, load)
    expect(projection.calculated['Magias.Lista.Anima.Slots.U']).toBe(1)
    expect(slotsPorPool(projection.derivedFm, projection.calculated, false).anima.U).toBe(1)
  })
  it('sem a técnica: nenhum U', async () => {
    const { projection } = await projectHeroRules(heroi('Zuko'), catalog, load)
    expect(slotsPorPool(projection.derivedFm, projection.calculated, false).anima.U).toBe(0)
  })
})

describe('slot U no motor de slots', () => {
  it('merge leva Slots.U pra linha da Anima (e a secundária idem); fonte rastreável', () => {
    const out = mergeCalculatedIntoFm(
      { Magias: { Lista: [{ Nome: 'Anima', Proficiencia: 'A', Lista: [] }], Secundaria: { Lista: [] } } },
      { 'Magias.Lista.Anima.Slots.U': 1, 'Magias.Secundaria.Lista.Anima.Slots.U': 1 },
      [],
    ) as any
    expect(out.Magias.Lista.find((e: any) => e.Nome === 'Anima').Slots).toEqual({ U: 1 })
    expect(out.Magias.Secundaria.Lista.find((e: any) => e.Nome === 'Anima').Slots).toEqual({ U: 1 })
    expect(targetToModelPath('Magias.Lista.Anima.Slots.U')).toBe('magias.escolas.Anima.slots.U')
  })
  it('universal comprada com Slot.U ocupa o U (Adepta no primário, Menor na secundária)', () => {
    const fm = {
      Habilidades: {
        Lista: [
          { '[[Essência de Criação Adepta]]': 'Slot.U' },
          { '[[Essência de Destruição Menor]]': 'Slot.U' },
          { '[[Essência Explosiva Adepta]]': 'Slot.A' },
        ],
      },
    }
    expect(gastosDeSlot(fm, false).map((g) => g.rank).sort()).toEqual(['A', 'U'])
    expect(gastosDeSlot(fm, true).map((g) => g.rank)).toEqual(['U'])
    const t = slotsPorPool({}, { 'Magias.Lista.Anima.Slots.U': 1, 'Magias.Lista.Anima.Slots.A': 2 }, false)
    const u = usadosPorPool(fm, false, t, () => false)
    expect(u.anima.U).toBe(1)
    expect(u.anima.A).toBe(1)
  })
})
