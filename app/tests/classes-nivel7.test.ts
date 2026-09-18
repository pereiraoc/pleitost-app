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
