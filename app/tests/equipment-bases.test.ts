// Issue #63: as bases de armadura/escudo dos dropdowns vêm dos DOCS REAIS da
// vault (pastas Sistema/Equipamento/{Armaduras,Escudos}), não de strings
// hardcodadas. Integração sobre o índice REAL da vault + expectativas
// recomputadas AQUI a partir dos JSONs (independentes do código do módulo).
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCatalog } from '../src/data/catalog'
import { armaduraBases, escudoBases, SEM_ESCUDO } from '../src/components/ficha/equipment-bases'
import type { IndexManifest, VaultDoc } from '../src/data/types'

const appDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const vaultDataDir = path.join(path.dirname(appDir), 'vault-data')
const manifest = JSON.parse(
  fs.readFileSync(path.join(vaultDataDir, 'index.json'), 'utf8'),
) as IndexManifest
const catalog = buildCatalog(manifest)
const readJson = (rel: string) =>
  JSON.parse(fs.readFileSync(path.join(vaultDataDir, `${rel}.json`), 'utf8')) as VaultDoc

describe('#63: bases de escudo derivadas da pasta Escudos', () => {
  it('lista "Sem Escudo" + os docs REAIS (Broquel, Escudo) — nunca Leve/Pesado', () => {
    const docs = manifest.docs
      .filter((d) => d.id.startsWith('Sistema/Equipamento/Escudos/') && d.subtype === 'Escudo')
      .map((d) => d.basename!)
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
    // sanity dos fixtures: a vault tem exatamente Broquel e Escudo
    expect(docs).toEqual(['Broquel', 'Escudo'])

    const bases = escudoBases(catalog)
    expect(bases).toEqual([SEM_ESCUDO, ...docs])
    expect(bases).toContain('Broquel')
    expect(bases).toContain('Escudo')
    expect(bases).not.toContain('Escudo Leve')
    expect(bases).not.toContain('Escudo Pesado')
  })

  it('os docs reais carregam os inline fields de bonus-defesa/dureza/danos', () => {
    // valores REAIS da vault (fonte de verdade da mecânica do escudo)
    const broquel = readJson('Sistema/Equipamento/Escudos/Broquel')
    expect(broquel.inlineFields['bonus-defesa']).toBe('1')
    expect(broquel.inlineFields['dureza']).toBe('2')
    expect(broquel.inlineFields['danos']).toBe('4')
    const escudo = readJson('Sistema/Equipamento/Escudos/Escudo')
    expect(escudo.inlineFields['bonus-defesa']).toBe('2')
    expect(escudo.inlineFields['dureza']).toBe('4')
    expect(escudo.inlineFields['danos']).toBe('4')
  })
})

describe('#63: bases de armadura derivadas da pasta Armaduras', () => {
  it('lista os docs REAIS na ordem Sem → Leve → Pesada', () => {
    const bases = armaduraBases(catalog)
    expect(bases).toEqual(['Sem Armadura', 'Armadura Leve', 'Armadura Pesada'])
    // toda base é um doc real da pasta (resolve pro catálogo)
    for (const b of bases) {
      const res = catalog.resolve(b)
      expect(res.kind, `"${b}" resolve pro doc`).toBe('doc')
    }
  })
})
