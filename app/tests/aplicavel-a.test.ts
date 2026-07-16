// #288: o AplicavelA de uma imbuição decide se ela pode ser combinada com uma
// arma na loja. Sobre docs REAIS da vault: Imbuição Flamejante restringe a
// `Subcategoria,Arma Grupo,cac-marcial|cac-simples Tipo,corte` — então NÃO cabe
// numa Adaga (perfurante) mas cabe numa Alabarda (corte, cac-marcial).
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import {
  aplicavelPredicates,
  hostStatsFromDoc,
  isAplicavelAoHost,
  tesouroAplicavelAoItem,
} from '../src/rules/aplicavel-a'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)
const readDoc = (id: string): VaultDoc =>
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${id}.json`), 'utf8')) as VaultDoc
const byName = (name: string): VaultDoc => {
  const r = catalog.resolve(name)
  if (r.kind !== 'doc') throw new Error(`não resolveu: ${name}`)
  return readDoc(r.id)
}

describe('AplicavelA — aplicabilidade de imbuição ao host (#288)', () => {
  it('hostStatsFromDoc lê subcategoria/grupo/tipo/propriedades do FM da arma', () => {
    const h = hostStatsFromDoc(byName('Adaga'))
    expect(h.subcategoria).toBe('Arma')
    expect(h.grupo).toBe('cac-simples')
    expect(h.tipo).toBe('perfuração')
    // propriedades ficam como wikilinks CRUS (igual ao plugin) — listContainsToken
    // casa por basename ([[Arremesso|Arremesso 3]] casa [[Arremesso]]).
    expect(h.propriedades).toContain('[[Precisa]]')
    expect(h.propriedades).toContain('[[Arremesso|Arremesso 3]]')
  })

  it('Imbuição Flamejante (Tipo,corte) NÃO cabe em arma perfurante, cabe em corte', () => {
    const flamejante = byName('Imbuição Flamejante')
    // tem predicados AplicavelA de verdade
    const preds = aplicavelPredicates(flamejante)
    expect(preds).toBeTruthy()
    expect(preds!.length).toBeGreaterThan(1) // Subcategoria AND Grupo AND Tipo
    // Adaga: cac-simples (grupo OK) MAS perfuração (tipo ≠ corte) → NÃO aplica
    expect(tesouroAplicavelAoItem(flamejante, byName('Adaga'))).toBe(false)
    // Alabarda: cac-marcial + corte → aplica
    expect(tesouroAplicavelAoItem(flamejante, byName('Alabarda'))).toBe(true)
  })

  it('Imbuição Relampejante (Propriedades,Contem([[Arremesso]])) cabe em arma com Arremesso', () => {
    const relampejante = byName('Imbuição Relampejante')
    // props-contains contra propriedades CRUAS do host (não só name-contains):
    // Adaga tem [[Arremesso|Arremesso 3]] → casa por basename → aplica.
    expect(tesouroAplicavelAoItem(relampejante, byName('Adaga'))).toBe(true)
    // Alabarda (sem Arremesso) → NÃO aplica.
    expect(tesouroAplicavelAoItem(relampejante, byName('Alabarda'))).toBe(false)
  })

  it('escalares casam por IGUALDADE, não substring ("Armadura" não casa Subcategoria,Arma)', () => {
    // Blindagem contra o bug clássico "Armadura".includes("Arma"): Flamejante exige
    // Subcategoria,Arma — uma peça de Subcategoria "Armadura" NÃO pode passar.
    const flamejante = byName('Imbuição Flamejante')
    const armaduraHost = {
      subcategoria: 'Armadura',
      grupo: 'cac-marcial',
      tipo: 'corte',
      maos: null,
      propriedades: [] as string[],
      itemName: 'Peça de Armadura',
    }
    expect(isAplicavelAoHost(aplicavelPredicates(flamejante), armaduraHost)).toBe(false)
  })

  it('sem predicados AplicavelA → aplicável a qualquer host', () => {
    expect(isAplicavelAoHost(null, hostStatsFromDoc(byName('Adaga')))).toBe(true)
    expect(isAplicavelAoHost([], hostStatsFromDoc(byName('Adaga')))).toBe(true)
  })
})
