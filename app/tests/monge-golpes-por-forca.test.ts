// Report 2026-09-18 (user): "fiz um monge de FOR 3 e depois fiz mudanças pros
// atributos (Capoeirista), e continuou aparecendo ataques que não são
// aplicáveis pra monges com menos FOR." A tabela do Arte Marcial gate-ia os
// golpes por FOR mínimo (Pontos de Pressão 0 / Garra de Tigre 1 / Presas de
// Lobo 2 / Cauda de Dragão 3), mas as REGRAS concediam os quatro
// incondicionalmente — o app só materializa o que a regra diz. Fix nos DADOS
// (vault fantasia): `Condicional FOR,N Complementar Ataques.Lista [[…]]` —
// e como a projeção recomputa a cada mudança de FM, trocar atributo na ficha
// adiciona/remove os golpes na hora.
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

async function golpesDoMonge(FOR: number): Promise<string[]> {
  const fm = {
    Classe: '[[Monge]]',
    'Nível': 5,
    Atributos: { Principal: FOR >= 3 ? 'FOR' : 'AGI', FOR, AGI: 3, INT: 1, PRE: 0 },
  }
  const { projection } = await projectHeroRules(fm as Record<string, unknown>, catalog, load)
  const lista = (projection.derivedFm['Ataques'] as { Lista?: Array<Record<string, unknown>> })?.Lista ?? []
  return lista
    .map((r) => String(r['Nome'] ?? ''))
    .filter((n) => /Pontos de Pressão|Garra de Tigre|Presas de Lobo|Cauda de Dragão/.test(n))
}

describe('golpes do Monge gated por FOR (Arte Marcial)', () => {
  it('FOR 3: os quatro golpes', async () => {
    const golpes = await golpesDoMonge(3)
    expect(golpes.join(' ')).toContain('Cauda de Dragão')
    expect(golpes).toHaveLength(4)
  })
  it('FOR 1 (Capoeirista): só Pontos de Pressão e Garra de Tigre', async () => {
    const golpes = await golpesDoMonge(1)
    expect(golpes.join(' ')).toContain('Garra de Tigre')
    expect(golpes.join(' ')).not.toContain('Presas de Lobo')
    expect(golpes.join(' ')).not.toContain('Cauda de Dragão')
    expect(golpes).toHaveLength(2)
  })
  it('FOR 0: só Pontos de Pressão', async () => {
    const golpes = await golpesDoMonge(0)
    expect(golpes).toEqual(expect.arrayContaining([expect.stringContaining('Pontos de Pressão')]))
    expect(golpes).toHaveLength(1)
  })
})
