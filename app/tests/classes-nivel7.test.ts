// Report 2026-09-18 (user): "animista não ta virando no level 7 avatar —
// falta regra". A vault tinha a nota Avatar completa mas a CLASSE nunca a
// concedia (a tabela de níveis prometia; Elementos_de_Regra parava no 4).
// A varredura tabela×regras achou o MESMO buraco no Monge (Transcendente +
// Sintonia Ascendida no 7º). Fix na vault fantasia; aqui trava a concessão
// via projeção real nos dois mundos do dataset da fantasia.
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
const load = async (id: string): Promise<VaultDoc> =>
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8')) as VaultDoc

async function habilidades(classe: string, nivel: number, extra?: Record<string, unknown>): Promise<string> {
  const fm = { Classe: `[[${classe}]]`, 'Nível': nivel, Atributos: { Principal: 'PRE', FOR: 1, AGI: 2, INT: 1, PRE: 3 }, ...extra }
  const { projection } = await projectHeroRules(fm as Record<string, unknown>, catalog, load)
  const lista = (projection.derivedFm['Habilidades'] as { Lista?: unknown[] })?.Lista ?? []
  return JSON.stringify(lista)
}

describe('concessões de nível 7 (tabela da classe = regra)', () => {
  it('Animista 7 ganha [[Avatar]]; no 6 ainda não', async () => {
    expect(await habilidades('Animista', 7)).toContain('Avatar')
    expect(await habilidades('Animista', 6)).not.toContain('Avatar')
  })
  it('Monge 7 ganha Transcendente e Sintonia Ascendida; no 6 ainda não', async () => {
    const m7 = await habilidades('Monge', 7, { Atributos: { Principal: 'FOR', FOR: 3, AGI: 2, INT: 1, PRE: 0 } })
    expect(m7).toContain('Transcendente')
    expect(m7).toContain('Sintonia Ascendida')
    const m6 = await habilidades('Monge', 6, { Atributos: { Principal: 'FOR', FOR: 3, AGI: 2, INT: 1, PRE: 0 } })
    expect(m6).not.toContain('Transcendente')
  })
})

// Report a10b4d50 (2026-09-18, @thallesagm): "A defesa do Samuel Altima …
// não está sendo somado ao meu avatar. O ataque não está somando também."
// O CORPO do Avatar promete "Experiente em Ataques" e "Experiente em
// Defesa", mas o FM de regras omitia exatamente esses dois (o resto — Ímpeto
// M, Vigor/Reflexo E, Intuição M, Potência 8 — estava lá).
describe('Avatar concede Ataques E e Defesa E (report a10b4d50)', () => {
  it('nv7: Ataques e Defesa sobem pra E; nv6 ficam como eram', async () => {
    const at = { Atributos: { Principal: 'PRE', FOR: 0, AGI: 2, INT: 1, PRE: 3 } }
    const fmDe = async (nivel: number) => {
      const fm = { Classe: '[[Animista]]', 'Nível': nivel, Defesas_Resistencias: { Lista: [
        { Nome: 'Defesa', Atributo: 'AGI', Proficiencia: 'N', Bonus_Item: 0, Bonus_Especial: 0 },
        { Nome: 'Vigor', Atributo: 'FOR', Proficiencia: 'N', Bonus_Item: 0, Bonus_Especial: 0 },
        { Nome: 'Reflexo', Atributo: 'AGI', Proficiencia: 'N', Bonus_Item: 0, Bonus_Especial: 0 },
        { Nome: 'Ímpeto', Atributo: 'PRE', Proficiencia: 'N', Bonus_Item: 0, Bonus_Especial: 0 },
      ] }, ...at }
      const { projection } = await projectHeroRules(fm as Record<string, unknown>, catalog, load)
      return projection.derivedFm as Record<string, any>
    }
    const d7 = await fmDe(7)
    const defesa7 = (d7['Defesas_Resistencias']?.Lista as Array<Record<string, unknown>>).find((r) => r['Nome'] === 'Defesa')
    expect(d7['Ataques']?.Proficiencia).toBe('E')
    expect(defesa7?.['Proficiencia']).toBe('E')
    const d6 = await fmDe(6)
    const defesa6 = (d6['Defesas_Resistencias']?.Lista as Array<Record<string, unknown>>).find((r) => r['Nome'] === 'Defesa')
    expect(d6['Ataques']?.Proficiencia).toBe('A')
    expect(defesa6?.['Proficiencia']).toBe('A')
  })
})
