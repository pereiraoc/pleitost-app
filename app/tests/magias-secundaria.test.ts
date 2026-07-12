// Bug #4 (parte 2, o caso REAL do Multiclasss): essências MENORES (classe
// secundária, via [[Treinamento de Animista]]) concedem magias com
// `Complementar Magias.Secundaria.Lista [[X]]` — e a cadeia Magias.Secundaria
// inteira não existia no app (applier sem fonte por item, merge sem handlers,
// projeção sem distribuição por escola). O char novo escolhia as essências e
// nada aparecia. Espelho de: rule-target-registry resolveMagiasSecundaria +
// merge/serialize da Secundaria + enrichMagias (plugin).
import { beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import type { IndexManifest, VaultDoc } from '../src/data/types'
import { projectHeroRules } from '../src/rules/useHeroRules'
import { emptyHeroFrontmatter } from '../src/data/local-entities'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
const catalog = buildCatalog(manifest)
const loadFromDisk = async (id: string): Promise<VaultDoc> =>
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8')) as VaultDoc

/** Char criado NO APP (Multiclasss): Guerreiro nível 1, técnica Treinamento de
 *  Classe Secundária cuja escolha pegou [[Treinamento de Animista]], e uma
 *  essência Menor escolhida na escolha do Treinamento. */
function multiclassFm(): Record<string, unknown> {
  const fm = emptyHeroFrontmatter() as any
  fm.Classe = '[[Guerreiro]]'
  fm.Tecnicas.Lista = [{ '[[Treinamento de Classe Secundária]]': 'Slot.A' }]
  fm.Habilidades.Lista = [
    { '[[Treinamento de Animista]]': 'Escolha.01.[[Treinamento de Classe Secundária]]' },
    { '[[Essência Flamejante Menor]]': 'Escolha.01.[[Treinamento de Animista]]' },
  ]
  return fm
}

function escolaSec(derivedFm: any, nome: string): any {
  return ((derivedFm.Magias?.Secundaria?.Lista ?? []) as any[]).find((g) => g?.Nome === nome)
}

let derivedFm: any
beforeAll(async () => {
  const out = await projectHeroRules(multiclassFm(), catalog, loadFromDisk)
  derivedFm = out.projection.derivedFm
})

describe('Magias.Secundaria: cadeia completa (char multiclass criado no app)', () => {
  it('escalares da Secundária aplicam (Proficiencia A, Atributo PRE, Potencia 3, EM 2)', () => {
    const anima = escolaSec(derivedFm, 'Anima')
    expect(anima).toBeTruthy()
    expect(String(anima.Proficiencia)).toBe('A')
    expect(String(anima.Atributo)).toBe('PRE')
    expect(Number(derivedFm.Magias.Secundaria.Potencia)).toBe(3)
    expect(Number(derivedFm.Magias.Secundaria.EM)).toBe(2)
  })

  it('as magias da essência Menor entram em Magias.Secundaria.Lista.Anima', () => {
    const anima = escolaSec(derivedFm, 'Anima')
    const alvos = (anima?.Lista ?? []).map((row: any) => Object.keys(row)[0])
    // Essência Flamejante Menor: Complementar Magias.Secundaria.Lista
    // [[Raio Flamejante]] + [[Cone de Fogo]]
    expect(alvos).toContain('[[Raio Flamejante]]')
    expect(alvos).toContain('[[Cone de Fogo]]')
  })

  it('cada magia carrega a fonte da essência (Regra.[[Essência Flamejante Menor]])', () => {
    const anima = escolaSec(derivedFm, 'Anima')
    const raio = (anima?.Lista ?? []).find((row: any) => Object.keys(row)[0] === '[[Raio Flamejante]]')
    expect(raio).toBeTruthy()
    expect(String(Object.values(raio)[0])).toBe('Regra.[[Essência Flamejante Menor]]')
  })

  it('a PRIMÁRIA fica intocada (magias da essência Menor NÃO vazam pra Magias.Lista)', () => {
    const animaPrim = ((derivedFm.Magias?.Lista ?? []) as any[]).find((g) => g?.Nome === 'Anima')
    const alvos = (animaPrim?.Lista ?? []).map((row: any) => Object.keys(row)[0])
    expect(alvos).not.toContain('[[Raio Flamejante]]')
  })
})
