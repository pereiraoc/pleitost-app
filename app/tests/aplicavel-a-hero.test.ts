// #288 (profundo / #291): o bloqueio AplicavelA no MOTOR DE REGRAS DO HERÓI —
// tesouro (imbuição/qualidade) equipado num host incompatível tem as rules
// podadas. Reusa o MESMO avaliador da loja (tesouroAplicavelAoItem) sobre docs
// REAIS da vault.
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { computeBlockedTreasures, type DocResolver } from '../src/rules/extract'
import type { IndexManifest, VaultDoc } from '../src/data/types'
import type { RulesModel } from '../src/rules/rules-model'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8')) as IndexManifest
const catalog = buildCatalog(manifest)
const readDoc = (id: string): VaultDoc =>
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8')) as VaultDoc

const resolver: DocResolver = async (name) => {
  const r = catalog.resolve(name)
  return r.kind === 'doc' ? readDoc(r.id) : null
}

/** Model mínimo: uma arma equipada com uma propriedade (imbuição). */
const modelWith = (armaNome: string, propriedade: string): RulesModel =>
  ({
    inventario: {
      armas: { lista: [{ nome: `[[${armaNome}]]`, propriedade: `[[${propriedade}]]`, categoria: null }] },
      armadura: { nome: null, propriedade: null },
      escudo: { nome: null, propriedade: null },
    },
  }) as unknown as RulesModel

describe('computeBlockedTreasures (#288 no herói)', () => {
  it('BLOQUEIA imbuição incompatível: Flamejante (Tipo,corte) numa Adaga (perfuração)', async () => {
    const blocked = await computeBlockedTreasures(modelWith('Adaga', 'Imbuição Flamejante'), resolver)
    expect(blocked.has('Imbuição Flamejante')).toBe(true)
  })

  it('NÃO bloqueia imbuição compatível: Flamejante numa Alabarda (corte, cac-marcial)', async () => {
    const blocked = await computeBlockedTreasures(modelWith('Alabarda', 'Imbuição Flamejante'), resolver)
    expect(blocked.has('Imbuição Flamejante')).toBe(false)
  })

  it('NÃO bloqueia Relampejante na Adaga (arma tem [[Arremesso]])', async () => {
    const blocked = await computeBlockedTreasures(modelWith('Adaga', 'Imbuição Relampejante'), resolver)
    expect(blocked.size).toBe(0)
  })

  it('sem propriedade equipada → nada bloqueado', async () => {
    const model = {
      inventario: {
        armas: { lista: [{ nome: '[[Adaga]]', propriedade: null, categoria: null }] },
        armadura: { nome: null, propriedade: null },
        escudo: { nome: null, propriedade: null },
      },
    } as unknown as RulesModel
    expect((await computeBlockedTreasures(model, resolver)).size).toBe(0)
  })
})
