// @vitest-environment node
// #479/#480 — essências pela Sintonia, no modelo de SLOTS (2026-10-25):
//  • Magias Anima: a PURA da sintonia vem fixa (Condicional Sintonia +
//    Complementar) e o resto é slot de magia A (2 no N1, +1 no N2 e no N3) —
//    vizinhança e oposto são do Círculo (rules/roda-essencias.ts).
//  • Treinamento de Animista (secundária): slots SECUNDÁRIOS (A no N1 e N4,
//    E no N7) pras Menores.
//  • Essência Invertida: a pura do elemento OPOSTO, fixa (Adepta ou Menor).
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

async function derivado(fm: Record<string, unknown>) {
  const { projection } = await projectHeroRules(fm, catalog, async (id) => load(id))
  return projection as never as {
    derivedFm: Record<string, any>
    habilidadeChoices?: Array<{ sourceNote?: string }>
  }
}
const habs = (d: Record<string, any>) => JSON.stringify(d['Habilidades']?.['Lista'] ?? [])
// slots da ANIMA moram na linha da escola (rules/slots-magia.ts)
const slotsAnima = (lista: Array<Record<string, any>> | undefined) =>
  (lista ?? []).find((e) => e['Nome'] === 'Anima')?.['Slots'] ?? {}
const semEscolhaDeEssencia = (p: { habilidadeChoices?: Array<{ sourceNote?: string }> }) =>
  (p.habilidadeChoices ?? []).filter((c) =>
    ['Magias Anima', 'Treinamento de Animista', 'Essência Invertida', 'Elementalista', 'Avatar'].includes(c.sourceNote ?? ''),
  )

describe('#480 — Magias Anima: pura fixa + slots A', () => {
  it('sintonia Fogo: Flamejante concedida; 4 slots A no N3; nenhuma escolha', async () => {
    const p = await derivado({ Classe: '[[Animista]]', Sintonia: '[[Traço Elemental do Fogo|Fogo]]', 'Nível': 3 })
    expect(habs(p.derivedFm)).toContain('{"[[Essência Flamejante Adepta]]":"Regra.[[Magias Anima]]"}')
    expect(slotsAnima(p.derivedFm['Magias']['Lista'])['A']).toBe(4)
    expect(p.derivedFm['Magias']['Slots']?.['A'] ?? 0).toBe(0) // nada no pool Arcana
    expect(semEscolhaDeEssencia(p)).toEqual([])
  })

  it('sintonia Terra: Mineral concedida; 2 slots A no N1', async () => {
    const p = await derivado({ Classe: '[[Animista]]', Sintonia: '[[Traço Elemental da Terra|Terra]]', 'Nível': 1 })
    expect(habs(p.derivedFm)).toContain('Essência Mineral Adepta')
    expect(habs(p.derivedFm)).not.toContain('Essência Flamejante Adepta')
    expect(slotsAnima(p.derivedFm['Magias']['Lista'])['A']).toBe(2)
  })

  it('SEM sintonia definida, a pura não vem (estado transitório)', async () => {
    const p = await derivado({ Classe: '[[Animista]]', 'Nível': 1 })
    expect(habs(p.derivedFm)).not.toMatch(/Essência \S+ Adepta/)
  })
})

describe('#480 — Treinamento de Animista (classe secundária)', () => {
  const base = {
    Classe: '[[Guerreiro]]',
    Sintonia: '[[Traço Elemental da Água|Água]]',
    Habilidades: {
      Lista: [{ '[[Treinamento de Animista]]': 'Escolha.[[Treinamento de Classe Secundária]]' }],
    },
    Tecnicas: { Lista: [{ '[[Treinamento de Classe Secundária]]': 'Slot.A' }] },
  }
  it('slots SECUNDÁRIOS: A 1 no N1, A 2 no N4, E 1 no N7 — sem tocar o primário', async () => {
    const sec = async (n: number) => slotsAnima((await derivado({ ...base, 'Nível': n })).derivedFm['Magias']['Secundaria']['Lista'])
    expect((await sec(1))['A']).toBe(1)
    expect((await sec(4))['A']).toBe(2)
    const n7 = await sec(7)
    expect(n7['A']).toBe(2)
    expect(n7['E']).toBe(1)
    const p = await derivado({ ...base, 'Nível': 7 })
    expect(Number(p.derivedFm['Magias']?.['Slots']?.['A'] ?? 0)).toBe(0)
    expect(semEscolhaDeEssencia(p)).toEqual([])
  })
})

describe('#479/#485 — Essência Invertida: pura OPOSTA fixa, sintonia × contexto', () => {
  it('PRIMÁRIO (Classe Animista, Vento): a Mineral Adepta, na lista PRIMÁRIA', async () => {
    const p = await derivado({
      Classe: '[[Animista]]',
      Sintonia: '[[Traço Elemental do Vento|Vento]]',
      'Nível': 9,
      Tecnicas: { Lista: [{ '[[Essência Invertida]]': 'Slot.E' }] },
    })
    expect(habs(p.derivedFm)).toContain('{"[[Essência Mineral Adepta]]":"Regra.[[Essência Invertida]]"}')
    expect(habs(p.derivedFm)).not.toContain('Menor')
    expect(JSON.stringify(p.derivedFm['Magias']['Lista'])).toContain('Barreira de Pedra')
  })
  it('SECUNDÁRIO (Guerreiro + Treinamento de Animista, Vento): a Mineral Menor, na lista SEGREGADA', async () => {
    const p = await derivado({
      Classe: '[[Guerreiro]]',
      Sintonia: '[[Traço Elemental do Vento|Vento]]',
      'Nível': 9,
      Habilidades: {
        Lista: [{ '[[Treinamento de Animista]]': 'Escolha.[[Treinamento de Classe Secundária]]' }],
      },
      Tecnicas: {
        Lista: [
          { '[[Treinamento de Classe Secundária]]': 'Slot.A' },
          { '[[Maestria em Classe Secundária]]': 'Slot.M' },
          { '[[Essência Invertida]]': 'Escolha.[[Maestria em Classe Secundária]]' },
        ],
      },
    })
    expect(habs(p.derivedFm)).toContain('Essência Mineral Menor')
    expect(habs(p.derivedFm)).not.toContain('Essência Mineral Adepta')
    const magias = p.derivedFm['Magias']
    expect(JSON.stringify(magias['Secundaria']['Lista'])).toContain('Barreira de Pedra')
    expect(JSON.stringify(magias['Lista'] ?? '')).not.toContain('Barreira de Pedra')
  })
})

describe('retrocompat — picks salvos ANTES dos slots sobrevivem', () => {
  it('Animista Terra com Hidratante (escolha antiga) mantém a essência, agora como slot', async () => {
    const p = await derivado({
      Classe: '[[Animista]]',
      Sintonia: '[[Traço Elemental da Terra|Terra]]',
      'Nível': 3,
      Habilidades: {
        Lista: [{ '[[Essência Hidratante Adepta]]': 'Escolha.01.[[Magias Anima]]' }],
      },
    })
    expect(habs(p.derivedFm)).toContain('{"[[Essência Hidratante Adepta]]":"Slot.A"}')
  })
})
